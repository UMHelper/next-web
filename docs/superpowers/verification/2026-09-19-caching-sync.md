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

## Pending / next

- 3C: `scripts/sync-um.mjs` + GitHub Actions or Cloudflare Cron; needs `UM_OPEN_DATA_TOKEN` and scheduling secrets.
- 3E: R2 bucket + `open-next.config.ts` incremental cache binding; needs Cloudflare resource.
- After 3C/3E: remove `fetchCourseInfo` page-time UM fallback and verify production cache hits.
