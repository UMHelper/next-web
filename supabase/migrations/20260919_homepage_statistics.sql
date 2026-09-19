create index if not exists comment_recent_visible_idx
on public.comment (pub_time desc)
where replyto is null and hidden <> 1;

create or replace function public.get_popular_courses(
  target_days integer default 30,
  result_limit integer default 5
)
returns table (
  course_code text,
  course_title_eng text,
  course_title_chi text,
  offering_unit text,
  comment_count bigint,
  avg_result real,
  latest_comment_at timestamp without time zone
)
language sql
stable
security invoker
set search_path = public
as $function$
  with recent_comments as (
    select
      comment.course_id,
      comment.result,
      comment.pub_time
    from public.comment
    where comment.replyto is null
      and comment.hidden <> 1
      and comment.pub_time >= (now() at time zone 'UTC')
        - make_interval(days => greatest(least(coalesce(target_days, 30), 365), 1))
  )
  select
    course."New_code"::text as course_code,
    course."courseTitleEng"::text as course_title_eng,
    course."courseTitleChi"::text as course_title_chi,
    course."Offering_Unit"::text as offering_unit,
    stats.comment_count,
    stats.avg_result,
    stats.latest_comment_at
  from (
    select
      prof_with_course.course_id,
      count(*)::bigint as comment_count,
      avg(recent_comments.result)::real as avg_result,
      max(recent_comments.pub_time) as latest_comment_at
    from recent_comments
    join public.prof_with_course
      on prof_with_course.id = recent_comments.course_id
    group by prof_with_course.course_id
  ) as stats
  join public.course_noporf as course
    on course."New_code" = stats.course_id
  where course."New_code" not ilike 'TEST%'
  order by
    stats.comment_count desc,
    stats.latest_comment_at desc,
    course."New_code" asc
  limit greatest(least(coalesce(result_limit, 5), 50), 1);
$function$;

revoke all on function public.get_popular_courses(integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_popular_courses(integer, integer)
  to postgres, service_role;
notify pgrst, 'reload schema';
