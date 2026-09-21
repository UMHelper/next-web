create or replace function public.admin_reset_offered()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  course_rows integer;
  prof_rows integer;
begin
  update public.course_noporf set "Is_Offered" = 0 where "New_code" <> '';
  get diagnostics course_rows = row_count;
  update public.prof_with_course set is_offered = 0 where course_id <> '';
  get diagnostics prof_rows = row_count;
  return jsonb_build_object('course_noporf', course_rows, 'prof_with_course', prof_rows);
end;
$function$;

create or replace function public.admin_resolve_known_codes(codes text[])
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(array_agg("New_code"), '{}'::text[])
  from public.course_noporf
  where "New_code" = any(codes);
$function$;

create or replace function public.admin_mark_offered(codes text[])
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  affected integer;
begin
  update public.course_noporf set "Is_Offered" = 1 where "New_code" = any(codes);
  get diagnostics affected = row_count;
  return affected;
end;
$function$;

create or replace function public.admin_upsert_offered_courses(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  upserted integer := 0;
  marked integer := 0;
begin
  insert into public.course_noporf (
    "Offering_Unit", "Offering_Department", "New_code", "Old_code",
    "courseTitleEng", "courseTitleChi", "Credits", "Course_Duration",
    "Medium_of_Instruction", "Is_Offered", "offeringProgLevel", "courseType",
    "suggestedYearOfStudy", "gradingSystem", "courseDescription", ilo
  )
  select
    coalesce(x."Offering_Unit", ''),
    coalesce(x."Offering_Department", ''),
    upper(btrim(x."New_code")),
    coalesce(x."Old_code", ''),
    coalesce(x."courseTitleEng", ''),
    coalesce(x."courseTitleChi", ''),
    coalesce(x."Credits", ''),
    coalesce(x."Course_Duration", ''),
    coalesce(x."Medium_of_Instruction", ''),
    1,
    x."offeringProgLevel",
    x."courseType",
    x."suggestedYearOfStudy",
    x."gradingSystem",
    x."courseDescription",
    x.ilo
  from jsonb_to_recordset(coalesce(payload->'inserts', '[]'::jsonb)) as x(
    "Offering_Unit" text, "Offering_Department" text, "New_code" text, "Old_code" text,
    "courseTitleEng" text, "courseTitleChi" text, "Credits" text, "Course_Duration" text,
    "Medium_of_Instruction" text, "offeringProgLevel" text, "courseType" text,
    "suggestedYearOfStudy" numeric, "gradingSystem" text, "courseDescription" text, ilo text
  )
  where coalesce(x."New_code", '') <> ''
  on conflict ("New_code") do update set "Is_Offered" = 1;
  get diagnostics upserted = row_count;

  update public.course_noporf set "Is_Offered" = 1
  where "New_code" = any (
    select value from jsonb_array_elements_text(coalesce(payload->'offered_codes', '[]'::jsonb))
  );
  get diagnostics marked = row_count;

  return jsonb_build_object('upserted', upserted, 'marked', marked);
end;
$function$;

create or replace function public.admin_apply_schedule(payload jsonb, scope text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_year integer := nullif(payload->>'year', '')::integer;
  target_sem integer := nullif(payload->>'sem', '')::integer;
  tl_rows integer := 0;
  pwc_rows integer := 0;
  offer_rows integer := 0;
  sched_rows integer := 0;
begin
  if scope not in ('time_location', 'prof_course', 'offer', 'all') then
    raise exception 'invalid scope: %', scope;
  end if;

  if scope in ('offer', 'all') and (target_year is null or target_sem is null) then
    raise exception 'year and sem are required for scope %', scope;
  end if;

  with rows as (
    select distinct
      upper(btrim(r->>'day')) as date,
      replace(btrim(r->>'times'), ' ', '') as times,
      btrim(r->>'location') as location
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    where coalesce(r->>'day', '') <> ''
      and coalesce(r->>'times', '') <> ''
      and coalesce(r->>'location', '') <> ''
  ), ins as (
    insert into public.time_location (date, times, location)
    select date, times, location from rows
    on conflict (date, times, location) do nothing
    returning 1
  )
  select count(*) into tl_rows from ins;

  if scope = 'time_location' then
    return jsonb_build_object('time_location', tl_rows);
  end if;

  with rows as (
    select distinct btrim(r->>'code') as course_id, btrim(r->>'prof') as prof_id
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    where coalesce(r->>'code', '') <> '' and coalesce(r->>'prof', '') <> ''
  ), ins as (
    insert into public.prof_with_course (course_id, prof_id, is_offered)
    select course_id, prof_id, 1 from rows
    on conflict (course_id, prof_id) do update set is_offered = 1
    returning 1
  )
  select count(*) into pwc_rows from ins;

  if scope = 'prof_course' then
    return jsonb_build_object('prof_with_course', pwc_rows);
  end if;

  with rows as (
    select distinct p.id as pwc_id, btrim(r->>'section') as section
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    join public.prof_with_course p
      on p.course_id = btrim(r->>'code') and p.prof_id = btrim(r->>'prof')
    where coalesce(r->>'section', '') <> ''
  ), ins as (
    insert into public.offer (course_id, section, year, sem)
    select pwc_id, section, target_year, target_sem from rows
    on conflict (course_id, section, year, sem) do nothing
    returning 1
  )
  select count(*) into offer_rows from ins;

  with rows as (
    select distinct o.id as offer_id, tl.id as tl_id
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    join public.prof_with_course p
      on p.course_id = btrim(r->>'code') and p.prof_id = btrim(r->>'prof')
    join public.offer o
      on o.course_id = p.id and o.section = btrim(r->>'section')
     and o.year = target_year and o.sem = target_sem
    join public.time_location tl
      on tl.date = upper(btrim(r->>'day'))
     and tl.times = replace(btrim(r->>'times'), ' ', '')
     and tl.location = btrim(r->>'location')
    where coalesce(r->>'day', '') <> ''
      and coalesce(r->>'times', '') <> ''
      and coalesce(r->>'location', '') <> ''
  ), ins as (
    insert into public.schedule (course_id, time_location_id)
    select offer_id, tl_id from rows
    on conflict (course_id, time_location_id) do nothing
    returning 1
  )
  select count(*) into sched_rows from ins;

  return jsonb_build_object(
    'time_location', tl_rows,
    'prof_with_course', pwc_rows,
    'offer', offer_rows,
    'schedule', sched_rows
  );
end;
$function$;

revoke all on function public.admin_reset_offered() from public, anon, authenticated;
revoke all on function public.admin_resolve_known_codes(text[]) from public, anon, authenticated;
revoke all on function public.admin_mark_offered(text[]) from public, anon, authenticated;
revoke all on function public.admin_upsert_offered_courses(jsonb) from public, anon, authenticated;
revoke all on function public.admin_apply_schedule(jsonb, text) from public, anon, authenticated;

grant execute on function public.admin_reset_offered() to service_role;
grant execute on function public.admin_resolve_known_codes(text[]) to service_role;
grant execute on function public.admin_mark_offered(text[]) to service_role;
grant execute on function public.admin_upsert_offered_courses(jsonb) to service_role;
grant execute on function public.admin_apply_schedule(jsonb, text) to service_role;

notify pgrst, 'reload schema';
