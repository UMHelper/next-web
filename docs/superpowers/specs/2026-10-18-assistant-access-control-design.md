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

- Gate the assistant with a three-state mode: `off` | `testers` | `everyone`.
- During testing (`testers`), only admins and an explicit list of tester emails can use it. At launch, one change opens it to every signed-in user.
- Testers do not need to be admins, so they get no access to the moderation console.
- Change the mode and the tester list at runtime with no redeploy, with an audit trail.
- Require no Clerk Dashboard configuration.

Non-goals:

- Percentage or cohort rollouts.
- Bulk import of testers (add one email at a time in v1).
- Changing the privacy policy copy (see section 10).

## 3. Access model

`lib/assistant/access.ts` (server-only) is the single source of truth. The mode type, mode list, parser, and tester cap live in `lib/assistant/access-mode.ts`, which has no server imports, so the admin UI can use them.

```ts
// lib/assistant/access-mode.ts
export const ASSISTANT_ACCESS_MODES = ["off", "testers", "everyone"] as const;
export type AssistantAccess = (typeof ASSISTANT_ACCESS_MODES)[number];
export const MAX_ASSISTANT_TESTERS = 200;
export function parseAssistantAccess(value: unknown): AssistantAccess;

// lib/assistant/access.ts
export async function readAssistantAccess(): Promise<AssistantAccess>;  // uncached, fails closed to "off"
export const getAssistantAccess: () => Promise<AssistantAccess>;        // cached wrapper
export async function canUseAssistant(userId: string | null): Promise<boolean>;
```

`canUseAssistant`:

| mode | signed out | signed in, other | signed in, tester email | signed in, admin |
|---|---|---|---|---|
| `off` | false | false | false | false |
| `testers` | false | false | true | true |
| `everyone` | false | true | true | true |

"Admin" means the existing definition: `PLATFORM_ADMIN_USER_IDS`, `PLATFORM_ADMIN_EMAILS`, or an active row in `admin_users`.

"Tester" means the user's **verified primary email**, lowercased, is in `assistant_testers`. The email comes from `getDirectoryUser(userId)` (`lib/clerk/user-directory.ts`), which returns only verified primary emails (cached 60 s per isolate), so an unverified email cannot be used to gain access.

Evaluation order in `testers` mode: admin check first, then tester check. Any lookup error (Supabase or Clerk) denies access (fail closed). In `off` and `everyone` modes there is no admin, tester, or Clerk lookup.

`lib/admin-auth.ts` change: extract the identity-resolution part of `getCurrentAdmin()` into `resolveAdminSession(userId)`, which returns `AdminSession | null` or a 500-class error result. `getCurrentAdmin()` becomes `auth()` + `resolveAdminSession()`. `canUseAssistant` reuses it so the two definitions of "admin" cannot drift apart.

## 4. Storage

Migration `supabase/migrations/20261018_ai_assistant_access.sql`, also mirrored into `supabase/schema.sql`:

```sql
alter table public.app_config
  add column if not exists ai_assistant_access text not null default 'off'
  check (ai_assistant_access in ('off', 'testers', 'everyone'));

create table if not exists public.assistant_testers (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  added_by text not null,
  created_at timestamptz not null default now()
);

alter table public.assistant_testers enable row level security;
revoke all on public.assistant_testers from public, anon, authenticated;
grant select, insert, delete on public.assistant_testers to service_role;
```

This follows the existing convention (row-level security on, `service_role` only, as in `20260919_admin_console.sql`). Default mode is `off` and the tester table starts empty, so applying the migration changes nothing.

Mode read: a dedicated query that selects only `ai_assistant_access`. It is not added to `readAppConfig`'s select list. If the code deployed before the migration, a select on an unknown column would error and `readAppConfig` would silently fall back to defaults for `currentYear` and `currentSem` site-wide. The dedicated read errors only for the assistant, and the assistant fails closed to `off`.

The mode read is wrapped in `unstable_cache` with `CACHE_TAGS.appConfig` and `revalidate: 300`, the same as `getAppConfig`. The admin write calls `revalidateTag`, so the change is normally immediate. The worst-case lag is 5 minutes if tag revalidation misbehaves on Cloudflare.

Tester lookup: an uncached single-row read (`select email ... eq email`) per request, only in `testers` mode and only if the user is not an admin. It is uncached so that removing a tester takes effect on the next request.

`mapAppConfigRow` and `AppConfig` are not touched. The mode has its own parser (`parseAssistantAccess(value): AssistantAccess`, anything unknown becomes `off`).

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

- Switch from `useUser()` to `useAuth()` for `isLoaded` and `isSignedIn`, the same pattern as `components/admin-entry.tsx`. It no longer reads `publicMetadata`.
- When loaded and signed in, fetch the endpoint once on mount.
- Render the button only on `{ enabled: true }`. A network error, non-200 response, malformed body, or signed-out user renders nothing (fail closed).
- Signed-out visitors cause no request.
- `AssistantPanel` remains `dynamic(..., { ssr: false })` and loads on click. The access fetch is a few lines inside the launcher, so the G5 bundle budgets should hold. They are re-checked at the end of implementation.

The client check is a UI hint only. The route is the enforcement point.

## 7. Admin control

All admin endpoints here are platform-admin only (`requireAdmin({ platformOnly: true })`).

Mode API:

- Extend `appConfigUpdateSchema` with `ai_assistant_access: z.enum(["off","testers","everyone"]).optional()`.
- `POST /api/admin/app-config` needs no code change: it already spreads the parsed body into the update, calls `revalidateTag(CACHE_TAGS.appConfig)`, and writes a `config.update` audit entry.
- `GET /api/admin/app-config` is unchanged. The admin page reads the current mode on the server with `readAssistantAccess()` and passes it to the client component.

Tester API (modelled on `app/api/admin/admins`):

- `GET /api/admin/assistant-testers`: list testers (email, added_by, added_by_email, created_at), newest first.
- `POST /api/admin/assistant-testers { email }`: validate and lowercase the email (zod `.email()`, max 254), insert, return 201. A duplicate returns 409. Writes an audit entry.
- `DELETE /api/admin/assistant-testers/[email]` (URL-encoded email, like `admins/[userId]`): remove, returns 200 (404 if absent). Writes an audit entry.
- `AuditEntry.action` gains `"assistant_tester.add"` and `"assistant_tester.remove"`, with `targetType: "assistant_tester"` and `targetId: <email>`.
- Body size is capped with `readJsonBody`, as the other admin routes do. The list is capped at 200 testers (insert beyond that returns 409 with a clear message), which bounds the page and abuse by a compromised admin.

UI:

- New platform-admin-only page `/admin/assistant` (`app/admin/assistant/page.tsx` plus a client component), with a nav item `{ href: "/admin/assistant", label: "AI Assistant", platformOnly: true }`.
- Placement: it is the last tab in the admin nav, after "Admins" (nav order: Dashboard, Reports, Comments, Courses, Update, Course Notes, Admins, AI Assistant). Non-platform admins do not see the tab, and a direct visit returns 404 (same guard as `/admin/update`).
- Why its own tab: no existing admin page edits `app_config`, the Update page is the schedule-upload pipeline, and a dedicated page leaves room for future AI settings.
- Section 1, access mode: current mode and a three-way selector (Off / Admins & testers / Everyone) with a one-line description of each. Selecting "Everyone" asks for confirmation ("All signed-in users will be able to use the assistant and incur DeepSeek cost").
- Section 2, testers: shown for all modes, with a note that it only applies in "Admins & testers" mode and that admins always have access. An add-email input with an Add button, and a list (email, who added, date) with a Remove button per row. Emails can be added before the person has signed up.
- It follows the page guard pattern of `app/admin/update/page.tsx`.

## 8. Testing

- `canUseAssistant`: all cells of the table in section 3. Admin via env ID, env email, and `admin_users`. Tester via verified email, and an unverified email is denied. Case-insensitive email match. Fail closed on a DB error, a Clerk error, and a read error for the mode itself. `everyone` and `off` make no lookup.
- `parseAssistantAccess`: valid values pass, anything else becomes `off`.
- `resolveAdminSession` refactor: existing `tests/admin-auth.test.ts` keeps passing, plus direct tests.
- Copilotkit route: `off` gives 403 for every signed-in user. `testers` gives 403 for others and passes admins and testers. `everyone` passes any signed-in user. Signed out gives 401 in every mode. The existing allowlist and rate-limit tests are updated to mock `canUseAssistant` instead of session claims.
- `GET /api/assistant/access`: mode and user combinations, plus signed out.
- Launcher: enabled shows the button. Disabled, error, and non-200 render nothing. Signed out makes no fetch.
- App-config route and schema: `ai_assistant_access` accepted and rejected correctly, the audit log is written, the cache tag is revalidated.
- Tester API: list, add (lowercases, rejects invalid emails, 409 on duplicate and over the cap), remove (200 and 404), audit entries written, non-platform admins get 403, signed out gets 401.
- Admin page: renders the current mode, saves a change, confirms before `everyone`, adds and removes testers, and is hidden from non-platform admins.
- SQL tests alongside `tests/database/app-config-sql.test.ts`: the column, its default and check constraint, and the `assistant_testers` table, check constraint, and grants.
- Remove `tests/assistant/pilot.test.ts` and the metadata-based launcher and route tests.

## 9. Rollout runbook

1. Apply the migration (default `off`, no testers; nothing changes).
2. Deploy. The assistant is hidden and the route returns 403 for everyone.
3. In `/admin/assistant`, add tester emails and set `Admins & testers`. Admins and testers try it with real DeepSeek chats.
4. When ready, set `Everyone`. The tester list is simply ignored from then on.
5. Kill switch: set `Off` at any time, with no redeploy.

## 10. Removal and docs

- Delete `lib/assistant/pilot.ts` and its test.
- Update the V1 spec: mark V6 and the whitelist section as superseded with a pointer to this document.
- Update the launch checklist in the V1 plan: remove the Clerk session-token claim and `aiPilot` steps, and add the runbook above.
- `lib/privacy-policy.ts` says "(pilot)". The word will be stale after launch. The policy copy is left unchanged here (the earlier decision was to keep it verbatim). Updating it at launch is a separate decision.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Code deployed before the migration | Dedicated narrow mode read fails closed to `off`. The tester read errors and denies. Neither affects `app_config` reads elsewhere |
| 5-minute cache lag if `revalidateTag` fails on Cloudflare | Documented; admin write busts the tag, so the lag is normally zero |
| Per-request lookup cost in `testers` mode | Env check, then at most one Supabase admin row read, one Clerk directory lookup (cached 60 s), and one tester row read, on a low-traffic test group; all skipped in `everyone` and `off` |
| Email spoofing to get tester access | Only the verified primary email from Clerk is matched |
| A tester added by email before signing up | Intended: access applies once they sign up with that verified email |
| A removed tester or demoted admin keeps access | Access is evaluated on every request (tester read uncached), so it ends on the next call |
| `everyone` opens DeepSeek spend to all users | Existing per-user hourly and daily rate limits and the $300 prepaid cap still apply; confirmation dialog in the UI |
