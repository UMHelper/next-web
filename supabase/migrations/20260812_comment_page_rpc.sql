create or replace function public.get_comment_page(
  target_course_id integer,
  target_page integer,
  target_page_size integer default 20
)
returns table (
  id bigint,
  content text,
  attendance double precision,
  pre double precision,
  grade double precision,
  hard double precision,
  reward double precision,
  recommend double precision,
  assignment double precision,
  result double precision,
  pub_time timestamp without time zone,
  upvote integer,
  downvote integer,
  course_id integer,
  verify integer,
  verify_account character varying,
  content_en text,
  img text,
  replyto bigint,
  hidden smallint,
  vote_history jsonb
)
language sql
stable
as $function$
with page_comments as (
  select c.*
  from public.comment c
  where c.course_id = target_course_id
    and c.hidden <> 1
    and c.replyto is null
  order by c.pub_time desc
  limit target_page_size
  offset greatest(target_page, 0) * target_page_size
),
thread_comments as (
  select p.*
  from page_comments p
  union all
  select c.*
  from public.comment c
  join page_comments p
    on c.replyto = p.id
  where c.hidden <> 1
)
select
  c.id,
  c.content,
  c.attendance,
  c.pre,
  c.grade,
  c.hard,
  c.reward,
  c.recommend,
  c.assignment,
  c.result,
  c.pub_time,
  c.upvote,
  c.downvote,
  c.course_id,
  c.verify,
  c.verify_account,
  c.content_en,
  c.img,
  c.replyto,
  c.hidden,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'comment_id', v.comment_id,
        'offset', v."offset",
        'created_by', v.created_by,
        'created_at', v.created_at,
        'emoji', v.emoji
      )
      order by v.created_at asc
    ) filter (where v.comment_id is not null),
    '[]'::jsonb
  ) as vote_history
from thread_comments c
left join public.vote v
  on v.comment_id = c.id
group by
  c.id,
  c.content,
  c.attendance,
  c.pre,
  c.grade,
  c.hard,
  c.reward,
  c.recommend,
  c.assignment,
  c.result,
  c.pub_time,
  c.upvote,
  c.downvote,
  c.course_id,
  c.verify,
  c.verify_account,
  c.content_en,
  c.img,
  c.replyto,
  c.hidden
order by
  case when c.replyto is null then 0 else 1 end,
  c.pub_time desc,
  c.id asc;
$function$;

revoke all on function public.get_comment_page(integer, integer, integer) from public, anon, authenticated;
grant execute on function public.get_comment_page(integer, integer, integer) to postgres, service_role, anon, authenticated;
