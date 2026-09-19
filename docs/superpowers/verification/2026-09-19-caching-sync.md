# Phase 3 Caching / Sync Verification (partial) — 2026-09-19

## Status

Phase 3 spec is written. The parts that do not require external resources are implemented and committed locally:

- 3A: cached public reads
- 3B: write-path tag invalidation
- 3D: lightweight sitemap

3C (UM sync scheduling) and 3E (Cloudflare R2/OpenNext incremental cache) are **not implemented yet** because they need human-provided resources/secrets.

## Commits

- `8dfb9da docs: add phase 3 caching and sync spec`
- `a879a4e perf: simplify sitemap queries and last modified`
- `47354d2 perf: cache public reads and invalidate after writes`

## Commands run

- [x] `npm run test` — 22 files / 51 tests passed
- [x] `npm run lint` — no warnings or errors
- [x] `node node_modules/typescript/bin/tsc --noEmit` — passed
- [x] `npm run build` — passed; 60 static pages generated
- [x] `scripts/verify-security-hardening.sql` checks still expected to pass (no DB changes in Phase 3 so far)

## 3A / 3B details

Cached functions:

- `getCourseInfo`
- `getProfListByCourse`
- `getReviewInfo`
- `fetchCourseListByProf`
- `fetchCatalogList`
- `getStatistics`

Tags:

- `course`
- `professor`
- `statistics`
- `catalog`

Write routes now call:

- `invalidateAfterCommentWrite()`
- `invalidateAfterReplyWrite()`
- `invalidateAfterVoteWrite()`

Note: tag invalidation becomes durable only when OpenNext tag cache / R2 is configured (3E). Without it, TTLs still apply and `revalidateTag` is best-effort.

## 3D details

- `app/sitemap.ts` now uses:
  - one query for courses
  - one query for reviews
  - constants for catalog URLs
- `lastModified` is stable via `getSitemapLastModified()`
- errors return an empty section instead of crashing

## 3C details

- Added `scripts/sync-um.mjs` with `--missing`, `--all`, `--code=`, `--limit=`
- Added `.github/workflows/sync-um.yml` daily schedule + manual dispatch
- Added `npm run sync:um`
- Added `tests/sync-um.test.ts`

Page-time UM fallback has been removed from `lib/database/get-course-info.ts`; course pages now read PostgreSQL only. `scripts/sync-um.mjs` remains the only UM API caller.

Still needs human-provided GitHub Actions secrets:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `UM_OPEN_DATA_TOKEN`

## 3E details

- R2 bucket `next-web-inc-cache` created by human.
- `wrangler.jsonc` now has `NEXT_INC_CACHE_R2_BUCKET` binding.
- `open-next.config.ts` now uses `r2IncrementalCache`.
- D1 database `next-web-tag-cache` created by human; `wrangler.jsonc` has `NEXT_TAG_CACHE_D1` binding.
- `open-next.config.ts` now uses `d1NextTagCache`.
- `scripts/d1-tag-cache.sql` contains the `revalidations` table DDL.
- `npm run build:pages` passed and both cache bindings are present in the OpenNext bundle.

Pending D1 step (needs Cloudflare auth or Dashboard):

- execute `scripts/d1-tag-cache.sql` in D1 console or via
  `wrangler d1 execute next-web-tag-cache --remote --file=scripts/d1-tag-cache.sql`

## Pending / next

- 3C: configure the GitHub Actions secrets and run the workflow once manually.
- 3C: after sync is verified, remove `fetchCourseInfo` page-time UM fallback.
- Deploy the new OpenNext config so R2/D1 caches become active.
- Verify production cache hits and `revalidateTag` invalidation.
