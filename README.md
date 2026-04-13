# 🔐 Cipher Chat

A private, real-time messaging app. WhatsApp-style UI, hosted on Netlify, powered by Supabase.

**One URL. Anyone can sign up. Messages sync across all devices in real time.**

---

## 🚀 Deploy in 10 minutes (free)

### Step 1 — Supabase (database + auth)

1. Go to [supabase.com](https://supabase.com) → **New Project** (free tier)
2. Wait for it to spin up (~2 min)
3. Go to **SQL Editor → New Query**, paste the contents of `supabase-setup.sql` and click **Run**
4. Go to **Database → Replication** and enable the `messages` table for realtime
5. Go to **Project Settings → API** and copy:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon public** key → `eyJhbG...`

---

### Step 2 — GitHub

1. Create a new repo at [github.com](https://github.com/new) (can be private)
2. Push this folder:

```bash
cd cipher-chat
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

---

### Step 3 — Netlify

1. Go to [netlify.com](https://netlify.com) → **Add new site → Import from Git**
2. Connect GitHub and select your repo
3. Build settings are auto-detected from `netlify.toml` (build command: `npm run build`)
4. Before deploying, go to **Site Settings → Environment Variables** and add:

| Key                | Value                        |
|--------------------|------------------------------|
| `SUPABASE_URL`     | `https://xxxx.supabase.co`   |
| `SUPABASE_ANON_KEY`| `eyJhbG...` (your anon key)  |

5. Click **Deploy site** — done! 🎉

Your app will be live at `https://your-app-name.netlify.app`

---

## 📱 How to use

1. Share the URL with anyone you want to chat with
2. Each person creates their own account with a unique **@username**
3. To start a chat: tap the **chat icon** → enter the other person's @username
4. Messages are real-time and stored permanently in Supabase

---

## 🗂 Project structure

```
cipher-chat/
├── index.html          # App shell + auth UI
├── style.css           # All styles
├── app.js              # All logic (auth, contacts, messaging, realtime)
├── inject-env.js       # Build script — injects Supabase keys
├── netlify.toml        # Netlify build config
├── supabase-setup.sql  # Run once in Supabase SQL editor
└── package.json        # Build script runner
```

---

## 🔒 Security

- Row Level Security (RLS) on all tables — users can only read their own messages
- Supabase anon key is public-safe (RLS enforces all access control)
- No messages visible to anyone except sender and recipient

---

## ✨ Features

- Real-time messaging (Supabase Realtime)
- Persistent message history (never lost)
- Multi-user: anyone can sign up
- WhatsApp-style UI — sidebar, last message preview, timestamps, unread badges
- Username-based contact discovery
- Works on mobile (responsive)
- Double tick on sent messages
