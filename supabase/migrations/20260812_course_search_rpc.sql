create extension if not exists pg_trgm with schema extensions;

create index if not exists course_noporf_code_trgm_idx
on public.course_noporf
using gin ("New_code" extensions.gin_trgm_ops);

create index if not exists course_noporf_title_eng_trgm_idx
on public.course_noporf
using gin ("courseTitleEng" extensions.gin_trgm_ops);

create or replace function public.search_courses(keyword text)
returns setof public.course_noporf
language sql
stable
as $function$
  select distinct on (c."New_code")
    c.*
  from public.course_noporf c
  where c."New_code" ilike '%' || keyword || '%'
     or c."courseTitleEng" ilike '%' || replace(keyword, '%20', ' ') || '%'
  order by c."New_code";
$function$;

revoke all on function public.search_courses(text) from public, anon, authenticated;
grant execute on function public.search_courses(text) to postgres, service_role, anon, authenticated;
