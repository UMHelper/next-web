# AI Assistant Access Control (replaces Clerk `aiPilot` gating)

Date: 2026-10-18
Status: Draft, awaiting review
Supersedes: decision V6 and the "白名单" section of `2026-10-17-next-web-ai-timetable-assistant-v1-design.md` (the Clerk `publicMetadata.aiPilot` + session-token-claim gate). Everything else in that spec (rate limits, route allowlist, DeepSeek, tools) is unchanged.

## 1. Problem

The assistant is gated by Clerk `publicMetadata.aiPilot === true`, read on the server from a custom session-token claim. This has three problems:

1. It needs Clerk Dashboard changes (a session-token template claim and per-user metadata). We do not currently have Dashboard access.
2. Access is per user. There is no way to open the feature to everyone at launch.
3. There is no kill switch short of editing users or redeploying.

## 2. Goals and non-goals

Goals:

- Gate the assistant with a three-state mode: `off` | `admins` | `everyone`.
- During testing (`admins`), only admins can use it. At launch, one change opens it to every signed-in user.
- Change the mode at runtime with no redeploy, with an audit trail.
- Require no Clerk Dashboard configuration.

Non-goals:

- Per-user allowlists beyond "is an admin" (testers are added through the existing Admins page).
- Percentage or cohort rollouts.
- Changing the privacy policy copy (see section 9).

## 3. Access model

`lib/assistant/access.ts` is the single source of truth.

```ts
export type AssistantAccess = "off" | "admins" | "everyone";

export async function getAssistantAccess(): Promise<AssistantAccess>;   // cached read, fails closed to "off"
export async function canUseAssistant(userId: string | null): Promise<boolean>;
```

`canUseAssistant`:

| mode | signed out | signed in, non-admin | signed in, admin |
|---|---|---|---|
| `off` | false | false | false |
| `admins` | false | false | true |
| `everyone` | false | true | true |

"Admin" means the existing definition: `PLATFORM_ADMIN_USER_IDS`, `PLATFORM_ADMIN_EMAILS`, or an active row in `admin_users`.

`lib/admin-auth.ts` change: extract the identity-resolution part of `getCurrentAdmin()` into `resolveAdminSession(userId)`, which returns `AdminSession | null` or a 500-class error result. `getCurrentAdmin()` becomes `auth()` + `resolveAdminSession()`. `canUseAssistant` calls `resolveAdminSession` only in `admins` mode, so there is no admin lookup (no Supabase or Clerk call) in `everyone` or `off` mode. A lookup error in `admins` mode denies access (fail closed).

## 4. Storage

Migration `supabase/migrations/20261018_ai_assistant_access.sql`, also mirrored into `supabase/schema.sql`:

```sql
alter table app_config
  add column if not exists ai_assistant_access text not null default 'off'
  check (ai_assistant_access in ('off', 'admins', 'everyone'));
```

Default `off`: applying the migration changes nothing.

Reads use a dedicated query that selects only `ai_assistant_access`. They are not added to `readAppConfig`'s select list. If the code deployed before the migration, a select on an unknown column would error and `readAppConfig` would silently fall back to defaults for `currentYear` and `currentSem` site-wide. The dedicated read errors only for the assistant, and the assistant fails closed to `off`.

The read is wrapped in `unstable_cache` with `CACHE_TAGS.appConfig` and `revalidate: 300`, the same as `getAppConfig`. The admin write calls `revalidateTag`, so the change is normally immediate. The worst-case lag is 5 minutes if tag revalidation misbehaves on Cloudflare.

`mapAppConfigRow` and `AppConfig` are not touched. The mode is a separate concern with its own parser (`parseAssistantAccess(value): AssistantAccess`, anything unknown becomes `off`).

## 5. Server enforcement

`app/api/copilotkit/[[...slug]]/route.ts`:

- Replace the `isAssistantPilot(sessionClaims)` check with `canUseAssistant(userId)`. Signed out still returns 401. Denied returns 403 with the message "Assistant access required".
- The access check stays first, before config, classification, rate limiting, and body parsing. The exact-path allowlist, `readAssistantConfig`, rate limits, and DeepSeek key check are unchanged.
- The route calls `auth()` once and passes `userId` in.

## 6. Client discovery

Add `GET /api/assistant/access`:

- Response: `{ "enabled": boolean }` with `Cache-Control: private, no-store`.
- Signed out returns `{ enabled: false }` (200). The route uses the same `canUseAssistant`.
- No side effects, no rate-limit consumption.

`components/assistant/assistant-launcher.tsx`:

- Keep `useUser()` only for `isLoaded` and `isSignedIn`. It no longer reads `publicMetadata`.
- When loaded and signed in, fetch the endpoint once on mount.
- Render the button only on `{ enabled: true }`. A network error, non-200 response, malformed body, or signed-out user renders nothing (fail closed).
- Signed-out visitors cause no request.
- `AssistantPanel` remains `dynamic(..., { ssr: false })` and loads on click. The access fetch is a few lines inside the launcher, so the G5 bundle budgets should hold. They are re-checked at the end of implementation.

The client check is a UI hint only. The route is the enforcement point.

## 7. Admin control

API:

- Extend `appConfigUpdateSchema` with `ai_assistant_access: z.enum(["off","admins","everyone"]).optional()`.
- `POST /api/admin/app-config` writes the column. It stays platform-admin only, calls `revalidateTag(CACHE_TAGS.appConfig)`, and writes an audit log entry through the existing `config.update` path.
- `GET /api/admin/app-config` also returns the current mode so the UI can show it. It does this with a separate read of the new column (not through `mapAppConfigRow`), so the existing response shape and tests are unaffected apart from one added field.

UI:

- New platform-admin-only page `/admin/assistant` (`app/admin/assistant/page.tsx` plus a client component), with a nav item `{ href: "/admin/assistant", label: "AI Assistant", platformOnly: true }`.
- Placement: it is the last tab in the admin nav, after "Admins" (nav order: Dashboard, Reports, Comments, Courses, Update, Course Notes, Admins, AI Assistant). The page has a short note linking to the Admins page, since in `Admins only` mode that list decides who can test. Non-platform admins do not see the tab, and a direct visit returns 404 (same guard as `/admin/update`).
- Why its own tab: no existing admin page edits `app_config`, the Update page is the schedule-upload pipeline, and a dedicated page leaves room for future AI settings.
- The page shows the current mode and a three-way selector (Off / Admins only / Everyone) with a short description of each. Selecting "Everyone" asks for confirmation ("All signed-in users will be able to use the assistant and incur DeepSeek cost").
- It follows the page guard pattern of `app/admin/update/page.tsx`.

## 8. Testing

- `canUseAssistant`: all rows of the table in section 3. Admin via env ID, env email, and `admin_users`. Fail closed on a DB error in `admins` mode, and on a read error for the mode itself. `everyone` makes no admin lookup.
- `parseAssistantAccess`: valid values pass, anything else becomes `off`.
- `resolveAdminSession` refactor: existing `tests/admin-auth.test.ts` keeps passing, plus direct tests.
- Copilotkit route: `off` gives 403 for every signed-in user. `admins` gives 403 for non-admins and passes admins. `everyone` passes any signed-in user. Signed out gives 401 in every mode. The existing allowlist and rate-limit tests are updated to mock `canUseAssistant` instead of session claims.
- `GET /api/assistant/access`: the four mode/user combinations, plus signed out.
- Launcher: enabled shows the button. Disabled, error, and non-200 render nothing. Signed out makes no fetch.
- App-config route and schema: `ai_assistant_access` accepted and rejected correctly, the audit log is written, the cache tag is revalidated.
- Admin page: renders the current mode, saves a change, confirms before `everyone`, and is hidden from non-platform admins.
- SQL test alongside `tests/database/app-config-sql.test.ts`: column, default, and check constraint.
- Remove `tests/assistant/pilot.test.ts` and the metadata-based launcher and route tests.

## 9. Removal and docs

- Delete `lib/assistant/pilot.ts` and its test.
- Update the V1 spec: mark V6 and the whitelist section as superseded with a pointer to this document.
- Update the launch checklist in the V1 plan: remove the Clerk session-token claim and `aiPilot` steps, and add the runbook below.
- `lib/privacy-policy.ts` says "(pilot)". The word will be stale after launch. The policy copy is left unchanged here (the earlier decision was to keep it verbatim). Updating it at launch is a separate decision.

## 10. Rollout runbook

1. Apply the migration (default `off`; nothing changes).
2. Deploy. The assistant is hidden and the route returns 403 for everyone.
3. In `/admin/assistant`, set `Admins only`. Admins test with real DeepSeek chats. Add more testers through the existing Admins page.
4. When ready, set `Everyone`.
5. Kill switch: set `Off` at any time, with no redeploy.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Code deployed before the migration | Dedicated narrow read fails closed to `off` and does not affect `app_config` reads elsewhere |
| 5-minute cache lag if `revalidateTag` fails on Cloudflare | Documented; admin write busts the tag, so the lag is normally zero |
| Per-request admin lookup cost in `admins` mode | One env check, plus at most one Supabase row read (and one Clerk user lookup only when `PLATFORM_ADMIN_EMAILS` is set and the ID does not match), on a low-traffic test group; skipped entirely in `everyone` |
| An admin demoted mid-session keeps access until the next request | Access is evaluated on every request, so the effect is immediate on the next call |
| `everyone` opens DeepSeek spend to all users | Existing per-user hourly and daily rate limits and the $300 prepaid cap still apply; confirmation dialog in the UI |
