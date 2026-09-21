create or replace function public.search_planner_courses(
  keyword text,
  faculty text,
  department text,
  page_limit integer,
  page_offset integer
) returns table (
  course_code text,
  course_title_eng text,
  course_title_chi text,
  offering_unit text,
  offering_department text,
  credits text,
  is_offered integer,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select
      c.*,
      count(*) over() as total_count
    from public.course_noporf c
    where (
      keyword is null
      or btrim(keyword) = ''
      or c."New_code" ilike '%' || btrim(keyword) || '%'
      or c."courseTitleEng" ilike '%' || btrim(keyword) || '%'
      or c."courseTitleChi" ilike '%' || btrim(keyword) || '%'
    )
      and (
        faculty is null
        or btrim(faculty) = ''
        or btrim(faculty) = 'All'
        or c."Offering_Unit" = btrim(faculty)
      )
      and (
        department is null
        or btrim(department) = ''
        or btrim(department) = 'All'
        or c."Offering_Department" = btrim(department)
      )
    order by c."New_code"
    limit greatest(page_limit, 1)
    offset greatest(page_offset, 0)
  )
  select
    c."New_code",
    c."courseTitleEng",
    c."courseTitleChi",
    c."Offering_Unit",
    c."Offering_Department",
    c."Credits",
    c."Is_Offered",
    c.total_count
  from filtered c;
$$;

create or replace function public.search_planner_instructors(
  keyword text,
  faculty text,
  department text,
  page_limit integer,
  page_offset integer
) returns table (
  prof_id text,
  course_count bigint,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with matched as (
    select
      p.prof_id,
      count(distinct p.course_id) as course_count
    from public.prof_with_course p
    join public.course_noporf c
      on c."New_code" = p.course_id
    where (
      keyword is null
      or btrim(keyword) = ''
      or p.prof_id ilike '%' || btrim(keyword) || '%'
    )
      and (
        faculty is null
        or btrim(faculty) = ''
        or btrim(faculty) = 'All'
        or c."Offering_Unit" = btrim(faculty)
      )
      and (
        department is null
        or btrim(department) = ''
        or btrim(department) = 'All'
        or c."Offering_Department" = btrim(department)
      )
    group by p.prof_id
  )
  select
    m.prof_id,
    m.course_count,
    count(*) over() as total_count
  from matched m
  order by m.prof_id
  limit greatest(page_limit, 1)
  offset greatest(page_offset, 0);
$$;
