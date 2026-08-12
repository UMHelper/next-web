create index if not exists comment_course_id_visible_top_level_idx
on public.comment (course_id)
where replyto is null and hidden <> 1;

create or replace function public.refresh_prof_with_course_stats(target_course_id integer)
returns void
language plpgsql
as $function$
declare
  locked_course_id integer;
begin
  select id
    into locked_course_id
  from public.prof_with_course
  where id = target_course_id
  for update;

  if locked_course_id is null then
    raise exception 'prof_with_course id % not found', target_course_id;
  end if;

  update public.prof_with_course as p
  set
    comments = coalesce(stats.comments, 0),
    result = coalesce(stats.result, 0),
    attendance = coalesce(stats.attendance, 0),
    grade = coalesce(stats.grade, 0),
    hard = coalesce(stats.hard, 0),
    reward = coalesce(stats.reward, 0)
  from (
    select
      count(*)::integer as comments,
      avg(c.result)::real as result,
      avg(c.attendance)::real as attendance,
      avg(c.grade)::real as grade,
      avg(c.hard)::real as hard,
      avg(c.reward)::real as reward
    from public.comment as c
    where c.course_id = target_course_id
      and c.replyto is null
      and c.hidden <> 1
  ) as stats
  where p.id = target_course_id;
end;
$function$;

create or replace function public.insert_comment_and_refresh_prof_stats(
  target_course_id integer,
  target_content text,
  target_attendance double precision,
  target_pre double precision,
  target_grade double precision,
  target_hard double precision,
  target_reward double precision,
  target_recommend double precision,
  target_assignment double precision,
  target_result double precision,
  target_pub_time timestamp without time zone,
  target_verify integer,
  target_verify_account character varying,
  target_img text default null
)
returns public.comment
language plpgsql
as $function$
declare
  inserted_comment public.comment;
  locked_course_id integer;
begin
  select id
    into locked_course_id
  from public.prof_with_course
  where id = target_course_id
  for update;

  if locked_course_id is null then
    raise exception 'prof_with_course id % not found', target_course_id;
  end if;

  insert into public.comment (
    content,
    attendance,
    pre,
    grade,
    hard,
    reward,
    recommend,
    assignment,
    result,
    pub_time,
    upvote,
    downvote,
    course_id,
    verify,
    verify_account,
    img
  )
  values (
    target_content,
    target_attendance,
    target_pre,
    target_grade,
    target_hard,
    target_reward,
    target_recommend,
    target_assignment,
    target_result,
    target_pub_time,
    0,
    0,
    target_course_id,
    target_verify,
    target_verify_account,
    target_img
  )
  returning *
  into inserted_comment;

  perform public.refresh_prof_with_course_stats(target_course_id);

  return inserted_comment;
end;
$function$;

revoke all on function public.refresh_prof_with_course_stats(integer) from public, anon, authenticated;
revoke all on function public.insert_comment_and_refresh_prof_stats(
  integer,
  text,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  timestamp without time zone,
  integer,
  character varying,
  text
) from public, anon, authenticated;

grant execute on function public.refresh_prof_with_course_stats(integer) to postgres, service_role;
grant execute on function public.insert_comment_and_refresh_prof_stats(
  integer,
  text,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  double precision,
  timestamp without time zone,
  integer,
  character varying,
  text
) to postgres, service_role;

update public.prof_with_course as p
set
  comments = coalesce(stats.comments, 0),
  result = coalesce(stats.result, 0),
  attendance = coalesce(stats.attendance, 0),
  grade = coalesce(stats.grade, 0),
  hard = coalesce(stats.hard, 0),
  reward = coalesce(stats.reward, 0)
from (
  select
    c.course_id,
    count(*)::integer as comments,
    avg(c.result)::real as result,
    avg(c.attendance)::real as attendance,
    avg(c.grade)::real as grade,
    avg(c.hard)::real as hard,
    avg(c.reward)::real as reward
  from public.comment as c
  where c.replyto is null
    and c.hidden <> 1
  group by c.course_id
) as stats
where p.id = stats.course_id;

update public.prof_with_course
set
  comments = 0,
  result = 0,
  attendance = 0,
  grade = 0,
  hard = 0,
  reward = 0
where id not in (
  select distinct c.course_id
  from public.comment as c
  where c.replyto is null
    and c.hidden <> 1
);
