-- Pro time earned from streak milestones.
--
-- Run this once in the Supabase SQL editor.
--
-- Why a separate table instead of a column on user_stats: the browser writes
-- user_stats directly (RLS lets you write your own row), so anything stored
-- there is self-grantable. This table has RLS ON and NO policies, which means
-- the anon key can't read or write it at all — only the service-role key, which
-- never leaves the server. Users see their grant through /api/streak/claim.

create table if not exists public.pro_grants (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  -- Pro is active while this is in the future.
  pro_until         timestamptz not null,
  -- Highest streak milestone already paid. Each one pays ONCE, ever.
  highest_milestone integer not null default 0,
  updated_at        timestamptz not null default now()
);

alter table public.pro_grants enable row level security;

-- Deliberately no policies. Service role bypasses RLS; everyone else is denied.

-- Lets isUserPro() answer "is anyone's grant still live" cheaply.
create index if not exists pro_grants_pro_until_idx
  on public.pro_grants (pro_until);
