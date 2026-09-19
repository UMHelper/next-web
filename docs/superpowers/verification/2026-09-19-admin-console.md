# Admin Console Verification — 2026-09-19

## Status

Admin console implemented locally, migration applied to the target database, not pushed.

## Implemented

- `PLATFORM_ADMIN_USER_IDS` platform admin injection
- `admin_users`, `reports`, `admin_audit_log` tables + RLS/grant migration
- `requireAdmin()` / `getCurrentAdmin()`
- Reports stored in DB before Telegram best-effort
- Admin APIs:
  - `/api/admin/reports`
  - `/api/admin/comments`
  - `/api/admin/courses`
  - `/api/admin/prof-with-course`
  - `/api/admin/sync-um`
  - `/api/admin/admins`
- Admin pages:
  - `/admin`
  - `/admin/reports`
  - `/admin/comments`
  - `/admin/courses`
  - `/admin/admins`
- Audit logs for admin writes
- Comment edit: text/content_en/image/hidden
- Course edit: whitelisted fields + mapping `is_offered`
- Admin grant/revoke: platform admin only

## Migration

Applied:

```text
supabase/migrations/20260919_admin_console.sql
```

## Commands run

- [x] `npm run test` — 29 files / 81 tests passed
- [x] `npm run lint` — passed
- [x] `node node_modules/typescript/bin/tsc --noEmit` — passed
- [x] `npm run build` — passed; 65 pages/routes generated
- [x] migration dry-run + actual apply

## Required environment

```env
PLATFORM_ADMIN_USER_IDS=user_xxx,user_yyy
CLERK_SECRET_KEY=...
```

## Pending manual smoke

- [ ] platform admin can access `/admin`
- [ ] non-admin is rejected
- [ ] platform admin can grant/revoke a DB admin
- [ ] report submitted from web appears in `/admin/reports`
- [ ] Telegram failure still stores report
- [ ] comment text/image edit and hidden/restore
- [ ] course field edit and mapping offered toggle
- [ ] sync UM button returns stats
