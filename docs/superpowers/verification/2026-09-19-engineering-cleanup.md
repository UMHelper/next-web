# Phase 4 Engineering Cleanup Verification — 2026-09-19

## Status

Phase 4A / 4B / 4C (first pass) are implemented and committed locally. Not pushed.

## Commits

- `95437d6 chore: phase 4a dead code and config cleanup`
- `0df6140 chore: move build-time dependencies to devDependencies`
- `3b28643 chore: add database row types`

## 4A: dead code and config

- Deleted `lib/in-app-browser.ts`, `lib/clerk.ts`, `lib/database/database.js`, root `consant.js`
- Deleted `components/course-info.tsx`, `components/toolbar.tsx`
- Deleted `lib/inference.ts`; moved `MenuItem` to `lib/consant.ts` and updated imports
- Removed `ua_check` / `uuid` / `delay` from `lib/utils.ts`
- Kept only `tailwind.config.js`
- `tsconfig.json`: `target: ES2017`; removed contentlayer paths
- `next.config.js`: `images.remotePatterns`; `reactStrictMode: true`
- Removed unused `sass` dependency

## 4B: dependencies and CI

- Moved build-time deps to `devDependencies`:
  - `typescript`, `eslint`, `eslint-config-next`, `postcss`, `autoprefixer`, `tailwindcss`, `tailwindcss-animate`, `@types/*`
- Added `.github/workflows/ci.yml` with:
  - `npm ci`
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run test`

## 4C: types

- Added `lib/database/types.ts` with:
  - `CourseRow`
  - `ProfWithCourseRow`
  - `CommentPageRow`
- Typed:
  - `getCourseInfo`
  - `getReviewInfo`
  - `getProfListByCourse`
  - `getComentListByCourseIDAndPage`

## Verification

- [x] `npm run test` — 23 files / 55 tests passed
- [x] `npm run lint` — passed
- [x] `node node_modules/typescript/bin/tsc --noEmit` — passed
- [x] `npm run build` — passed; 60 static pages
- [x] isolated `npm ci --ignore-scripts` — passed

## Pending

- R2/OpenNext deployment is still blocked externally by Cloudflare error `10136` (enable R2 / same-account bucket).
- Push is intentionally deferred because push triggers build and the current R2 binding is not deployable until R2 is enabled.
