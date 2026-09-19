begin;

create table if not exists public.request_rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null default 0
);

alter table public.request_rate_limits enable row level security;
revoke all on public.request_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.request_rate_limits to service_role;

create or replace function public.consume_rate_limit(
  target_key text,
  window_seconds integer,
  max_hits integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
  rec public.request_rate_limits;
begin
  if window_seconds <= 0 or max_hits <= 0 then
    raise exception 'window_seconds and max_hits must be positive';
  end if;

  insert into public.request_rate_limits(key, window_started_at, hit_count)
  values (target_key, now_ts, 1)
  on conflict (key) do update
    set
      hit_count = case
        when public.request_rate_limits.window_started_at < now_ts - make_interval(secs => window_seconds)
          then 1
        else public.request_rate_limits.hit_count + 1
      end,
      window_started_at = case
        when public.request_rate_limits.window_started_at < now_ts - make_interval(secs => window_seconds)
          then now_ts
        else public.request_rate_limits.window_started_at
      end
  returning * into rec;

  allowed := rec.hit_count <= max_hits;
  remaining := greatest(max_hits - rec.hit_count, 0);
  reset_at := rec.window_started_at + make_interval(secs => window_seconds);
  return next;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

commit;
