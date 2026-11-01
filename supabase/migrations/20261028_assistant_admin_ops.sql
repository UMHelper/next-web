begin;

alter table public.app_config
  add column if not exists ai_quota_per_hour integer
    check (ai_quota_per_hour is null or ai_quota_per_hour between 1 and 500),
  add column if not exists ai_quota_per_day integer
    check (ai_quota_per_day is null or ai_quota_per_day between 1 and 2000),
  add column if not exists ai_max_turns integer
    check (ai_max_turns is null or ai_max_turns between 1 and 100),
  add column if not exists ai_history_turns integer
    check (ai_history_turns is null or ai_history_turns between 0 and 20),
  add column if not exists ai_max_steps integer
    check (ai_max_steps is null or ai_max_steps between 1 and 12),
  add column if not exists ai_max_output_tokens integer
    check (ai_max_output_tokens is null or ai_max_output_tokens between 128 and 4096),
  add column if not exists ai_timeout_ms integer
    check (ai_timeout_ms is null or ai_timeout_ms between 5000 and 60000);

create table if not exists public.assistant_turn_charges (
  user_hash text not null,
  turn_key text not null,
  charged_at timestamptz not null default now(),
  continuations integer not null default 0,
  primary key (user_hash, turn_key)
);

create index if not exists assistant_turn_charges_charged_at_idx
  on public.assistant_turn_charges (charged_at);

create table if not exists public.assistant_usage_events (
  id bigint generated always as identity primary key,
  run_key text not null unique,
  user_hash text,
  thread_hash text,
  turn_key text,
  occurred_at timestamptz not null default now(),
  outcome text not null
    check (outcome in (
      'accepted',
      'completed',
      'provider_error',
      'client_aborted',
      'execution_limit',
      'denied_quota',
      'rejected'
    )),
  is_continuation boolean not null default false,
  charged boolean not null default false,
  duration_ms integer,
  steps integer,
  tool_calls integer,
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  error_class text
);

create index if not exists assistant_usage_events_occurred_at_idx
  on public.assistant_usage_events (occurred_at);

alter table public.assistant_turn_charges enable row level security;
alter table public.assistant_usage_events enable row level security;

revoke all on public.assistant_turn_charges from public, anon, authenticated;
revoke all on public.assistant_usage_events from public, anon, authenticated;

grant select, insert, update, delete on public.assistant_turn_charges to service_role;
grant select, insert, update on public.assistant_usage_events to service_role;
grant delete on public.assistant_usage_events to service_role;

create or replace function public.claim_assistant_turn(
  target_user_hash text,
  target_turn_key text,
  target_thread_hash text,
  target_run_key text,
  target_is_continuation boolean,
  hour_limit integer,
  day_limit integer
)
returns table(allowed boolean, charged boolean, window_kind text, retry_after integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
  hour_key text := 'agent:user:' || target_user_hash || ':hour';
  day_key text := 'agent:user:' || target_user_hash || ':day';
  hour_started timestamptz;
  hour_count integer;
  day_started timestamptz;
  day_count integer;
  recent boolean := false;
begin
  if hour_limit <= 0 or day_limit <= 0 then
    raise exception 'hour_limit and day_limit must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_hash, 0));

  select c.charged_at > now_ts - interval '5 minutes'
    into recent
    from public.assistant_turn_charges c
    where c.user_hash = target_user_hash and c.turn_key = target_turn_key;

  if coalesce(recent, false) then
    update public.assistant_turn_charges c
      set continuations = c.continuations + 1
      where c.user_hash = target_user_hash and c.turn_key = target_turn_key;

    insert into public.assistant_usage_events(
      run_key, user_hash, thread_hash, turn_key, occurred_at, outcome, is_continuation, charged
    )
    values (
      target_run_key, target_user_hash, target_thread_hash, target_turn_key,
      now_ts, 'accepted', target_is_continuation, false
    )
    on conflict (run_key) do nothing;

    allowed := true;
    charged := false;
    window_kind := null;
    retry_after := 0;
    return next;
    return;
  end if;

  select r.window_started_at, r.hit_count
    into hour_started, hour_count
    from public.request_rate_limits r
    where r.key = hour_key;

  if hour_started is null or hour_started < now_ts - interval '1 hour' then
    hour_started := now_ts;
    hour_count := 0;
  end if;

  select r.window_started_at, r.hit_count
    into day_started, day_count
    from public.request_rate_limits r
    where r.key = day_key;

  if day_started is null or day_started < now_ts - interval '24 hours' then
    day_started := now_ts;
    day_count := 0;
  end if;

  if hour_count + 1 > hour_limit then
    insert into public.assistant_usage_events(
      run_key, user_hash, thread_hash, turn_key, occurred_at, outcome, is_continuation, charged
    )
    values (
      target_run_key, target_user_hash, target_thread_hash, target_turn_key,
      now_ts, 'denied_quota', target_is_continuation, false
    )
    on conflict (run_key) do nothing;

    allowed := false;
    charged := false;
    window_kind := 'hour';
    retry_after := greatest(
      0,
      ceil(extract(epoch from (hour_started + interval '1 hour' - now_ts)))::integer
    );
    return next;
    return;
  end if;

  if day_count + 1 > day_limit then
    insert into public.assistant_usage_events(
      run_key, user_hash, thread_hash, turn_key, occurred_at, outcome, is_continuation, charged
    )
    values (
      target_run_key, target_user_hash, target_thread_hash, target_turn_key,
      now_ts, 'denied_quota', target_is_continuation, false
    )
    on conflict (run_key) do nothing;

    allowed := false;
    charged := false;
    window_kind := 'day';
    retry_after := greatest(
      0,
      ceil(extract(epoch from (day_started + interval '24 hours' - now_ts)))::integer
    );
    return next;
    return;
  end if;

  insert into public.request_rate_limits(key, window_started_at, hit_count)
  values (hour_key, hour_started, hour_count + 1)
  on conflict (key) do update
    set window_started_at = excluded.window_started_at,
        hit_count = excluded.hit_count;

  insert into public.request_rate_limits(key, window_started_at, hit_count)
  values (day_key, day_started, day_count + 1)
  on conflict (key) do update
    set window_started_at = excluded.window_started_at,
        hit_count = excluded.hit_count;

  insert into public.assistant_turn_charges(user_hash, turn_key, charged_at, continuations)
  values (target_user_hash, target_turn_key, now_ts, 0)
  on conflict (user_hash, turn_key) do update
    set charged_at = excluded.charged_at,
        continuations = 0;

  insert into public.assistant_usage_events(
    run_key, user_hash, thread_hash, turn_key, occurred_at, outcome, is_continuation, charged
  )
  values (
    target_run_key, target_user_hash, target_thread_hash, target_turn_key,
    now_ts, 'accepted', target_is_continuation, true
  )
  on conflict (run_key) do nothing;

  allowed := true;
  charged := true;
  window_kind := null;
  retry_after := 0;
  return next;
end;
$$;

create or replace function public.assistant_usage_daily(target_days integer default 14)
returns table(
  day date,
  accepted bigint,
  completed bigint,
  provider_errors bigint,
  client_aborted bigint,
  execution_limit bigint,
  denied bigint,
  rejected bigint,
  input_tokens bigint,
  cached_input_tokens bigint,
  output_tokens bigint,
  reasoning_tokens bigint,
  model_ms bigint,
  steps bigint,
  tool_calls bigint
)
language sql
security invoker
set search_path = public
as $$
  with params as (
    select least(greatest(coalesce(target_days, 14), 1), 90)::integer as days
  ),
  days as (
    select generate_series(
      current_date - (p.days - 1),
      current_date,
      interval '1 day'
    )::date as day
    from params p
  ),
  agg as (
    select
      date_trunc('day', e.occurred_at)::date as day,
      count(*) filter (where e.outcome = 'accepted')::bigint as accepted,
      count(*) filter (where e.outcome = 'completed')::bigint as completed,
      count(*) filter (where e.outcome = 'provider_error')::bigint as provider_errors,
      count(*) filter (where e.outcome = 'client_aborted')::bigint as client_aborted,
      count(*) filter (where e.outcome = 'execution_limit')::bigint as execution_limit,
      count(*) filter (where e.outcome = 'denied_quota')::bigint as denied,
      count(*) filter (where e.outcome = 'rejected')::bigint as rejected,
      sum(e.input_tokens)::bigint as input_tokens,
      sum(e.cached_input_tokens)::bigint as cached_input_tokens,
      sum(e.output_tokens)::bigint as output_tokens,
      sum(e.reasoning_tokens)::bigint as reasoning_tokens,
      sum(e.duration_ms)::bigint as model_ms,
      sum(e.steps)::bigint as steps,
      sum(e.tool_calls)::bigint as tool_calls
    from public.assistant_usage_events e
    where e.occurred_at >= (current_date - (select days - 1 from params))
    group by 1
  )
  select
    d.day,
    coalesce(a.accepted, 0),
    coalesce(a.completed, 0),
    coalesce(a.provider_errors, 0),
    coalesce(a.client_aborted, 0),
    coalesce(a.execution_limit, 0),
    coalesce(a.denied, 0),
    coalesce(a.rejected, 0),
    a.input_tokens,
    a.cached_input_tokens,
    a.output_tokens,
    a.reasoning_tokens,
    coalesce(a.model_ms, 0),
    coalesce(a.steps, 0),
    coalesce(a.tool_calls, 0)
  from days d
  left join agg a using (day)
  order by d.day;
$$;

create or replace function public.prune_assistant_telemetry()
returns table(usage_deleted integer, charges_deleted integer, counters_deleted integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
begin
  delete from public.assistant_usage_events
    where occurred_at < now_ts - interval '90 days';
  get diagnostics usage_deleted = row_count;

  delete from public.assistant_turn_charges
    where charged_at < now_ts - interval '30 days';
  get diagnostics charges_deleted = row_count;

  delete from public.request_rate_limits
    where window_started_at < now_ts - interval '7 days';
  get diagnostics counters_deleted = row_count;

  return next;
end;
$$;

revoke all on function public.claim_assistant_turn(text, text, text, text, boolean, integer, integer)
  from public, anon, authenticated;
revoke all on function public.assistant_usage_daily(integer) from public, anon, authenticated;
revoke all on function public.prune_assistant_telemetry() from public, anon, authenticated;

grant execute on function public.claim_assistant_turn(text, text, text, text, boolean, integer, integer)
  to service_role;
grant execute on function public.assistant_usage_daily(integer) to service_role;
grant execute on function public.prune_assistant_telemetry() to service_role;

notify pgrst, 'reload schema';

commit;
