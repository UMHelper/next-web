# Admin Console Verification — 2026-09-19

## Status

Admin console implemented locally, migration applied to the target database, not pushed.

## Implemented

- `PLATFORM_ADMIN_USER_IDS` / `PLATFORM_ADMIN_EMAILS` platform admin injection
- `admin_users`, `reports`, `admin_audit_log` tables + RLS/grant migration
- `requireAdmin()` / `getCurrentAdmin()`
- Reports stored in DB before Telegram best-effort
- Admin APIs:
  - `/api/admin/reports`
  - `/api/admin/comments`
  - `/api/admin/courses`
  - `/api/admin/prof-with-course`
  - `/api/admin/sync-um`
  - `/api/admin/admins`（授权支持 userId / email）
  - `/api/admin/me`（前台导航入口检测）
- Admin pages:
  - `/admin`
  - `/admin/reports`
  - `/admin/comments`
  - `/admin/courses`
  - `/admin/notes`
  - `/admin/admins`
- Frontend entry: Navbar shows an `Admin` icon for admins only
- Admin tabs highlight current page with active state
- Admin tables show more complete fields
- Admin frontend hides Clerk userId; admin/audit views use email instead
- Recent audit log shows field-level change summaries
- Reports / comments / courses / notes / admins auto-load more on scroll
- Audit logs for admin writes
- Comment edit: text/content_en/image/hidden
- Course edit: whitelisted fields + mapping `is_offered`
- Professor-course notes edit: `admin_note` / `admin_note_en` (nullable), on dedicated `/admin/notes`
- Admin grant/revoke: platform admin only, by Clerk userId or email

## Migration

Applied:

```text
supabase/migrations/20260919_admin_console.sql
```

## Commands run

- [x] `npm run test` — 32 files / 89 tests passed
- [x] `npm run lint` — passed
- [x] `node node_modules/typescript/bin/tsc --noEmit` — passed
- [x] `npm run build` — passed; 65 static pages generated
- [x] migration dry-run + actual apply

## Required environment

```env
PLATFORM_ADMIN_USER_IDS=user_xxx,user_yyy
PLATFORM_ADMIN_EMAILS=admin@example.com,owner@example.com
CLERK_SECRET_KEY=...
```

## Pending manual smoke

- [ ] platform admin can access `/admin`
- [ ] admin sees the Navbar `Admin` icon; non-admin does not
- [ ] non-admin is rejected
- [ ] platform admin can grant/revoke a DB admin by userId and by email
- [ ] admin views do not display Clerk userId
- [ ] report submitted from web appears in `/admin/reports`
- [ ] Telegram failure still stores report
- [ ] comment text/image edit and hidden/restore
- [ ] course field edit and `/admin/notes` mapping offered / notes edit
- [ ] professor-course `admin_note` / `admin_note_en` edit appears on review page
- [ ] admin tabs highlight the current page and wider tables remain usable
- [ ] reports / comments / courses / notes / admins auto-load more when scrolled to the bottom
- [ ] recent audit log shows field-level changes
- [ ] sync UM button returns stats
