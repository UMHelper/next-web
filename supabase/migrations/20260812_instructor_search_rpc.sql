create or replace function public.search_instructors_with_courses(keyword text)
returns table (
  prof_name text,
  course_list jsonb
)
language sql
stable
as $function$
with normalized_professors as (
  select trim(p.name) as normalized_name
  from public.prof_info p
  where trim(p.name) ilike '%' || replace(replace(keyword, '%20', ' '), '$', '/') || '%'
  group by trim(p.name)
)
select
  np.normalized_name as prof_name,
  coalesce(
    jsonb_agg(to_jsonb(c) order by c."New_code") filter (where c."New_code" is not null),
    '[]'::jsonb
  ) as course_list
from normalized_professors np
left join public.prof_with_course pwc
  on trim(pwc.prof_id) = np.normalized_name
left join public.course_noporf c
  on c."New_code" = pwc.course_id
group by np.normalized_name
order by np.normalized_name asc;
$function$;

revoke all on function public.search_instructors_with_courses(text) from public, anon, authenticated;
grant execute on function public.search_instructors_with_courses(text) to postgres, service_role, anon, authenticated;
