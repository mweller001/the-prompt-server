-- The Prompt Server — schema.sql — v0.1.0 (version dates last real change)
-- prompt_sends: Stage-0 transport instrumentation.
-- One row per fired prompt. delta_seconds = opened_at - sent_at (round-trip latency).
-- Run this in the Supabase SQL editor.

create table if not exists prompt_sends (
  id           uuid primary key default gen_random_uuid(),
  label        text,
  sent_at      timestamptz not null,
  opened_at    timestamptz,
  delta_seconds double precision,
  created_at   timestamptz not null default now()
);

-- Allow the anon key (used by the sender script and the ping/review pages) to
-- insert, read, and update rows. This table holds no sensitive data — just timing.
alter table prompt_sends enable row level security;

create policy "anon can insert sends" on prompt_sends
  for insert to anon with check (true);

create policy "anon can read sends" on prompt_sends
  for select to anon using (true);

create policy "anon can update sends" on prompt_sends
  for update to anon using (true) with check (true);

-- Later (rolling-window cleanup, deferred): a scheduled job to prune old rows, e.g.
--   delete from prompt_sends where sent_at < now() - interval '30 days';
-- run nightly via pg_cron / an edge function. Logs get a horizon, not an archive.
