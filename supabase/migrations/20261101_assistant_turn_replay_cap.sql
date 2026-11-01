-- Cap uncharged replays per turn key and keep replay reuse content-bound server-side.

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
  charge_continuations integer := 0;
begin
  if hour_limit <= 0 or day_limit <= 0 then
    raise exception 'hour_limit and day_limit must be positive';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_hash, 0));

  select
    c.charged_at > now_ts - interval '5 minutes',
    c.continuations
    into recent, charge_continuations
    from public.assistant_turn_charges c
    where c.user_hash = target_user_hash and c.turn_key = target_turn_key;

  if coalesce(recent, false) and coalesce(charge_continuations, 0) < 7 then
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

notify pgrst, 'reload schema';
