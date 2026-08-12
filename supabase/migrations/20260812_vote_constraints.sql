create index if not exists comment_replyto_visible_idx
on public.comment (replyto)
where hidden <> 1;

with ranked_votes as (
  select
    ctid,
    row_number() over (
      partition by comment_id, created_by, emoji
      order by created_at asc
    ) as row_num
  from public.vote
  where "offset" = 0
    and emoji is not null
)
delete from public.vote
where ctid in (
  select ctid
  from ranked_votes
  where row_num > 1
);

create unique index if not exists vote_unique_reaction_idx
on public.vote (comment_id, created_by, emoji)
where "offset" = 0 and emoji is not null;

create unique index if not exists vote_unique_direction_idx
on public.vote (comment_id, created_by)
where "offset" <> 0;
