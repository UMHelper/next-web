create table public.timetable_plan (
  id bigint generated always as identity primary key,
  client_ref uuid not null,
  owner_clerk_id text not null,
  name text not null,
  year integer not null,
  sem integer not null,
  payload jsonb not null default '{"schemaVersion":1,"sections":[]}'::jsonb,
  schema_version integer not null default 1,
  revision integer not null default 1,
  share_token text,
  share_token_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timetable_plan_owner_client_ref_key unique (owner_clerk_id, client_ref),
  constraint timetable_plan_share_token_key unique (share_token),
  constraint timetable_plan_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint timetable_plan_term_check check (year between 2000 and 2100 and sem between 1 and 3)
);

create index timetable_plan_owner_term_updated_idx
  on public.timetable_plan (owner_clerk_id, year, sem, updated_at desc);

alter table public.timetable_plan enable row level security;
revoke all on public.timetable_plan from anon, authenticated;
grant all on public.timetable_plan to service_role;
grant usage, select on sequence public.timetable_plan_id_seq to service_role;
