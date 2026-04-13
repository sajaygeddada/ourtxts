// ── CONFIG ──────────────────────────────────────────────────────────────────
// These are replaced by Netlify environment variables at build time
// Set SUPABASE_URL and SUPABASE_ANON_KEY in Netlify → Site Settings → Environment
const SUPABASE_URL      = window.__SUPABASE_URL__      || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY__ || '';

// ── INIT ─────────────────────────────────────────────────────────────────────
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let ME = null;          // { id, username, display_name }
let contacts = [];      // array of profile objects + { last_msg, last_time, unread }
let active = null;      // currently open contact
let msgsCache = {};     // { [contactId]: [...messages] }
let rtChannel = null;

// ── BOOT ─────────────────────────────────────────────────────────────────────
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await bootApp(session.user);
})();

// ── AUTH ─────────────────────────────────────────────────────────────────────
function switchTab(t) {
  document.getElementById('form-in').style.display = t === 'in' ? 'block' : 'none';
  document.getElementById('form-up').style.display = t === 'up' ? 'block' : 'none';
  document.getElementById('tab-in').classList.toggle('active', t === 'in');
  document.getElementById('tab-up').classList.toggle('active', t === 'up');
  setAuthMsg('');
}

async function doLogin() {
  const email = v('in-email'), pass = v('in-pass');
  if (!email || !pass) return setAuthMsg('Fill in all fields.', 'err');
  setAuthMsg('Signing in…');
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) return setAuthMsg(error.message, 'err');
  await bootApp(data.user);
}

async function doSignup() {
  const name  = v('up-name').trim();
  const uname = v('up-uname').trim();
  const email = v('up-email').trim();
  const pass  = v('up-pass');
  if (!name || !uname || !email || !pass) return setAuthMsg('All fields are required.', 'err');
  if (uname.length < 3) return setAuthMsg('Username must be at least 3 characters.', 'err');
  if (pass.length < 6)  return setAuthMsg('Password must be at least 6 characters.', 'err');
  setAuthMsg('Creating account…');
  // Check username availability
  const { data: existing } = await sb.from('profiles').select('id').eq('username', uname).single();
  if (existing) return setAuthMsg('Username taken, try another.', 'err');
  const { data, error } = await sb.auth.signUp({ email, password: pass });
  if (error) return setAuthMsg(error.message, 'err');
  // Insert profile
  await sb.from('profiles').insert({ id: data.user.id, username: uname, display_name: name });
  setAuthMsg('Account created! Signing you in…', 'ok');
  setTimeout(() => doLogin(), 800);
  document.getElementById('in-email').value = email;
  document.getElementById('in-pass').value  = pass;
}

async function doLogout() {
  if (rtChannel) sb.removeChannel(rtChannel);
  await sb.auth.signOut();
  ME = null; contacts = []; active = null; msgsCache = {};
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('chat-view').style.display = 'none';
  document.getElementById('chat-empty').style.display = 'flex';
}

// ── BOOT APP ─────────────────────────────────────────────────────────────────
async function bootApp(user) {
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (!profile) { setAuthMsg('Profile missing. Please sign up.', 'err'); return; }
  ME = profile;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('s-avatar').textContent    = ME.display_name.charAt(0).toUpperCase();
  document.getElementById('chip-name').textContent   = ME.display_name;
  document.getElementById('chip-id').textContent     = '@' + ME.username;
  document.getElementById('my-id-badge').textContent = '@' + ME.username;
  await loadContacts();
  subscribeRealtime();
}

// ── CONTACTS ─────────────────────────────────────────────────────────────────
function getSavedIds() {
  try { return JSON.parse(localStorage.getItem('cc_contacts_' + ME.id)) || []; } catch { return []; }
}
function saveId(uid) {
  const arr = getSavedIds();
  if (!arr.includes(uid)) { arr.push(uid); localStorage.setItem('cc_contacts_' + ME.id, JSON.stringify(arr)); }
}

async function loadContacts() {
  const ids = getSavedIds();
  if (!ids.length) { renderContacts(); return; }
  const { data: profiles } = await sb.from('profiles').select('*').in('id', ids);
  contacts = (profiles || []).map(p => ({ ...p, last_msg: '', last_time: null, unread: 0 }));
  // Fetch last message for each contact
  await Promise.all(contacts.map(async c => {
    const { data } = await sb.from('messages')
      .select('content,created_at,from_id')
      .or(`and(from_id.eq.${ME.id},to_id.eq.${c.id}),and(from_id.eq.${c.id},to_id.eq.${ME.id})`)
      .order('created_at', { ascending: false })
      .limit(1);
    if (data?.[0]) { c.last_msg = data[0].content; c.last_time = data[0].created_at; }
  }));
  sortContacts();
  renderContacts();
}

function sortContacts() {
  contacts.sort((a, b) => (b.last_time || '') > (a.last_time || '') ? 1 : -1);
}

function avColor(id) {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 8;
  return 'av' + h;
}

function renderContacts(filter = '') {
  const el = document.getElementById('contacts-list');
  const list = filter
    ? contacts.filter(c =>
        c.display_name.toLowerCase().includes(filter.toLowerCase()) ||
        c.username.toLowerCase().includes(filter.toLowerCase()))
    : contacts;

  if (!list.length) {
    el.innerHTML = `<div class="no-contacts">
      <div class="nc-icon">👋</div>
      No chats yet.<br>Tap the <strong>chat icon</strong> above to start a new conversation.
    </div>`;
    return;
  }

  el.innerHTML = list.map(c => {
    const isActive = active?.id === c.id;
    return `<div class="contact-row${isActive ? ' active' : ''}" onclick="openChat('${c.id}')">
      <div class="c-av ${avColor(c.id)}">${c.display_name.charAt(0).toUpperCase()}</div>
      <div class="c-info">
        <div class="c-name">${esc(c.display_name)}</div>
        <div class="c-prev">${esc(c.last_msg || 'Tap to start chatting')}</div>
      </div>
      <div class="c-meta">
        <div class="c-time">${c.last_time ? fmtTime(c.last_time) : ''}</div>
        ${c.unread ? `<div class="c-badge">${c.unread}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function filterList(q) { renderContacts(q); }

// ── OPEN CHAT ────────────────────────────────────────────────────────────────
async function openChat(uid) {
  active = contacts.find(c => c.id === uid);
  if (!active) return;
  active.unread = 0;

  // update header
  const av = document.getElementById('ct-av');
  av.textContent  = active.display_name.charAt(0).toUpperCase();
  av.className    = `ct-av ${avColor(active.id)}`;
  document.getElementById('ct-name').textContent = active.display_name;
  document.getElementById('ct-sub').textContent  = '@' + active.username;

  document.getElementById('chat-empty').style.display    = 'none';
  document.getElementById('chat-view').style.display     = 'flex';
  document.getElementById('layout').classList.add('chat-open');
  renderContacts();

  // Load messages
  if (!msgsCache[uid]) await fetchMsgs(uid);
  renderMsgs(uid);
  document.getElementById('msg-input').focus();
}

function closeChat() {
  active = null;
  document.getElementById('chat-view').style.display  = 'none';
  document.getElementById('chat-empty').style.display = 'flex';
  document.getElementById('layout').classList.remove('chat-open');
  renderContacts();
}

// ── MESSAGES ─────────────────────────────────────────────────────────────────
async function fetchMsgs(uid) {
  const { data } = await sb.from('messages')
    .select('*')
    .or(`and(from_id.eq.${ME.id},to_id.eq.${uid}),and(from_id.eq.${uid},to_id.eq.${ME.id})`)
    .order('created_at', { ascending: true });
  msgsCache[uid] = data || [];
}

function renderMsgs(uid) {
  const msgs = msgsCache[uid] || [];
  const el   = document.getElementById('msgs');

  if (!msgs.length) {
    el.innerHTML = `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--t3);font-size:13px">
      No messages yet — say hi! 👋
    </div>`;
    return;
  }

  let lastDate = '', html = '';
  msgs.forEach(m => {
    const d  = new Date(m.created_at);
    const ds = d.toLocaleDateString('en-IN', { weekday:'long', month:'short', day:'numeric' });
    if (ds !== lastDate) {
      html += `<div class="date-sep"><span>${ds}</span></div>`;
      lastDate = ds;
    }
    const isMe = m.from_id === ME.id;
    const t    = d.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
    html += `<div class="msg-row ${isMe ? 'me' : 'them'}">
      <div class="bub">
        <div class="bub-text">${esc(m.content).replace(/\n/g, '<br>')}</div>
        <div class="bub-foot">
          <span class="bub-time">${t}</span>
          ${isMe ? '<span class="bub-tick">✓✓</span>' : ''}
        </div>
      </div>
    </div>`;
  });

  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

async function sendMsg() {
  const inp  = document.getElementById('msg-input');
  const text = inp.value.trim();
  if (!text || !active) return;
  inp.value = ''; inp.style.height = 'auto';

  const { data, error } = await sb.from('messages')
    .insert({ from_id: ME.id, to_id: active.id, content: text })
    .select()
    .single();
  if (error) { console.error(error); return; }

  if (!msgsCache[active.id]) msgsCache[active.id] = [];
  msgsCache[active.id].push(data);
  renderMsgs(active.id);

  // update preview
  const c = contacts.find(c => c.id === active.id);
  if (c) { c.last_msg = text; c.last_time = data.created_at; }
  sortContacts(); renderContacts();
}

function handleKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }
function growInput(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; }

// ── REALTIME ─────────────────────────────────────────────────────────────────
function subscribeRealtime() {
  rtChannel = sb.channel('global-msgs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
      const msg = payload.new;
      if (msg.to_id !== ME.id && msg.from_id !== ME.id) return;
      const otherId = msg.from_id === ME.id ? msg.to_id : msg.from_id;

      // Auto-add unknown sender
      if (!contacts.find(c => c.id === otherId)) {
        const { data: p } = await sb.from('profiles').select('*').eq('id', otherId).single();
        if (p) { saveId(p.id); contacts.push({ ...p, last_msg: '', last_time: null, unread: 0 }); }
      }

      const c = contacts.find(c => c.id === otherId);
      if (c) {
        c.last_msg  = msg.content;
        c.last_time = msg.created_at;
        if (msg.from_id !== ME.id && active?.id !== otherId) c.unread = (c.unread || 0) + 1;
      }

      if (!msgsCache[otherId]) msgsCache[otherId] = [];
      msgsCache[otherId].push(msg);

      if (active?.id === otherId) renderMsgs(otherId);
      sortContacts(); renderContacts();
    })
    .subscribe();
}

// ── NEW CHAT MODAL ────────────────────────────────────────────────────────────
function openNewChat()  { document.getElementById('nc-overlay').classList.add('open'); document.getElementById('nc-input').value = ''; document.getElementById('nc-msg').textContent = ''; setTimeout(() => document.getElementById('nc-input').focus(), 100); }
function closeNewChat() { document.getElementById('nc-overlay').classList.remove('open'); }

async function startChat() {
  const uname = document.getElementById('nc-input').value.trim();
  const msgEl = document.getElementById('nc-msg');
  if (!uname) return;
  if (uname === ME.username) { msgEl.textContent = "That's you! 😄"; msgEl.className = 'auth-msg err'; return; }
  msgEl.textContent = 'Searching…'; msgEl.className = 'auth-msg';
  const { data } = await sb.from('profiles').select('*').eq('username', uname).single();
  if (!data) { msgEl.textContent = 'User not found. Check the username.'; msgEl.className = 'auth-msg err'; return; }
  saveId(data.id);
  if (!contacts.find(c => c.id === data.id)) contacts.push({ ...data, last_msg: '', last_time: null, unread: 0 });
  renderContacts();
  closeNewChat();
  openChat(data.id);
}

// ── MY ID MODAL ───────────────────────────────────────────────────────────────
function showMyId()  { document.getElementById('id-overlay').classList.add('open'); }
function closeMyId() { document.getElementById('id-overlay').classList.remove('open'); }
function copyId() {
  navigator.clipboard.writeText(ME.username).then(() => {
    document.getElementById('copy-msg').textContent = 'Copied to clipboard!';
    setTimeout(() => document.getElementById('copy-msg').textContent = '', 2000);
  });
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function v(id)    { return document.getElementById(id)?.value || ''; }
function esc(s)   { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function setAuthMsg(msg, type = '') {
  const el = document.getElementById('auth-msg');
  el.textContent = msg; el.className = 'auth-msg' + (type ? ' ' + type : '');
}
function fmtTime(ts) {
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const diff = (now - d) / 86400000;
  if (diff < 7) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
