# 网页版举报功能验证 — 2026-09-19

## Status

Implemented locally, not pushed.

## Features

- `/api/report` now supports both:
  - iOS HMAC (`verifyIOSRequest` + `iosVersionGuard`)
  - Signed-in Web Clerk (`auth()`)
- Web anonymous reports return 401.
- Web requests only trust `targetId`; comment/course/professor/author/content are loaded from PostgreSQL.
- iOS client-provided `reporterId` is shown as `(client-provided)`; Web reporter is the Clerk user id.
- Added `RATE_LIMIT_REPORT_PER_HOUR=5`; action key supports `report`.
- Added `ReportDialog` on main comment cards and replies for signed-in users.

## Commands run

- [x] `npm run test` — 26 files / 68 tests passed
- [x] `npm run lint` — passed
- [x] `node node_modules/typescript/bin/tsc --noEmit` — passed
- [x] `npm run build` — passed; 60 static pages

## Tests added

- `tests/validation/report.test.ts`
- `tests/api/report.test.ts`
- `tests/components/report-dialog.test.tsx`
- `tests/api-auth.test.ts` report identity cases

## Pending manual smoke

- [ ] Signed-in web user sees Flag on comments/replies
- [ ] Anonymous web user does not see Flag
- [ ] Signed-in web report reaches Telegram with `Source: web`
- [ ] iOS existing report flow still works
- [ ] 6th report in an hour returns 429
