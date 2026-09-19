# Write API Security Verification — 2026-09-18

## Status

Phase 1A code is implemented and committed. Database migrations have been **syntax-validated in a rollback transaction** but have **not been committed to the target database yet**, because the currently deployed app still uses the publishable key and would break if `anon`/`authenticated` grants were revoked before the new code is deployed.

## Commands run

- [x] `npm run test` — 13 files / 29 tests passed
- [x] `npm run lint` — no warnings or errors
- [x] `node node_modules/typescript/bin/tsc --noEmit` — passed
- [x] `npm run build` — passed; static pages generated; no catalog query crash
- [x] SQL dry-run against `SUPABASE_DB_URL`:
  - `20260918_security_hardening.sql`
  - `20260918_rate_limit.sql`
  - `20260918_get_comment_page_privacy.sql`
  - executed inside `begin; ... rollback;`
  - result: all three validated; transaction rolled back

## Migration apply checklist (after new code is deployed)

- [ ] Confirm production has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
- [ ] Confirm the deployed app is using the new server-side `SUPABASE_SECRET_KEY` client
- [ ] Take a Supabase database backup / snapshot
- [ ] `node scripts/apply-sql.mjs supabase/migrations/20260918_security_hardening.sql`
- [ ] `node scripts/apply-sql.mjs supabase/migrations/20260918_rate_limit.sql`
- [ ] `node scripts/apply-sql.mjs supabase/migrations/20260918_get_comment_page_privacy.sql`
- [ ] `node scripts/apply-sql.mjs scripts/verify-security-hardening.sql` — all `failures = 0`
- [ ] Rotate/disable old Supabase keys after 24h of clean operation
- [ ] Rotate the UM Open Data token upstream if possible

## Smoke tests after migration

- [ ] Web anonymous `POST /api/comment/...` → 401
- [ ] Web anonymous `POST /api/reply` → 401
- [ ] Web anonymous `POST /api/vote/...` → 401
- [ ] Web signed-in comment writes `verify_account = Clerk userId`
- [ ] Web signed-in vote writes `created_by = Clerk userId`
- [ ] iOS write request with `X-UM-Viewer-Id` succeeds
- [ ] iOS write request without `X-UM-Viewer-Id` returns 400
- [ ] `anon` role `select * from comment` → permission denied
- [ ] `get_comment_page` for two viewers returns different `vote_history`
- [ ] `git grep f5aaa86cc5b4424aa621538fceaab34f` → no matches
