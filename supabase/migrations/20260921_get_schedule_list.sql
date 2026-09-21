drop function if exists public.get_schedule_list(text, text);

create or replace function public.get_schedule_list(
  course_code text,
  prof text,
  target_year integer,
  target_sem integer
)
returns table (year integer, sem integer, section text, date text, times text, location text)
language sql
stable
security invoker
set search_path = public
as $function$
  select o.year, o.sem, o.section, tl.date, tl.times, tl.location
  from public.get_offer_list_by_prof(course_code, prof) o
  join public.schedule s on s.course_id = o.id
  join public.time_location tl on tl.id = s.time_location_id
  where o.year = target_year and o.sem = target_sem
  order by o.section, tl.date, tl.times, tl.location;
$function$;

revoke all on function public.get_schedule_list(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_schedule_list(text, text, integer, integer) to service_role;

notify pgrst, 'reload schema';
