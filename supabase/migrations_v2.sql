-- ==============================================================================
-- TaskFlow Safe Incremental Idempotent Migrations (v2)
-- Run this in your Supabase SQL Editor.
-- Does NOT drop or recreate existing tables. Existing records remain 100% intact.
-- ==============================================================================

-- 1. Tasks Enhancements (Kanban & Productivity Analytics)
alter table public.tasks add column if not exists status text not null default 'todo';
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists position integer default 0;

-- Backfill existing tasks safely:
update public.tasks
set status = case when completed then 'completed' else 'todo' end
where status = 'todo' and completed = true;

update public.tasks
set completed_at = created_at
where completed = true and completed_at is null;

-- 2. Advanced Placement Pipeline: Individual Assessment & Interview Rounds Table
create table if not exists public.application_rounds (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  round_type text not null default 'Online Assessment',
  round_name text not null default '',
  scheduled_at timestamptz,
  platform text default '',
  meeting_link text default '',
  interviewer text default '',
  status text not null default 'Scheduled',
  score text default '',
  feedback text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.application_rounds add column if not exists interviewer text default '';

-- 3. DSA and LeetCode Problem Tracker Table
create table if not exists public.dsa_problems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  platform text not null default 'LeetCode',
  problem_url text default '',
  difficulty text not null default 'Medium' check (difficulty in ('Easy', 'Medium', 'Hard')),
  topic text not null default 'Arrays',
  status text not null default 'To Do' check (status in ('To Do', 'Attempted', 'Solved', 'Revisit', 'Need Revision')),
  time_spent_minutes integer default 0,
  solved_at timestamptz,
  notes text default '',
  code_snippet text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure 'Revisit' status is permitted on existing dsa_problems table
alter table public.dsa_problems drop constraint if exists dsa_problems_status_check;
alter table public.dsa_problems add constraint dsa_problems_status_check check (status in ('To Do', 'Attempted', 'Solved', 'Revisit', 'Need Revision'));

-- 4. Browser Push Subscriptions Table
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  user_agent text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_user_endpoint_uniq unique (user_id, endpoint)
);

-- Enable Row Level Security (RLS) on new tables
alter table public.application_rounds enable row level security;
alter table public.dsa_problems enable row level security;
alter table public.push_subscriptions enable row level security;

-- Idempotent RLS policies
drop policy if exists "Users manage own application rounds" on public.application_rounds;
create policy "Users manage own application rounds" on public.application_rounds
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own dsa problems" on public.dsa_problems;
create policy "Users manage own dsa problems" on public.dsa_problems
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Performance Indexes
create index if not exists application_rounds_app_idx on public.application_rounds(application_id);
create index if not exists application_rounds_user_idx on public.application_rounds(user_id, scheduled_at);
create index if not exists dsa_problems_user_idx on public.dsa_problems(user_id, status, difficulty);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
