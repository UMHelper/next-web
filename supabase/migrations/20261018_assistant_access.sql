begin;

alter table public.app_config
  add column if not exists ai_assistant_access text not null default 'off'
  check (ai_assistant_access in ('off', 'testers', 'everyone'));

create table if not exists public.assistant_testers (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  added_by text not null,
  created_at timestamptz not null default now()
);

alter table public.assistant_testers enable row level security;

revoke all on public.assistant_testers from public, anon, authenticated;
grant select, insert, delete on public.assistant_testers to service_role;

notify pgrst, 'reload schema';

commit;
