-- ═══════════════════════════════════════════════════
--  CIPHER CHAT — Supabase SQL Setup
--  Run this in: Supabase → SQL Editor → New Query
-- ═══════════════════════════════════════════════════

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     text unique not null,
  display_name text not null,
  created_at   timestamptz default now()
);

-- 2. MESSAGES TABLE
create table if not exists public.messages (
  id         uuid default gen_random_uuid() primary key,
  from_id    uuid not null references public.profiles(id) on delete cascade,
  to_id      uuid not null references public.profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz default now()
);

-- 3. ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.messages  enable row level security;

-- Profiles: anyone logged in can read all profiles (needed for username search)
create policy "profiles_select" on public.profiles
  for select using (auth.role() = 'authenticated');

-- Profiles: users can only update their own
create policy "profiles_insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id);

-- Messages: users can only read their own messages
create policy "messages_select" on public.messages
  for select using (auth.uid() = from_id or auth.uid() = to_id);

-- Messages: users can only send as themselves
create policy "messages_insert" on public.messages
  for insert with check (auth.uid() = from_id);

-- 4. REALTIME (enable for messages table)
-- Go to Supabase → Database → Replication → enable "messages" table

-- 5. INDEX for fast message queries
create index if not exists idx_messages_conversation
  on public.messages (from_id, to_id, created_at);
