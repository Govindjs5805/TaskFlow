-- Scheduled Web Push reminder delivery.
-- Idempotent and additive: adds delivery tracking and one named cron job.
-- No existing reminder or subscription rows are updated or deleted.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.scheduled_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('task', 'event', 'round')),
  source_id uuid not null,
  scheduled_for timestamptz not null,
  status text not null default 'processing'
    check (status in ('processing', 'retry_wait', 'delivered', 'failed')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  locked_at timestamptz,
  retry_after timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_reminder_deliveries_dedupe_key
    unique (user_id, source_type, source_id, scheduled_for),
  constraint scheduled_reminder_deliveries_id_user_key unique (id, user_id)
);

create table if not exists public.scheduled_reminder_delivery_devices (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  push_subscription_id uuid not null,
  status text not null default 'processing'
    check (status in ('processing', 'retry_wait', 'delivered', 'failed', 'expired')),
  attempt_count integer not null default 1 check (attempt_count > 0),
  locked_at timestamptz,
  retry_after timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scheduled_reminder_delivery_devices_unique
    unique (delivery_id, push_subscription_id),
  constraint scheduled_reminder_delivery_devices_owner_fk
    foreign key (delivery_id, user_id)
    references public.scheduled_reminder_deliveries(id, user_id) on delete cascade
);

alter table public.scheduled_reminder_deliveries enable row level security;
alter table public.scheduled_reminder_delivery_devices enable row level security;
revoke all on table public.scheduled_reminder_deliveries from public, anon, authenticated;
revoke all on table public.scheduled_reminder_delivery_devices from public, anon, authenticated;
grant all on table public.scheduled_reminder_deliveries to service_role;
grant all on table public.scheduled_reminder_delivery_devices to service_role;

create index if not exists scheduled_reminder_deliveries_retry_idx
  on public.scheduled_reminder_deliveries(status, retry_after, locked_at);
create index if not exists scheduled_reminder_delivery_devices_retry_idx
  on public.scheduled_reminder_delivery_devices(delivery_id, status, retry_after, locked_at);
create index if not exists tasks_reminder_at_pending_idx
  on public.tasks(reminder_at) where completed = false and reminder_at is not null;
create index if not exists tasks_due_at_without_reminder_pending_idx
  on public.tasks(due_at) where completed = false and reminder_at is null;
create index if not exists events_reminder_at_idx
  on public.events(reminder_at) where reminder_at is not null;
create index if not exists events_starts_at_without_reminder_idx
  on public.events(starts_at) where reminder_at is null;
create index if not exists application_rounds_scheduled_pending_idx
  on public.application_rounds(scheduled_at)
  where scheduled_at is not null and status not in ('Cleared', 'Rejected', 'Waived');

create or replace function public.claim_due_scheduled_reminders(p_limit integer default 1)
returns table (
  delivery_id uuid,
  user_id uuid,
  source_type text,
  source_id uuid,
  scheduled_for timestamptz,
  database_now timestamptz,
  title text,
  body text,
  app_path text,
  completed boolean,
  round_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;

  return query
  with bounds as materialized (
    select clock_timestamp() as now_at
  ), candidates as (
    select
      'task'::text as source_type,
      t.id as source_id,
      t.user_id,
      t.reminder_at as scheduled_for,
      b.now_at as database_now,
      left('Task Reminder: ' || t.title, 80) as title,
      left(concat_ws(' · ',
        coalesce(t.priority, 'Medium') || ' priority',
        'Category: ' || coalesce(t.category, 'Personal'),
        nullif(t.description, '')
      ), 240) as body,
      '/#tasks'::text as app_path,
      t.completed,
      null::text as round_status
    from public.tasks t
    cross join bounds b
    where t.completed is false
      and t.reminder_at is not null
      and t.reminder_at between b.now_at - interval '5 minutes'
                            and b.now_at + interval '10 minutes'

    union all

    select
      'task'::text,
      t.id,
      t.user_id,
      t.due_at,
      b.now_at,
      left('Task Reminder: ' || t.title, 80),
      left(concat_ws(' · ',
        coalesce(t.priority, 'Medium') || ' priority',
        'Category: ' || coalesce(t.category, 'Personal'),
        nullif(t.description, '')
      ), 240),
      '/#tasks'::text,
      t.completed,
      null::text
    from public.tasks t
    cross join bounds b
    where t.completed is false
      and t.reminder_at is null
      and t.due_at between b.now_at - interval '5 minutes'
                       and b.now_at + interval '10 minutes'

    union all

    select
      'event'::text,
      e.id,
      e.user_id,
      e.reminder_at,
      b.now_at,
      left('Event Reminder: ' || e.title, 80),
      left(concat_ws(' · ',
        coalesce(e.event_type, 'Event'),
        'Scheduled for ' || to_char(e.starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
        nullif(e.notes, '')
      ), 240),
      '/#reminders'::text,
      null::boolean,
      null::text
    from public.events e
    cross join bounds b
    where e.reminder_at is not null
      and e.reminder_at between b.now_at - interval '5 minutes'
                            and b.now_at + interval '15 minutes'

    union all

    select
      'event'::text,
      e.id,
      e.user_id,
      e.starts_at,
      b.now_at,
      left('Event Reminder: ' || e.title, 80),
      left(concat_ws(' · ',
        coalesce(e.event_type, 'Event'),
        'Scheduled for ' || to_char(e.starts_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
        nullif(e.notes, '')
      ), 240),
      '/#reminders'::text,
      null::boolean,
      null::text
    from public.events e
    cross join bounds b
    where e.reminder_at is null
      and e.starts_at between b.now_at - interval '5 minutes'
                          and b.now_at + interval '15 minutes'

    union all

    select
      'round'::text,
      r.id,
      r.user_id,
      r.scheduled_at,
      b.now_at,
      left(coalesce(nullif(a.company, '') || ': ', '') || coalesce(nullif(r.round_name, ''), r.round_type), 80),
      left(concat_ws(' · ',
        r.round_type,
        'Scheduled for ' || to_char(r.scheduled_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC',
        nullif(r.platform, '')
      ), 240),
      '/#jobs'::text,
      null::boolean,
      r.status
    from public.application_rounds r
    left join public.applications a
      on a.id = r.application_id and a.user_id = r.user_id
    cross join bounds b
    where r.scheduled_at is not null
      and r.status not in ('Cleared', 'Rejected', 'Waived')
      and r.scheduled_at between b.now_at - interval '5 minutes'
                             and b.now_at + interval '30 minutes'
  ), eligible as (
    select c.*
    from candidates c
    left join public.scheduled_reminder_deliveries d
      on d.user_id = c.user_id
      and d.source_type = c.source_type
      and d.source_id = c.source_id
      and d.scheduled_for = c.scheduled_for
    where d.id is null
      or (d.status = 'retry_wait' and d.retry_after <= c.database_now)
      or (d.status = 'processing' and d.locked_at <= c.database_now - interval '10 minutes')
    order by (d.id is null) desc, c.scheduled_for, c.source_type, c.source_id
    limit greatest(1, least(coalesce(p_limit, 1), 100))
  ), claimed as (
    insert into public.scheduled_reminder_deliveries as existing (
      user_id, source_type, source_id, scheduled_for, status, attempt_count, locked_at, updated_at
    )
    select e.user_id, e.source_type, e.source_id, e.scheduled_for,
           'processing', 1, e.database_now, e.database_now
    from eligible e
    on conflict (user_id, source_type, source_id, scheduled_for)
    do update set
      status = 'processing',
      attempt_count = existing.attempt_count + 1,
      locked_at = excluded.locked_at,
      retry_after = null,
      last_error = null,
      updated_at = excluded.updated_at
    where (existing.status = 'retry_wait' and existing.retry_after <= clock_timestamp())
       or (existing.status = 'processing'
           and existing.locked_at <= clock_timestamp() - interval '10 minutes')
    returning existing.id, existing.user_id, existing.source_type, existing.source_id, existing.scheduled_for
  )
  select cl.id, cl.user_id, cl.source_type, cl.source_id, cl.scheduled_for,
         e.database_now, e.title, e.body, e.app_path, e.completed, e.round_status
  from claimed cl
  join eligible e
    on e.user_id = cl.user_id
    and e.source_type = cl.source_type
    and e.source_id = cl.source_id
    and e.scheduled_for = cl.scheduled_for;
end;
$$;

create or replace function public.claim_scheduled_reminder_devices(
  p_delivery_id uuid,
  p_limit integer default 20
)
returns table (
  device_delivery_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_key text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;

  return query
  with parent as (
    select d.id, d.user_id
    from public.scheduled_reminder_deliveries d
    where d.id = p_delivery_id
      and d.status = 'processing'
      and d.locked_at > clock_timestamp() - interval '10 minutes'
  ), eligible as (
    select s.id as subscription_id, s.user_id
    from parent d
    join public.push_subscriptions s on s.user_id = d.user_id
    left join public.scheduled_reminder_delivery_devices old
      on old.delivery_id = d.id and old.push_subscription_id = s.id
    where old.id is null
      or (old.status = 'retry_wait' and old.retry_after <= clock_timestamp() and old.attempt_count < 8)
      or (old.status = 'processing'
          and old.locked_at <= clock_timestamp() - interval '10 minutes'
          and old.attempt_count < 8)
    order by s.id
    limit greatest(1, least(coalesce(p_limit, 20), 20))
  ), claimed as (
    insert into public.scheduled_reminder_delivery_devices as existing (
      delivery_id, user_id, push_subscription_id, status, attempt_count, locked_at, updated_at
    )
    select p_delivery_id, e.user_id, e.subscription_id, 'processing', 1,
           clock_timestamp(), clock_timestamp()
    from eligible e
    on conflict (delivery_id, push_subscription_id)
    do update set
      status = 'processing',
      attempt_count = existing.attempt_count + 1,
      locked_at = clock_timestamp(),
      retry_after = null,
      last_error = null,
      updated_at = clock_timestamp()
    where existing.attempt_count < 8
      and (
        (existing.status = 'retry_wait' and existing.retry_after <= clock_timestamp())
        or (existing.status = 'processing'
            and existing.locked_at <= clock_timestamp() - interval '10 minutes')
      )
    returning existing.id, existing.user_id, existing.push_subscription_id, existing.attempt_count
  )
  select cl.id, s.id, s.endpoint, s.p256dh, s.auth_key, cl.attempt_count
  from claimed cl
  join public.push_subscriptions s
    on s.id = cl.push_subscription_id and s.user_id = cl.user_id;
end;
$$;

create or replace function public.complete_scheduled_reminder_device(
  p_delivery_id uuid,
  p_device_delivery_id uuid,
  p_outcome text,
  p_error_code text default null,
  p_retry_after_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;
  if p_outcome is null or p_outcome not in ('delivered', 'retry', 'failed', 'expired') then
    raise exception using errcode = '22023', message = 'Invalid delivery outcome';
  end if;
  if p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception using errcode = '22023', message = 'Invalid delivery error code';
  end if;
  if p_outcome = 'retry'
     and (p_retry_after_seconds is null or p_retry_after_seconds < 1 or p_retry_after_seconds > 900) then
    raise exception using errcode = '22023', message = 'Invalid retry delay';
  end if;

  update public.scheduled_reminder_delivery_devices dd
  set status = case
        when p_outcome = 'retry' and dd.attempt_count >= 8 then 'failed'
        else p_outcome
      end,
      locked_at = null,
      retry_after = case
        when p_outcome = 'retry' and dd.attempt_count < 8
          then clock_timestamp() + make_interval(secs => p_retry_after_seconds)
        else null
      end,
      delivered_at = case when p_outcome = 'delivered' then clock_timestamp() else null end,
      last_error = p_error_code,
      updated_at = clock_timestamp()
  where dd.id = p_device_delivery_id
    and dd.delivery_id = p_delivery_id
    and exists (
      select 1 from public.scheduled_reminder_deliveries d
      where d.id = p_delivery_id and d.user_id = dd.user_id and d.status = 'processing'
    )
  returning dd.id into v_updated_id;

  return v_updated_id is not null;
end;
$$;

create or replace function public.finish_scheduled_reminder(
  p_delivery_id uuid,
  p_release_inflight boolean default false,
  p_force_failed boolean default false,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_has_subscriptions boolean;
  v_has_devices boolean;
  v_has_delivered boolean;
  v_has_outstanding boolean;
  v_retry_at timestamptz;
  v_next_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'Service role required';
  end if;
  if p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception using errcode = '22023', message = 'Invalid delivery error code';
  end if;

  select d.user_id into v_user_id
  from public.scheduled_reminder_deliveries d
  where d.id = p_delivery_id and d.status = 'processing';
  if v_user_id is null then return false; end if;

  if p_force_failed then
    update public.scheduled_reminder_deliveries d
    set status = 'failed', locked_at = null, retry_after = null,
        last_error = coalesce(p_error_code, 'eligibility_check_failed'),
        updated_at = clock_timestamp()
    where d.id = p_delivery_id;
    return true;
  end if;

  if p_release_inflight then
    update public.scheduled_reminder_delivery_devices dd
    set status = case when dd.attempt_count >= 8 then 'failed' else 'retry_wait' end,
        locked_at = null,
        retry_after = case when dd.attempt_count >= 8 then null else clock_timestamp() + interval '1 minute' end,
        last_error = coalesce(p_error_code, 'worker_interrupted'),
        updated_at = clock_timestamp()
    where dd.delivery_id = p_delivery_id and dd.status = 'processing';
  end if;

  -- A subscription removed during an in-flight attempt is terminal for this device row.
  update public.scheduled_reminder_delivery_devices dd
  set status = 'expired', locked_at = null, retry_after = null,
      last_error = 'subscription_removed', updated_at = clock_timestamp()
  where dd.delivery_id = p_delivery_id
    and dd.status in ('processing', 'retry_wait')
    and not exists (
      select 1 from public.push_subscriptions s
      where s.id = dd.push_subscription_id and s.user_id = dd.user_id
    );

  select exists (
           select 1 from public.push_subscriptions s where s.user_id = v_user_id
         ),
         exists (
           select 1 from public.scheduled_reminder_delivery_devices dd where dd.delivery_id = p_delivery_id
         ),
         exists (
           select 1 from public.scheduled_reminder_delivery_devices dd
           where dd.delivery_id = p_delivery_id and dd.status = 'delivered'
         )
  into v_has_subscriptions, v_has_devices, v_has_delivered;

  select exists (
    select 1
    from public.push_subscriptions s
    left join public.scheduled_reminder_delivery_devices dd
      on dd.delivery_id = p_delivery_id
      and dd.user_id = s.user_id
      and dd.push_subscription_id = s.id
    where s.user_id = v_user_id
      and (dd.id is null or dd.status in ('processing', 'retry_wait'))
  ) into v_has_outstanding;

  if not v_has_subscriptions and not v_has_devices then
    v_next_status := 'retry_wait';
    v_retry_at := clock_timestamp() + interval '1 minute';
  elsif v_has_outstanding then
    v_next_status := 'retry_wait';
    select min(case
        when dd.id is null then clock_timestamp() + interval '1 minute'
        when dd.status = 'retry_wait' then coalesce(dd.retry_after, clock_timestamp() + interval '1 minute')
        else coalesce(dd.locked_at, clock_timestamp()) + interval '10 minutes'
      end)
    into v_retry_at
    from public.push_subscriptions s
    left join public.scheduled_reminder_delivery_devices dd
      on dd.delivery_id = p_delivery_id
      and dd.user_id = s.user_id
      and dd.push_subscription_id = s.id
    where s.user_id = v_user_id
      and (dd.id is null or dd.status in ('processing', 'retry_wait'));
  elsif v_has_delivered then
    v_next_status := 'delivered';
    v_retry_at := null;
  else
    v_next_status := 'failed';
    v_retry_at := null;
  end if;

  update public.scheduled_reminder_deliveries d
  set status = v_next_status,
      locked_at = null,
      retry_after = v_retry_at,
      delivered_at = case when v_next_status = 'delivered' then clock_timestamp() else null end,
      last_error = case
        when p_error_code is not null then p_error_code
        when v_next_status = 'delivered' then null
        when v_next_status = 'retry_wait' and not v_has_subscriptions then 'no_registered_subscriptions'
        else d.last_error
      end,
      updated_at = clock_timestamp()
  where d.id = p_delivery_id;

  return true;
end;
$$;

create or replace function public.invoke_taskflow_scheduled_reminder_dispatch()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_function_url text;
  v_cron_secret text;
  v_request_id bigint;
begin
  select s.decrypted_secret into v_function_url
  from vault.decrypted_secrets s
  where s.name = 'taskflow_dispatch_function_url'
  order by s.created_at desc
  limit 1;

  select s.decrypted_secret into v_cron_secret
  from vault.decrypted_secrets s
  where s.name = 'taskflow_cron_secret'
  order by s.created_at desc
  limit 1;

  if v_function_url is null or v_cron_secret is null then
    raise exception 'Scheduled reminder Vault secrets are missing';
  end if;
  if v_function_url !~ '^https://[A-Za-z0-9.-]+\.supabase\.co/functions/v1/dispatch-scheduled-reminders$' then
    raise exception 'Scheduled reminder function URL is invalid';
  end if;

  select net.http_post(
    url := v_function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.claim_due_scheduled_reminders(integer) from public, anon, authenticated;
revoke all on function public.claim_scheduled_reminder_devices(uuid, integer) from public, anon, authenticated;
revoke all on function public.complete_scheduled_reminder_device(uuid, uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.finish_scheduled_reminder(uuid, boolean, boolean, text) from public, anon, authenticated;
revoke all on function public.invoke_taskflow_scheduled_reminder_dispatch() from public, anon, authenticated, service_role;
grant execute on function public.claim_due_scheduled_reminders(integer) to service_role;
grant execute on function public.claim_scheduled_reminder_devices(uuid, integer) to service_role;
grant execute on function public.complete_scheduled_reminder_device(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.finish_scheduled_reminder(uuid, boolean, boolean, text) to service_role;
grant execute on function public.invoke_taskflow_scheduled_reminder_dispatch() to postgres;

-- Supabase Cron overwrites a job with the same name, keeping setup reruns idempotent.
select cron.schedule(
  'taskflow-dispatch-scheduled-reminders',
  '* * * * *',
  'select public.invoke_taskflow_scheduled_reminder_dispatch();'
);
