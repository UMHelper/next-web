begin;

drop function if exists public.get_comment_page(integer, integer, integer);

create or replace function public.get_comment_page(
  target_course_id integer,
  target_page integer,
  target_page_size integer default 20,
  target_viewer_id text default null
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
  avatar_seed text,
  content_en text,
  img text,
  replyto bigint,
  hidden smallint,
  upvote_count integer,
  downvote_count integer,
  emoji_counts jsonb,
  vote_history jsonb
)
language sql
stable
as $$
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
  join page_comments p on c.replyto = p.id
  where c.hidden <> 1
),
vote_totals as (
  select
    v.comment_id,
    sum(case when v."offset" = 1 then 1 else 0 end)::int as upvote_count,
    sum(case when v."offset" = -1 then 1 else 0 end)::int as downvote_count
  from public.vote v
  join thread_comments c on c.id = v.comment_id
  group by v.comment_id
),
reaction_counts as (
  select
    v.comment_id,
    jsonb_agg(
      jsonb_build_object('emoji', v.emoji, 'count', v.count)
      order by v.emoji
    ) as emoji_counts
  from (
    select comment_id, emoji, count(*)::int as count
    from public.vote
    where "offset" = 0
      and emoji is not null
      and comment_id in (select id from thread_comments)
    group by comment_id, emoji
  ) v
  group by v.comment_id
),
viewer_votes as (
  select
    v.comment_id,
    jsonb_agg(
      jsonb_build_object(
        'comment_id', v.comment_id,
        'offset', v."offset",
        'created_at', v.created_at,
        'emoji', v.emoji
      )
      order by v.created_at asc
    ) as vote_history
  from public.vote v
  where v.comment_id in (select id from thread_comments)
    and target_viewer_id is not null
    and v.created_by = target_viewer_id
  group by v.comment_id
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
  md5(c.verify_account) as avatar_seed,
  c.content_en,
  c.img,
  c.replyto,
  c.hidden,
  coalesce(t.upvote_count, 0) as upvote_count,
  coalesce(t.downvote_count, 0) as downvote_count,
  coalesce(r.emoji_counts, '[]'::jsonb) as emoji_counts,
  coalesce(v.vote_history, '[]'::jsonb) as vote_history
from thread_comments c
left join vote_totals t on t.comment_id = c.id
left join reaction_counts r on r.comment_id = c.id
left join viewer_votes v on v.comment_id = c.id
order by
  case when c.replyto is null then 0 else 1 end,
  c.pub_time desc,
  c.id asc;
$$;

revoke all on function public.get_comment_page(integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.get_comment_page(integer, integer, integer, text) to service_role;

commit;
