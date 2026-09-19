# Phase 1B Correctness Verification — 2026-09-19

## Status

Phase 1B code is implemented and committed locally. It is **not pushed** (per request, to avoid triggering a build).

## Commands run

- [x] `npm run test` — 17 files / 43 tests passed
- [x] `npm run lint` — no warnings or errors
- [x] `node node_modules/typescript/bin/tsc --noEmit` — passed
- [x] `npm run build` — passed; 60 static pages generated
- [x] Isolated `npm ci --ignore-scripts` with the updated `package-lock.json` — passed without `--legacy-peer-deps`

## Behavior verification

- [x] `parseReviewRoute` unit tests: `?page=`, trailing `/2`, invalid pages, frozen input array, `%2C` normalization
- [x] `ReviewNotice` component tests: same note shows once per mount; changed note shows again
- [x] `submitComment` unit tests: 2xx, non-2xx server message, network rejection
- [x] `normalizeFacultySlug` / `getFacultyLabel` unit tests
- [x] Build-time catalog generation passed after canonical `gecourse` change

## Manual smoke checklist (pending browser/deployed verification)

- [ ] `/reviews/ACCT1000/TEACHER` equals `/reviews/ACCT1000/TEACHER/2` and `/reviews/ACCT1000/TEACHER?page=2`
- [ ] Review notice appears once only
- [ ] Submit page: image type/size failure, 400/500, success all release the button
- [ ] `/catalog/gecourse`, `/catalog/GE%20Course`, `/catalog/GECourse`, `/catalog/gecourse/GEGA` all render data
