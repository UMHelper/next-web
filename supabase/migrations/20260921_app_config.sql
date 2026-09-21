create table if not exists public.app_config (
  id integer primary key default 1 check (id = 1),
  current_year integer not null,
  current_sem integer not null check (current_sem in (1, 2)),
  is_preenrollment_open boolean not null default true,
  database_last_update date,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.app_config (id, current_year, current_sem, is_preenrollment_open, database_last_update)
values (1, 2026, 1, true, current_date)
on conflict (id) do nothing;

alter table public.app_config enable row level security;

revoke all on table public.app_config from public, anon, authenticated;
grant select, insert, update on table public.app_config to service_role;

notify pgrst, 'reload schema';
