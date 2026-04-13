// inject-env.js — runs at Netlify build time
// Replaces __SUPABASE_URL__ and __SUPABASE_ANON_KEY__ placeholders in app.js
const fs   = require('fs');
const path = require('path');

const file = path.join(__dirname, 'app.js');
let   src  = fs.readFileSync(file, 'utf8');

const url = process.env.SUPABASE_URL      || '';
const key = process.env.SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.warn('⚠️  SUPABASE_URL or SUPABASE_ANON_KEY not set — app will not connect to a database.');
}

src = src
  .replace("window.__SUPABASE_URL__      || ''", `'${url}'`)
  .replace("window.__SUPABASE_ANON_KEY__ || ''", `'${key}'`);

fs.writeFileSync(file, src);
console.log('✅  Environment variables injected into app.js');
