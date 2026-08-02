-- Travel Buddy database schema
-- Run this in your Supabase project's SQL Editor (Project -> SQL Editor -> New query).

-- ─────────────────────────────────────────────────────────────
-- Personal data: one row per (user, key). Holds saved places,
-- recent views, and settings — exactly what used to live in
-- localStorage, now scoped to a real logged-in user.
-- ─────────────────────────────────────────────────────────────
create table if not exists user_data (
  user_id uuid not null references auth.users(id) on delete cascade,
  data_key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, data_key)
);

alter table user_data enable row level security;

-- A user can only ever read/write/delete their OWN rows.
-- This is what makes it impossible for one traveler to see another's
-- saved places, even though everyone shares the same table.
create policy "select own data" on user_data
  for select using (auth.uid() = user_id);
create policy "insert own data" on user_data
  for insert with check (auth.uid() = user_id);
create policy "update own data" on user_data
  for update using (auth.uid() = user_id);
create policy "delete own data" on user_data
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Shared cache: AI-generated place guides, nearby-radar results,
-- and translations. Not personal — the same landmark guide is
-- reused across every traveler instead of being re-generated
-- (and re-billed) per user. Any signed-in user can read/write it.
-- ─────────────────────────────────────────────────────────────
create table if not exists shared_cache (
  cache_key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table shared_cache enable row level security;

create policy "signed-in users can read cache" on shared_cache
  for select using (auth.role() = 'authenticated');
create policy "signed-in users can write cache" on shared_cache
  for insert with check (auth.role() = 'authenticated');
create policy "signed-in users can refresh cache" on shared_cache
  for update using (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────
-- Admin access: as the project owner, you can view/search every
-- row in every table above — including every user's saved places —
-- from Supabase Studio (Table Editor) or the SQL Editor. Row Level
-- Security applies to the app's anon-key client only; it does not
-- restrict you in the dashboard, which is what makes it your admin
-- panel. See README.md for details.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- AI usage tracking: one row per (user, day), incremented by
-- /api/claude on every genuine AI call (cache misses only — most
-- app usage never touches this). Used to enforce a real per-user
-- daily cap (DAILY_AI_LIMIT_PER_USER), independent of the in-memory
-- rate limiter, so it survives serverless cold starts.
-- ─────────────────────────────────────────────────────────────
create table if not exists ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);

alter table ai_usage enable row level security;

create policy "select own usage" on ai_usage
  for select using (auth.uid() = user_id);
create policy "insert own usage" on ai_usage
  for insert with check (auth.uid() = user_id);
create policy "update own usage" on ai_usage
  for update using (auth.uid() = user_id);

-- Helpful for the Refresh Memory endpoint, which scans shared_cache by
-- staleness (oldest first) to decide what to regenerate.
create index if not exists shared_cache_updated_at_idx on shared_cache(updated_at);
