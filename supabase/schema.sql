-- Run this in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text default '',
  category text not null default 'Personal',
  priority text not null default 'Medium' check (priority in ('Low','Medium','High')),
  due_at timestamptz,
  reminder_at timestamptz,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  role text not null,
  job_type text default 'Full-time',
  applied_at date,
  job_url text default '',
  status text not null default 'Applied',
  package_lpa numeric,
  next_step text default '',
  notes text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_type text not null default 'Reminder',
  starts_at timestamptz not null,
  reminder_at timestamptz,
  application_id uuid references public.applications(id) on delete set null,
  notes text default '',
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
alter table public.applications enable row level security;
alter table public.events enable row level security;

drop policy if exists "Users manage own tasks" on public.tasks;
create policy "Users manage own tasks" on public.tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own applications" on public.applications;
create policy "Users manage own applications" on public.applications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users manage own events" on public.events;
create policy "Users manage own events" on public.events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists tasks_user_due_idx on public.tasks(user_id, due_at);
create index if not exists applications_user_status_idx on public.applications(user_id, status);
create index if not exists events_user_starts_idx on public.events(user_id, starts_at);
