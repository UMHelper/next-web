-- D1 schema for OpenNext tag cache (d1-next-mode-tag-cache).
-- Run with:
--   wrangler d1 execute next-web-tag-cache --remote --file=scripts/d1-tag-cache.sql
create table if not exists revalidations (
  tag text not null,
  revalidatedAt integer not null
);

create index if not exists revalidations_tag_idx
  on revalidations (tag);
