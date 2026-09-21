# Next Web Timetable Share & Compare (P2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in owner share a live timetable link and let another logged-in user compare it against their own same-term plan with common-free highlighting.

**Architecture:** Reuse P1 plan table and WeekGrid. Add owner share-token APIs, an authenticated shared-plan read API with revision-based polling, a shared-plan hook, and a `/compare/[token]` page.

**Tech Stack:** Next.js 14, Clerk, Supabase admin, Web Crypto, Vitest, React, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-21-next-web-timetable-share-compare-design.md`

## Global Constraints

- Viewer must be Clerk-authenticated; no anonymous link access.
- Never return `owner_clerk_id`, `client_ref`, or `share_token` to a viewer.
- Token is 32 random bytes, URL-safe encoded.
- Live link means latest server `revision`, not a snapshot.
- Polling is 15 seconds, visible-tab only, immediate on focus.
- Common free is Mon–Fri 08:00–20:00, gaps ≥30 minutes.
- No WebSocket, no collaboration, no multi-person rooms.

---

### Task 1: Share token helper

**Files:** Create `lib/timetable/share-token.ts`, `tests/timetable-share-token.test.ts`.

**Interfaces:** `createShareToken()`, `isValidShareToken(value)`.

- [ ] Step 1: Write failing tests for token length ≥40, URL-safe charset, uniqueness across 200 calls, and invalid inputs.
- [ ] Step 2: Run `npm test -- tests/timetable-share-token.test.ts`; expect module-not-found.
- [ ] Step 3: Implement with `crypto.getRandomValues(new Uint8Array(32))` and base64url.
- [ ] Step 4: Run test; expect PASS.
- [ ] Step 5: Commit `feat: add timetable share token helper`.

### Task 2: Owner share API

**Files:** Create `app/api/timetable/plans/[id]/share/route.ts`, `tests/api/timetable-share.test.ts`.

**Interfaces:** `GET` returns current share state; `POST` creates or rotates; `DELETE` revokes.

- [ ] Step 1: Write failing API tests for 401, non-owner 404, create, idempotent get, rotate invalidating old token, and revoke.
- [ ] Step 2: Run test; expect failure.
- [ ] Step 3: Implement owner auth and Supabase reads/writes. `GET` returns `{ shared, token, url }` or `{ shared: false }`; `POST` honors `{ rotate?: boolean }`; `DELETE` clears both token columns.
- [ ] Step 4: Use full URL `${new URL(request.url).origin}/compare/${token}`.
- [ ] Step 5: Run test; expect PASS.
- [ ] Step 6: Commit `feat: add timetable share API`.

### Task 3: Shared plan read API with revision

**Files:** Create `app/api/timetable/shares/[token]/route.ts`, `tests/api/timetable-share-read.test.ts`.

**Interfaces:** `GET /api/timetable/shares/[token]?revision=`.

- [ ] Step 1: Write failing tests for 401 unauth, 404 invalid token, 200 sanitized payload, 304 unchanged revision, and no internal fields.
- [ ] Step 2: Run test; expect failure.
- [ ] Step 3: Implement `auth()` check, token lookup, revision compare, and `new Response(null, { status: 304 })` for unchanged.
- [ ] Step 4: Return only `{ plan: { name, year, sem, revision, updatedAt, payload } }`.
- [ ] Step 5: Run test; expect PASS.
- [ ] Step 6: Commit `feat: add shared timetable read API`.

### Task 4: Common-free calculation helper

**Files:** Create `lib/timetable/common-free.ts`, `tests/timetable-common-free.test.ts`.

**Interfaces:** `computeCommonFree(planA, planB): Array<{ date: "MON"|...; start: string; end: string }>`.

- [ ] Step 1: Write failing tests for full free day, one side busy, overlapping classes, gaps <30 min filtered, and clamp to 08:00–20:00.
- [ ] Step 2: Run test; expect module-not-found.
- [ ] Step 3: Implement per-day busy interval merge and complement in minutes; return `HH:mm` strings.
- [ ] Step 4: Run test; expect PASS.
- [ ] Step 5: Commit `feat: add timetable common-free helper`.

### Task 5: `useSharedPlan` polling hook

**Files:** Create `lib/timetable/use-shared-plan.ts`, `tests/components/use-shared-plan.test.tsx`.

**Interfaces:** `useSharedPlan(token, { enabled })` returns `{ plan, revision, loading, stale, error, refresh }`.

- [ ] Step 1: Write failing tests with fake timers: initial fetch, 304 no state change, 15s visible poll, hidden pause, focus immediate refresh, and abort on unmount.
- [ ] Step 2: Run test; expect module-not-found.
- [ ] Step 3: Implement recursive `setTimeout`, `visibilitychange`, and `AbortController`.
- [ ] Step 4: Run test; expect PASS.
- [ ] Step 5: Commit `feat: add shared plan polling hook`.

### Task 6: Compare page and plan selector

**Files:** Create `app/compare/[token]/page.tsx`, `components/timetable/compare-client.tsx`, `components/timetable/own-plan-select.tsx`, `tests/components/compare-client.test.tsx`.

**Interfaces:** `<CompareClient sharedPlan={...} />` loads viewer plans via provider and renders selector + dual views.

- [ ] Step 1: Write failing tests for same-term plan selection, no-own-plan CTA, term mismatch warning, and invalid-token state.
- [ ] Step 2: Run test; expect failure.
- [ ] Step 3: Implement server page with Clerk redirect and `auth()`; pass token data to client.
- [ ] Step 4: In client, read own plans from `useTimetablePlanner`, default to most recent same-term plan, and expose dropdown.
- [ ] Step 5: Render `WeekGrid` twice with labels `对方方案` / `我的方案`; render common free list and green highlight.
- [ ] Step 6: Run test; expect PASS.
- [ ] Step 7: Commit `feat: add timetable compare page`.

### Task 7: Share dialog on `/timetable`

**Files:** Create `components/timetable/share-dialog.tsx`, `tests/components/share-dialog.test.tsx`; modify `components/timetable/plan-header.tsx`.

**Interfaces:** `ShareDialog({ plan })` handles GET/POST/DELETE; copy, rotate, revoke.

- [ ] Step 1: Write failing tests for not-shared state, create, copy, rotate confirmation, revoke, and API error toast.
- [ ] Step 2: Run test; expect failure.
- [ ] Step 3: Implement `Dialog` with link input, copy button, “重新生成” confirm, and “撤销分享”.
- [ ] Step 4: Add “分享” button to plan header.
- [ ] Step 5: Run test; expect PASS.
- [ ] Step 6: Commit `feat: add timetable share dialog`.

### Task 8: Rate-limit and error hardening

**Files:** Modify `lib/api-auth.ts`, `lib/validation/timetable.ts`, `app/api/timetable/plans/[id]/share/route.ts`, `app/api/timetable/shares/[token]/route.ts`; create tests if missing.

**Interfaces:** `share_write` and `share_read` rate-limit actions.

- [ ] Step 1: Write failing tests for share write limit 30/hour and share read limit 120/minute.
- [ ] Step 2: Run tests; expect failure.
- [ ] Step 3: Extend existing rate-limit action union and apply consume calls.
- [ ] Step 4: Ensure revoked/deleted plans return 404, not 500.
- [ ] Step 5: Run tests; expect PASS.
- [ ] Step 6: Commit `feat: harden timetable sharing`.

### Task 9: P2 verification

**Files:** Create `docs/superpowers/verification/2026-09-21-next-web-timetable-share-compare.md`.

- [ ] Step 1: Run `npm test`; expect green.
- [ ] Step 2: Run `npm run lint`; record result.
- [ ] Step 3: Write two-account manual smoke: A creates plan, shares; B logs in, selects same-term plan, sees dual view and common free; A edits, B updates within 15s; A revokes, B sees invalid link.
- [ ] Step 4: Commit `chore: verify P2 timetable share and compare`.

## Self-Review

- Spec coverage: token, owner APIs, viewer API, 304 polling, compare page, common free, share UI, rate limit, verification.
- Placeholder scan: no TODO/TBD; token, API shape, and common-free behavior are concrete.
- Type consistency: `share_token`, `revision`, `payload`, `PlanSection`, and `useSharedPlan` names match P1 and the spec.
