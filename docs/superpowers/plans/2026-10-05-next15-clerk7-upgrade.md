# Next.js 15 + Clerk 7 Upgrade Implementation Plan

> **For implementation agent:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Upgrade `next-web` to Next.js 15.5.27 and Clerk 7.9.10 while preserving every existing authentication, API, and Cloudflare deployment boundary.

**Architecture:** Clerk middleware only injects request auth state; pages, layouts, and Route Handlers continue to authorize access at the resource boundary. Next.js 15 async route inputs and Clerk 7 async server APIs are awaited at their entry points, while React 18 and the existing data layer remain unchanged.

**Tech Stack:** Next.js 15.5.27, React 18, TypeScript, Clerk 7.9.10, Vitest, ESLint 8, OpenNext Cloudflare 1.14.10, Wrangler 4.

---

## Preconditions

- Work in an isolated feature worktree created with `superpowers:using-git-worktrees`.
- Preserve the unrelated untracked files `scripts/ga4-provision.mjs` and `scripts/gtm-provision.mjs`; never add them to an upgrade commit.
- Use Node.js `>=20.9.0`.
- Do not install `@clerk/mcp-tools` or implement MCP routes in this plan.
- Keep a copy of the pre-upgrade production environment names for rollback; never print Clerk secrets.

### Task 1: Pin the supported framework and authentication baseline

**Files:**
- Create: `tests/clerk7-dependency-contract.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write the failing dependency contract**

Create a test that reads `package.json` and asserts the exact migration boundary:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("Next 15 and Clerk 7 dependency baseline", () => {
  it("pins the reviewed framework and auth versions", () => {
    expect(pkg.dependencies.next).toBe("15.5.27");
    expect(pkg.dependencies["@clerk/nextjs"]).toBe("7.9.10");
    expect(pkg.dependencies["@clerk/backend"]).toBeUndefined();
    expect(pkg.devDependencies["eslint-config-next"]).toBe("15.5.27");
    expect(pkg.engines.node).toBe(">=20.9.0");
    expect(pkg.scripts.lint).toBe("eslint . --max-warnings=0");
  });
});
```

- [ ] **Step 2: Run the test and confirm the old baseline fails**

Run: `npx vitest run tests/clerk7-dependency-contract.test.ts`

Expected: FAIL on the current Next 14 / Clerk 4 versions.

- [ ] **Step 3: Update package metadata and lockfile**

In `package.json`:

- set `next` to exact `15.5.27`;
- set `@clerk/nextjs` to exact `7.9.10`;
- set `eslint-config-next` to exact `15.5.27`;
- remove direct `@clerk/backend`;
- add `"engines": { "node": ">=20.9.0" }`;
- change `lint` to `eslint . --max-warnings=0`;
- keep React, React DOM, ESLint and OpenNext versions unchanged.

Run `npm install` once to update `package-lock.json`. Do not use `--force` or `--legacy-peer-deps`.

- [ ] **Step 4: Verify the package graph**

Run:

```bash
npx vitest run tests/clerk7-dependency-contract.test.ts
npm ls next @clerk/nextjs @clerk/backend eslint-config-next @opennextjs/cloudflare
```

Expected: contract PASS; `npm ls` exits 0; no direct root `@clerk/backend` entry and no peer dependency error.

- [ ] **Step 5: Record the expected migration failures**

Run: `npx tsc --noEmit`

Expected at this point: FAIL only on known Clerk 7 and Next 15 breaking changes such as removed control components, async `auth()` / `clerkClient()`, or Promise route props. Save the error list in the implementation notes and investigate any unrelated failure before continuing.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/clerk7-dependency-contract.test.ts
git commit -m "chore: pin next 15 and clerk 7 baseline"
```

### Task 2: Migrate Clerk middleware, provider, controls, and environment names

**Files:**
- Create: `tests/clerk7-ui-contract.test.ts`
- Modify: `middleware.ts`
- Modify: `components/providers/clerk-provider-client.tsx`
- Modify: `components/navbar-avatar.tsx`
- Modify: `components/mobile-sidebar.tsx`
- Modify: `components/review/comment-card.tsx`
- Modify: `.env.example`
- Regenerate: `cloudflare-env.d.ts`

- [ ] **Step 1: Add a failing Clerk 7 source contract**

The test should read only the files above and assert:

- middleware imports and invokes `clerkMiddleware`, with no `authMiddleware` or middleware `auth.protect()`;
- `SignedIn` and `SignedOut` do not appear in client source;
- `SignInButton` call sites do not use legacy `redirectUrl`;
- `UserButton` does not receive `afterSignOutUrl`;
- `ClerkProvider` receives `afterSignOutUrl="/"`;
- `.env.example` and `cloudflare-env.d.ts` contain both `*_FALLBACK_REDIRECT_URL` names and no `NEXT_PUBLIC_CLERK_AFTER_*` names.

Use targeted file reads rather than scanning generated files or `node_modules`.

- [ ] **Step 2: Run the contract and confirm it fails**

Run: `npx vitest run tests/clerk7-ui-contract.test.ts`

Expected: FAIL on the legacy middleware, control components, redirect props and env names.

- [ ] **Step 3: Replace middleware without moving authorization into it**

Use:

```ts
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

Do not call `auth.protect()` here. `app/admin/layout.tsx` and API guards retain the authorization behavior and JSON errors.

- [ ] **Step 4: Migrate provider and client controls**

- Pass `afterSignOutUrl="/"` on `ClerkProvider` in `ClerkProviderClient`.
- Replace `SignedIn` / `SignedOut` imports and wrappers with `Show when="signed-in"` / `Show when="signed-out"`.
- Remove `afterSignOutUrl` from `UserButton`.
- Replace every `SignInButton redirectUrl={pathname}` with `fallbackRedirectUrl={pathname}`.
- Leave `useUser`, `useAuth`, `SignIn`, and `SignUp` behavior unchanged.

- [ ] **Step 5: Rename redirect environment variables**

In `.env.example`, replace:

```text
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL
```

with:

```text
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
```

Both values remain `/` in `.env.example`. Mirror the variable-name change in the ignored local environment without displaying secret values, then run `npm run cf-typegen` to regenerate `cloudflare-env.d.ts`. Do not hand-edit the generated declaration or its hash.

- [ ] **Step 6: Run focused tests and source search**

Run:

```bash
npx vitest run tests/clerk7-ui-contract.test.ts tests/security/api-route-guards.test.ts
rg -n "authMiddleware|SignedIn|SignedOut|redirectUrl=|NEXT_PUBLIC_CLERK_AFTER_" middleware.ts app components lib .env.example cloudflare-env.d.ts
```

Expected: tests PASS; `rg` produces no legacy use. A `redirectUrl` inside unrelated programmatic code is allowed only after manual review.

- [ ] **Step 7: Commit**

```bash
git add middleware.ts components/providers/clerk-provider-client.tsx components/navbar-avatar.tsx components/mobile-sidebar.tsx components/review/comment-card.tsx .env.example cloudflare-env.d.ts tests/clerk7-ui-contract.test.ts
git commit -m "refactor: migrate clerk middleware and controls"
```

### Task 3: Make shared Clerk server helpers truly asynchronous

**Files:**
- Modify: `tests/api-auth.test.ts`
- Modify: `tests/admin-auth.test.ts`
- Modify: `tests/clerk/user-directory.test.ts`
- Create: `tests/api/admin/admins.test.ts`
- Modify: `lib/api-auth.ts`
- Modify: `lib/admin-auth.ts`
- Modify: `lib/clerk/user-directory.ts`
- Modify: `app/api/admin/admins/route.ts`

- [ ] **Step 1: Change mocks to the Clerk 7 contract first**

- Change all `auth.mockReturnValue(...)` calls in the two auth tests to `auth.mockResolvedValue(...)`.
- Mock `clerkClient` as `vi.fn().mockResolvedValue({ users: { getUserList, getUser } })`, not as a synchronous object.
- Add or preserve assertions proving the Clerk directory cache prevents a second client/API call.
- Create `tests/api/admin/admins.test.ts` with mocked `requireAdmin`, Supabase, audit logging and `clerkClient`. Cover one email lookup and one Clerk user-id lookup, and assert both operations use the client returned by the awaited `clerkClient()` call.

- [ ] **Step 2: Run focused tests and observe failure**

Run:

```bash
npx vitest run tests/api-auth.test.ts tests/admin-auth.test.ts tests/clerk/user-directory.test.ts tests/api/admin/admins.test.ts
```

Expected: FAIL because production code still destructures Promises or reads `clerkClient.users` synchronously.

- [ ] **Step 3: Await Clerk at the helper boundary**

In `lib/api-auth.ts` and `lib/admin-auth.ts`, replace every call with:

```ts
const { userId } = await auth();
```

In `lib/clerk/user-directory.ts`, resolve the client once per missing chunk before `client.users.getUserList(...)`:

```ts
const client = await clerkClient();
const users = await client.users.getUserList(...);
```

In `app/api/admin/admins/route.ts`, resolve one client inside the existing `try` block and use it for either email or ID lookup.

- [ ] **Step 4: Verify shared auth behavior**

Run:

```bash
npx vitest run tests/api-auth.test.ts tests/admin-auth.test.ts tests/clerk/user-directory.test.ts tests/api/admin/admins.test.ts
rg -n "(?<!await )auth\(\)|clerkClient\.users" lib app/api/admin/admins/route.ts --pcre2
```

Expected: tests PASS; search finds no synchronous Clerk call.

- [ ] **Step 5: Commit**

```bash
git add lib/api-auth.ts lib/admin-auth.ts lib/clerk/user-directory.ts app/api/admin/admins/route.ts tests/api-auth.test.ts tests/admin-auth.test.ts tests/clerk/user-directory.test.ts tests/api/admin/admins.test.ts
git commit -m "refactor: await clerk server APIs"
```

Never use `git add .`; keep the two unrelated analytics scripts unstaged.

### Task 4: Migrate authenticated timetable routes and vote lookup

**Files:**
- Modify: `app/api/timetable/catalog/filters/route.ts`
- Modify: `app/api/timetable/catalog/search/route.ts`
- Modify: `app/api/timetable/catalog/courses/[code]/route.ts`
- Modify: `app/api/timetable/catalog/courses/[code]/[prof]/sections/route.ts`
- Modify: `app/api/timetable/catalog/instructors/[prof]/courses/route.ts`
- Modify: `app/api/timetable/plans/route.ts`
- Modify: `app/api/timetable/plans/[id]/route.ts`
- Modify: `app/api/timetable/plans/[id]/share/route.ts`
- Modify: `app/api/timetable/shares/[token]/route.ts`
- Modify: `app/api/vote/me/route.ts`
- Modify: `tests/api/timetable-catalog.test.ts`
- Modify: `tests/api/timetable-plans.test.ts`
- Modify: `tests/api/timetable-share.test.ts`
- Modify: `tests/api/timetable-share-read.test.ts`

- [ ] **Step 1: Upgrade the tests to async Clerk and Promise params**

- Use `authMock.mockResolvedValue(...)` in all four timetable test files.
- Pass dynamic route contexts as `{ params: Promise.resolve({ ... }) }`.
- Add one signed-in happy-path assertion for a dynamic catalog or plan route so tests prove params are awaited, not merely bypassed by an early anonymous return.

- [ ] **Step 2: Run focused tests and confirm the old handlers fail**

Run:

```bash
npx vitest run tests/api/timetable-catalog.test.ts tests/api/timetable-plans.test.ts tests/api/timetable-share.test.ts tests/api/timetable-share-read.test.ts
```

Expected: FAIL because `auth()` and dynamic params are still consumed synchronously.

- [ ] **Step 3: Migrate every handler entry point**

For each auth call:

```ts
const { userId } = await auth();
```

For each dynamic route context:

```ts
{ params }: { params: Promise<{ id: string }> }
const { id } = await params;
```

Use the actual keys for `code`, `prof`, and `token`. Await params once near the top of the handler, after authentication only when the existing handler intentionally rejects anonymous requests before validating path data. Preserve response codes, validation, rate limits and database calls.

- [ ] **Step 4: Verify timetable and guard behavior**

Run:

```bash
npx vitest run tests/api/timetable-catalog.test.ts tests/api/timetable-plans.test.ts tests/api/timetable-share.test.ts tests/api/timetable-share-read.test.ts tests/security/api-route-guards.test.ts
```

Expected: PASS, including JSON `401` for anonymous requests.

- [ ] **Step 5: Commit**

```bash
git add app/api/timetable app/api/vote/me/route.ts tests/api/timetable-catalog.test.ts tests/api/timetable-plans.test.ts tests/api/timetable-share.test.ts tests/api/timetable-share-read.test.ts
git commit -m "refactor: await clerk auth in timetable APIs"
```

### Task 5: Migrate all remaining dynamic Route Handler params

**Files:**
- Modify: `app/api/comment/[code]/[prof]/route.tsx`
- Modify: `app/api/vote/[comment_id]/route.ts`
- Modify: `app/api/admin/admins/[userId]/route.ts`
- Modify: `app/api/admin/comments/[id]/route.ts`
- Modify: `app/api/admin/courses/[code]/route.ts`
- Modify: `app/api/admin/prof-with-course/[id]/route.ts`
- Modify: `app/api/admin/reports/[id]/route.ts`
- Modify: `app/api/admin/supabase/[...path]/route.ts`
- Modify: `tests/api/comment-get.test.ts`
- Modify: `tests/api/comment-post.test.ts`
- Modify: `tests/api/vote.test.ts`
- Modify: `tests/api/admin/prof-with-course.test.ts`
- Modify: `tests/api/admin/supabase-relay.test.ts`

- [ ] **Step 1: Make route tests pass Promise contexts**

Change every test context from:

```ts
{ params: { code: "ACCT1000", prof: "TEACHER" } }
```

to:

```ts
{ params: Promise.resolve({ code: "ACCT1000", prof: "TEACHER" }) }
```

Update the Supabase relay `ctx()` helper to return `Promise.resolve({ path })`. Add focused tests for untested admin dynamic handlers only when their current behavior is not already covered by TypeScript and an adjacent route test; do not duplicate implementation-only assertions.

- [ ] **Step 2: Run the focused suite and confirm failure**

Run:

```bash
npx vitest run tests/api/comment-get.test.ts tests/api/comment-post.test.ts tests/api/vote.test.ts tests/api/admin/prof-with-course.test.ts tests/api/admin/supabase-relay.test.ts
```

Expected: FAIL because current handlers read properties from a Promise.

- [ ] **Step 3: Await dynamic params in every listed handler**

Change context types to `params: Promise<...>` and await once. For the Supabase relay, update the shared `handle()` context type and resolve `path` before allowlist validation. Do not change guard order or expose route params in error details.

- [ ] **Step 4: Verify route behavior and generated types**

Run:

```bash
npx vitest run tests/api/comment-get.test.ts tests/api/comment-post.test.ts tests/api/vote.test.ts tests/api/admin/prof-with-course.test.ts tests/api/admin/supabase-relay.test.ts tests/security/api-route-guards.test.ts
npx tsc --noEmit
```

Expected: focused tests PASS. TypeScript may still fail only on dynamic page props scheduled for Task 6; no Route Handler context error may remain.

- [ ] **Step 5: Commit**

```bash
git add app/api/comment app/api/vote/\[comment_id\] app/api/admin tests/api/comment-get.test.ts tests/api/comment-post.test.ts tests/api/vote.test.ts tests/api/admin/prof-with-course.test.ts tests/api/admin/supabase-relay.test.ts
git commit -m "refactor: await next route params"
```

### Task 6: Migrate all dynamic pages, metadata functions, and layouts

**Files:**
- Modify: `app/catalog/[...departments]/page.tsx`
- Modify: `app/compare/[token]/page.tsx`
- Modify: `app/course/[code]/page.tsx`
- Modify: `app/professor/[...name]/page.tsx`
- Modify: `app/reviews/[code]/[...prof]/page.tsx`
- Modify: `app/search/course/[code]/page.tsx`
- Modify: `app/search/instructor/[...name]/page.tsx`
- Modify: `app/submit/[code]/[prof]/layout.tsx`
- Modify: `app/submit/[code]/[prof]/page.tsx`

- [ ] **Step 1: Use Next-generated types as the failing contract**

Run: `npx tsc --noEmit`

Expected: FAIL on synchronous `params` / `searchParams` and any remaining Clerk 7 type errors. Save the exact page list and reconcile it with the files above before editing.

- [ ] **Step 2: Introduce explicit Promise prop types**

For each file, define a local named prop type with exact route keys. Make page/layout functions async, await `params` once, and pass the resolved primitive values into existing helpers/components.

For metadata:

```ts
export async function generateMetadata({ params }: PageProps) {
  const { code } = await params;
  // existing metadata logic
}
```

For reviews, await both inputs:

```ts
const [{ code, prof }, query] = await Promise.all([params, searchParams]);
```

Remove existing `any` props in the touched signatures. Preserve URL decoding, `notFound()`, pagination and metadata output exactly.

- [ ] **Step 3: Verify TypeScript and SEO/route helpers**

Run:

```bash
npx tsc --noEmit
npx vitest run tests/review-route.test.ts tests/seo/metadata.test.ts tests/seo/course-json-ld.test.tsx tests/components/compare-client.test.tsx
```

Expected: PASS with no App Router prop compatibility error.

- [ ] **Step 4: Commit**

```bash
git add app/catalog/\[...departments\]/page.tsx app/compare/\[token\]/page.tsx app/course/\[code\]/page.tsx app/professor/\[...name\]/page.tsx app/reviews/\[code\]/\[...prof\]/page.tsx app/search/course/\[code\]/page.tsx app/search/instructor/\[...name\]/page.tsx app/submit/\[code\]/\[prof\]/layout.tsx app/submit/\[code\]/\[prof\]/page.tsx
git commit -m "refactor: migrate app router props to next 15"
```

### Task 7: Eliminate migration leftovers and run the complete automated gate

**Files:**
- Modify only files identified by the checks below
- Create: `docs/superpowers/verification/2026-10-05-next15-clerk7-upgrade.md`

- [ ] **Step 1: Search for forbidden legacy patterns**

Run:

```bash
rg -n "authMiddleware|SignedIn|SignedOut|NEXT_PUBLIC_CLERK_AFTER_|redirectUrl=" app components lib middleware.ts .env.example cloudflare-env.d.ts
rg -n "const \{ userId \} = auth\(\)|clerkClient\.users" app lib
rg -n "params:\s*\{[^}]" app --glob '*.{ts,tsx}'
```

Expected: no genuine legacy Clerk or synchronous dynamic prop use. Review every match; avoid blind replacement because `redirectUrl` can be a valid non-Clerk field.

- [ ] **Step 2: Run the full quality gate once**

Run in this order:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run build:pages
```

Expected: all five commands exit 0. If a command fails, use `superpowers:systematic-debugging`, fix the root cause, rerun the narrow failing check, then rerun the remaining gate from that point.

- [ ] **Step 3: Write the verification record**

Record:

- installed versions from `npm ls`;
- Node version;
- each command and exit status;
- any non-blocking warnings and why they are safe;
- confirmation that React remained on 18;
- confirmation that neither MCP code nor iOS HMAC code changed.

- [ ] **Step 4: Commit any verification-only changes**

```bash
git add docs/superpowers/verification/2026-10-05-next15-clerk7-upgrade.md
git commit -m "docs: record next 15 clerk 7 verification"
```

### Task 8: Preview authentication and API boundaries before integration

**Files:**
- Modify: `docs/superpowers/verification/2026-10-05-next15-clerk7-upgrade.md`

- [ ] **Step 1: Configure preview environment safely**

Ensure preview has `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/` and `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`. Keep old production variables during the rollback window. Do not copy secret values into the verification document.

- [ ] **Step 2: Start OpenNext preview and run the smoke matrix**

Run `npm run preview`, then verify:

- public home, course, professor, reviews, search and timetable pages load anonymously;
- modal sign-in returns to the invoking page;
- `/sign-in`, `/sign-up` and sign-out work;
- anonymous `/admin` redirects to sign-in, non-admin is denied, admin loads;
- protected APIs return JSON `401/403`, not HTML;
- comments, replies, votes, reports and timetable CRUD preserve their previous behavior;
- one existing iOS HMAC request still succeeds.

- [ ] **Step 3: Update the verification record and rerun the final diff checks**

Run:

```bash
git diff --check
git status --short
```

Document the preview result, commit the record, and confirm the two unrelated analytics scripts remain untracked and unstaged.

- [ ] **Step 4: Request code review before merge**

Use `superpowers:requesting-code-review`, address findings through `superpowers:receiving-code-review`, then use `superpowers:finishing-a-development-branch` for the integration choice.

## Completion gate

Do not start the GPT plugin implementation until every automated command and preview smoke item above passes. Once this plan is integrated, create the plugin implementation plan from `docs/superpowers/specs/2026-10-05-umhelper-gpt-plugin-design.md`; that plan must include the public `/.well-known/openai-apps-challenge` route and successful OpenAI **Verify Domain** as a release blocker.
