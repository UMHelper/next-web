begin;

create table if not exists public.admin_users (
  clerk_user_id text primary key,
  role text not null default 'admin' check (role in ('admin')),
  granted_by text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id bigint generated always as identity primary key,
  target_type text not null default 'comment',
  target_id bigint not null,
  course_id text,
  prof_id text,
  reporter_id text,
  reporter_platform text not null,
  reason text not null,
  details text,
  email text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  admin_note text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);

create index if not exists reports_target_idx
  on public.reports (target_type, target_id);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.reports enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.admin_users from public, anon, authenticated;
revoke all on public.reports from public, anon, authenticated;
revoke all on public.admin_audit_log from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update on public.admin_users to service_role;
grant select, insert, update on public.reports to service_role;
grant select, insert on public.admin_audit_log to service_role;
grant usage, select on all sequences in schema public to service_role;

notify pgrst, 'reload schema';

commit;
