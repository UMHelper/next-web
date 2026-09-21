# Next Web Timetable Planner Core (P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the localStorage `timetableCart` with authenticated `TimetablePlan` persistence, a global floating planner, and a new `/timetable` planner page.

**Architecture:** Add a server-backed plan model in Supabase and Next API routes. A single client `TimetablePlannerProvider` owns local cache, autosave, offline outbox, and conflict handling. `/timetable` and `FloatingPlanner` render the same new `WeekGrid`.

**Tech Stack:** Next.js 14 App Router, React 18, Clerk, Supabase service-role client, Zod, `usehooks-ts`, Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-21-next-web-timetable-planner-core-design.md`

## Global Constraints

- Plan ownership checks compare `owner_clerk_id` with Clerk `userId`.
- Browser never receives `SUPABASE_SECRET_KEY`.
- New `TimetablePlan` payload is the only source of truth; old `timetableCart` is migration input only.
- `key` is normalized `courseCode|prof|section`; colors are deterministic.
- Limits: max 30 sections, max 20 schedules per section, max 64 KiB payload.
- Autosave debounce is 800ms.
- P1 excludes sharing, `/compare`, catalog search, and WebSocket.

---

### Task 1: Timetable schema and normalization helpers

**Files:** Create `lib/timetable/schema.ts`, `tests/timetable-schema.test.ts`.

**Interfaces:** `normalizeCourseCode`, `normalizeProf`, `normalizeSection`, `makeSectionKey`, `normalizeSchedule`, `normalizePlanSection`, `planPayloadSchema`, `colorForKey`, `TIMETABLE_LIMITS`.

- [ ] Step 1: Write failing tests for key normalization, schedule whitespace/case, duplicate-key rejection, and stable color.
- [ ] Step 2: Run `npm test -- tests/timetable-schema.test.ts`; expect module-not-found.
- [ ] Step 3: Implement Zod schemas and pure helpers. Use `normalizeCourseCode = trim().toUpperCase()`, `normalizeProf = trim().replace(/\\s+/g, " ").toUpperCase()`, `normalizeSection = trim().toUpperCase()`, and deterministic HSL from a string hash.
- [ ] Step 4: Run the test; expect PASS.
- [ ] Step 5: Commit `feat: add timetable schema helpers`.

### Task 2: Conflict detection helpers

**Files:** Create `lib/timetable/conflicts.ts`, `tests/timetable-conflicts.test.ts`.

**Interfaces:** `timeToMinutes`, `schedulesOverlap`, `detectScheduleConflicts`, `findSameCourseSections`.

- [ ] Step 1: Write failing tests for same-day overlap, adjacent boundaries, different days, and same-course different section.
- [ ] Step 2: Run `npm test -- tests/timetable-conflicts.test.ts`; expect module-not-found.
- [ ] Step 3: Implement half-open interval overlap `[start, end)` and a nested pairwise conflict scan.
- [ ] Step 4: Run the test; expect PASS.
- [ ] Step 5: Commit `feat: add timetable conflict detection`.

### Task 3: Legacy timetableCart migration

**Files:** Create `lib/timetable/migrate-legacy-cart.ts`, `tests/timetable-migrate-legacy.test.ts`.

**Interfaces:** `migrateLegacyCart(items, fallbackTerm)`.

- [ ] Step 1: Write failing tests for mapping, dedupe by key, non-empty schedules, and `null` for empty input.
- [ ] Step 2: Run `npm test -- tests/timetable-migrate-legacy.test.ts`; expect module-not-found.
- [ ] Step 3: Implement migration using `normalizePlanSection` and `planPayloadSchema`; drop invalid schedules and duplicate keys.
- [ ] Step 4: Run the test; expect PASS.
- [ ] Step 5: Commit `feat: migrate legacy timetable cart`.

### Task 4: Timetable plan database migration

**Files:** Create `supabase/migrations/20260921_timetable_plan.sql`, `tests/database/timetable-plan-sql.test.ts`.

**Interfaces:** `public.timetable_plan` table with identity PK, `client_ref`, `owner_clerk_id`, term, JSONB payload, `revision`, `share_token`, RLS, and service-role grants.

- [ ] Step 1: Write failing static SQL test asserting table, unique constraints, owner-term index, RLS, and grants.
- [ ] Step 2: Run `npm test -- tests/database/timetable-plan-sql.test.ts`; expect file-not-found.
- [ ] Step 3: Write migration:

```sql
create table public.timetable_plan (
  id bigint generated always as identity primary key,
  client_ref uuid not null,
  owner_clerk_id text not null,
  name text not null,
  year integer not null,
  sem integer not null,
  payload jsonb not null default '{"schemaVersion":1,"sections":[]}'::jsonb,
  schema_version integer not null default 1,
  revision integer not null default 1,
  share_token text,
  share_token_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timetable_plan_owner_client_ref_key unique (owner_clerk_id, client_ref),
  constraint timetable_plan_share_token_key unique (share_token),
  constraint timetable_plan_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint timetable_plan_term_check check (year between 2000 and 2100 and sem between 1 and 3)
);
create index timetable_plan_owner_term_updated_idx
  on public.timetable_plan (owner_clerk_id, year, sem, updated_at desc);
alter table public.timetable_plan enable row level security;
revoke all on public.timetable_plan from anon, authenticated;
grant all on public.timetable_plan to service_role;
grant usage, select on sequence public.timetable_plan_id_seq to service_role;
```

- [ ] Step 4: Run the test; expect PASS.
- [ ] Step 5: Commit `feat: add timetable plan migration`.

### Task 5: Plan API validation and routes

**Files:** Create `lib/validation/timetable.ts`, `app/api/timetable/plans/route.ts`, `app/api/timetable/plans/[id]/route.ts`, `tests/validation/timetable.test.ts`, `tests/api/timetable-plans.test.ts`.

**Interfaces:** `createPlanSchema`, `updatePlanSchema`, `GET`/`POST /api/timetable/plans`, `GET`/`PATCH`/`DELETE /api/timetable/plans/[id]`.

- [ ] Step 1: Write failing validation tests for valid create body and required `baseRevision` on update.
- [ ] Step 2: Run `npm test -- tests/validation/timetable.test.ts`; expect module-not-found.
- [ ] Step 3: Implement Zod schemas:

```ts
export const createPlanSchema = z.object({
  clientRef: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  year: z.number().int().min(2000).max(2100),
  sem: z.number().int().min(1).max(3),
  payload: planPayloadSchema,
});
export const updatePlanSchema = z.object({
  baseRevision: z.number().int().positive(),
  name: z.string().trim().min(1).max(80).optional(),
  payload: planPayloadSchema.optional(),
}).refine((value) => value.name !== undefined || value.payload !== undefined, {
  message: "At least one of name or payload is required",
});
```

- [ ] Step 4: Implement route handlers using `auth()`, `readJsonBody`, `apiError`, and `supabaseAdmin`. `PATCH` must update `where id = id and owner_clerk_id = userId and revision = baseRevision`; no row means fetch current and return `409` with `{ current }`.
- [ ] Step 5: Write API tests mocking Clerk and `supabaseAdmin`, covering 401, non-owner 404, idempotent POST, revision increment, and 409.
- [ ] Step 6: Run `npm test -- tests/validation/timetable.test.ts tests/api/timetable-plans.test.ts`; expect PASS.
- [ ] Step 7: Commit `feat: add timetable plan API`.

### Task 6: Planner store and outbox

**Files:** Create `lib/timetable/store.ts`, `tests/timetable-store.test.ts`.

**Interfaces:** `TimetableStore`, `createEmptyStore`, `upsertPlanLocal`, `removePlanLocal`, `queueMutation`, `coalesceOutbox`, `applyAddSection`, `applyRemoveSection`, `applyReplaceSection`.

- [ ] Step 1: Write failing tests for add, duplicate rejection, remove, replace same-course section, and outbox coalescing.
- [ ] Step 2: Run `npm test -- tests/timetable-store.test.ts`; expect module-not-found.
- [ ] Step 3: Implement immutable store functions. Store shape:

```ts
type LocalPlan = {
  clientRef: string; serverId?: number; name: string; year: number; sem: number;
  payload: { schemaVersion: 1; sections: PlanSection[] }; revision: number;
  updatedAt?: string; syncState: "idle" | "saving" | "offline" | "error" | "conflict";
};
type Mutation = {
  id: string; type: "create_plan" | "update_plan" | "delete_plan";
  clientRef: string; baseRevision: number; payload?: any; name?: string;
  createdAt: number; attempts: number;
};
type TimetableStore = {
  schemaVersion: 1; plans: Record<string, LocalPlan>;
  activePlanByTerm: Record<string, string>; outbox: Mutation[]; importedLegacyCart?: true;
};
```

- [ ] Step 4: Run the test; expect PASS.
- [ ] Step 5: Commit `feat: add timetable planner store`.

### Task 7: TimetablePlannerProvider and API client

**Files:** Create `lib/timetable/client.ts`, `components/timetable/planner-provider.tsx`, `tests/components/planner-provider.test.tsx`.

**Interfaces:** `listPlans`, `createPlan`, `updatePlan`, `deletePlan`, `TimetableApiError`; `TimetablePlannerProvider`, `useTimetablePlanner`.

- [ ] Step 1: Write failing provider tests with mocked Clerk user and fetch: hydration, immediate local add, 800ms autosave flush, and 409 conflict state.
- [ ] Step 2: Run `npm test -- tests/components/planner-provider.test.tsx`; expect module-not-found.
- [ ] Step 3: Implement `lib/timetable/client.ts` using same-origin `fetch`, typed errors, and no direct Supabase access.
- [ ] Step 4: Implement provider: localStorage key `timetable:store:v1:<userId>`, server reconciliation, optimistic actions, outbox flush, online/visibility listeners, and `resolveConflict("keepLocal" | "useServer")`.
- [ ] Step 5: Run the test; expect PASS.
- [ ] Step 6: Commit `feat: add timetable planner provider`.

### Task 8: WeekGrid

**Files:** Create `components/timetable/week-grid.tsx`, `tests/components/week-grid.test.tsx`.

**Interfaces:** `<WeekGrid sections={PlanSection[]} compact={boolean} />`.

- [ ] Step 1: Write failing tests for day labels, event rendering, conflict border, and compact mode hiding location.
- [ ] Step 2: Run `npm test -- tests/components/week-grid.test.tsx`; expect module-not-found.
- [ ] Step 3: Implement a CSS grid: 5 day columns × 24 half-hour rows from 08:00–20:00; events positioned by minutes; overlapping events offset by 8px; conflict border `border-red-500`.
- [ ] Step 4: Run the test; expect PASS.
- [ ] Step 5: Commit `feat: add timetable week grid`.

### Task 9: FloatingPlanner

**Files:** Create `components/timetable/floating-planner.tsx`, `tests/components/floating-planner.test.tsx`; modify `app/layout.tsx`.

**Interfaces:** Global floating button, desktop side panel, mobile bottom sheet; consumes `useTimetablePlanner` and `WeekGrid`.

- [ ] Step 1: Write failing tests for section count, open/close, empty state, and hidden on `/timetable`.
- [ ] Step 2: Run `npm test -- tests/components/floating-planner.test.tsx`; expect module-not-found.
- [ ] Step 3: Implement desktop fixed right collapsed/expanded panel with `WeekGrid compact`, and mobile bottom bar + existing `Sheet`.
- [ ] Step 4: Wrap `app/layout.tsx` children in `TimetablePlannerProvider` and render `<FloatingPlanner />`.
- [ ] Step 5: Run tests; expect PASS.
- [ ] Step 6: Commit `feat: add floating timetable planner`.

### Task 10: `/timetable` planner page

**Files:** Modify `app/timetable/page.tsx`, `components/navbar-list.tsx`; create `components/timetable/plan-header.tsx`, `components/timetable/section-list.tsx`, `tests/components/timetable-page.test.tsx`.

**Interfaces:** Plan selector, rename, create, delete, section list, full `WeekGrid`, empty state.

- [ ] Step 1: Write failing page tests for empty CTA, plan switching, rename, delete confirmation, and conflict count.
- [ ] Step 2: Run `npm test -- tests/components/timetable-page.test.tsx`; expect failure.
- [ ] Step 3: Remove `'none'` sentinel, `timetableCart`, `LazyTimetableCalendar`, and old cart imports. Implement page with provider data.
- [ ] Step 4: Update `components/navbar-list.tsx` to read active plan section count from provider.
- [ ] Step 5: Run page and floating tests; expect PASS.
- [ ] Step 6: Commit `feat: rebuild timetable planner page`.

### Task 11: Review page add-to-timetable and legacy cleanup

**Files:** Modify `components/timetable-card.tsx`, `components/timetable-cart.tsx`, `app/reviews/[code]/[...prof]/page.tsx`; create `tests/components/add-to-timetable.test.tsx`, `tests/no-legacy-timetable-cart.test.ts`.

**Interfaces:** `addSection`, `replaceSection`, duplicate/replace/conflict UI; no source file reads `timetableCart`.

- [ ] Step 1: Write failing tests for duplicate, same-course replace, conflict allow, logged-out sign-in, and no legacy key references.
- [ ] Step 2: Run those tests; expect failure.
- [ ] Step 3: Replace `useLocalStorage` in `timetable-card.tsx` with provider actions; label button `Add to Timetable`; use `sonner` toast.
- [ ] Step 4: Pass `courseTitle`/`credits` from review page and remove `components/timetable-cart.tsx` after imports are gone.
- [ ] Step 5: Run tests; expect PASS.
- [ ] Step 6: Commit `feat: wire timetable add flow and remove legacy cart`.

### Task 12: P1 integration smoke and acceptance

**Files:** Create `docs/superpowers/verification/2026-09-21-next-web-timetable-planner-core.md`.

- [ ] Step 1: Run `npm test`; expect full suite green.
- [ ] Step 2: Run `npm run lint`; expect pass. Run `npm run build` if environment permits; otherwise record exact blocker.
- [ ] Step 3: Write verification notes with commit list, commands, results, manual smoke checklist, and known limitations.
- [ ] Step 4: Commit `chore: verify P1 timetable planner core`.

## Self-Review

- Spec coverage: schema/model, migration, API, provider/outbox, WeekGrid, FloatingPlanner, `/timetable`, review add flow, cleanup, and verification all have tasks.
- Placeholder scan: no TODO/TBD; SQL and main interfaces are concrete.
- Type consistency: `PlanSection`, `TimetablePlanPayload`, `clientRef`, `baseRevision`, and provider action names are consistent across tasks.
