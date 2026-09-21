# Next Web Timetable Workbench (P3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/timetable` into a full course/instructor search workbench with faculty/department filters and inline section adding.

**Architecture:** Add read-only catalog APIs backed by two SQL RPCs. A client `PlannerSidebar` handles search, filters, and drill-down; `/timetable` arranges it beside the P1 WeekGrid. All add actions reuse the P1 provider.

**Tech Stack:** Next.js 14, Clerk, Supabase/Postgres RPC, Zod, React, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-next-web-timetable-workbench-design.md`

## Global Constraints

- Workbench requires Clerk login.
- All add actions call P1 provider actions; no second write path.
- New RPCs are `security invoker`, read-only, filtered and paginated.
- Default page size is 20.
- URL query params are the source of truth for mode, keyword, filters, code, prof, and page.
- P3 excludes drag/drop, export, AI, editing catalog data, and iOS changes.

---

### Task 1: Catalog RPC migration

**Files:** Create `supabase/migrations/20260921_timetable_catalog_rpc.sql`, `tests/database/timetable-catalog-sql.test.ts`.

**Interfaces:** `search_planner_courses(keyword, faculty, department, page_limit, page_offset)`, `search_planner_instructors(keyword, faculty, department, page_limit, page_offset)`.

- [ ] Step 1: Write failing static test asserting both function names, `security invoker`, faculty/department filters, `limit`, `offset`, and `total_count`.
- [ ] Step 2: Run `npm test -- tests/database/timetable-catalog-sql.test.ts`; expect file-not-found.
- [ ] Step 3: Write SQL based on the P3 spec section 6.2. Course RPC joins `course_noporf` with `%keyword%` matches; instructor RPC joins `prof_with_course` to `course_noporf` and groups by `prof_id`. Both use `btrim` and `All` semantics.
- [ ] Step 4: Run test; expect PASS.
- [ ] Step 5: Commit `feat: add timetable catalog RPCs`.

### Task 2: Catalog API routes

**Files:** Create `app/api/timetable/catalog/filters/route.ts`, `app/api/timetable/catalog/search/route.ts`, `app/api/timetable/catalog/courses/[code]/route.ts`, `app/api/timetable/catalog/courses/[code]/[prof]/sections/route.ts`, `tests/api/timetable-catalog.test.ts`.

**Interfaces:** Four read-only endpoints from P3 spec section 6.

- [ ] Step 1: Write failing API tests for 401, invalid mode/type, faculty/department filtering, pagination, course detail, and sections.
- [ ] Step 2: Run test; expect failure.
- [ ] Step 3: Implement `auth()` guard, zod query parsing, and RPC calls via `supabaseAdmin`.
- [ ] Step 4: Filters endpoint returns distinct `offering_unit` / `offering_department` options.
- [ ] Step 5: Course detail reuses `fetchCourseInfo`; sections reuse `getScheduleList`.
- [ ] Step 6: Run test; expect PASS.
- [ ] Step 7: Commit `feat: add timetable catalog API`.

### Task 3: URL query and filter helpers

**Files:** Create `lib/timetable/planner-query.ts`, `tests/timetable-planner-query.test.ts`.

**Interfaces:** `parsePlannerQuery`, `serializePlannerQuery`, `getDepartmentOptions`.

- [ ] Step 1: Write failing tests for defaults, round-trip, invalid mode fallback, page reset, and department dependency.
- [ ] Step 2: Run test; expect module-not-found.
- [ ] Step 3: Implement a single parsed object `{ mode, q, faculty, department, code, prof, page }`; use `router.replace` for typing and `router.push` for drill-down.
- [ ] Step 4: Run test; expect PASS.
- [ ] Step 5: Commit `feat: add planner query helpers`.

### Task 4: Catalog client and hooks

**Files:** Create `lib/timetable/catalog-client.ts`, `lib/timetable/use-catalog-search.ts`, `tests/components/use-catalog-search.test.tsx`.

**Interfaces:** `searchCatalog`, `getCourseDetail`, `getSections`, `useCatalogSearch(query)`.

- [ ] Step 1: Write failing hook tests for debounce 300ms, AbortController cancellation, loading, error, and pagination append.
- [ ] Step 2: Run test; expect failure.
- [ ] Step 3: Implement typed fetch client and hook.
- [ ] Step 4: Run test; expect PASS.
- [ ] Step 5: Commit `feat: add timetable catalog client`.

### Task 5: PlannerSidebar course mode

**Files:** Create `components/timetable/planner-sidebar.tsx`, `components/timetable/course-results.tsx`, `tests/components/planner-sidebar-course.test.tsx`.

**Interfaces:** Course search input, filters, results, course detail, teacher list, section list, Add button.

- [ ] Step 1: Write failing tests for course search rendering, course drill-down, teacher selection, section rendering, and add action.
- [ ] Step 2: Run test; expect failure.
- [ ] Step 3: Implement course mode: search → course → teacher → sections; show `已加入` / `替换` / conflict states.
- [ ] Step 4: Wire filters and pagination from Tasks 3–4.
- [ ] Step 5: Run test; expect PASS.
- [ ] Step 6: Commit `feat: add course mode planner sidebar`.

### Task 6: PlannerSidebar instructor mode

**Files:** Modify `components/timetable/planner-sidebar.tsx`, create `tests/components/planner-sidebar-instructor.test.tsx`.

**Interfaces:** Mode toggle, instructor search, instructor courses, shared section drill-down.

- [ ] Step 1: Write failing tests for mode toggle, instructor results, instructor course drill-down, and filter semantics.
- [ ] Step 2: Run test; expect failure.
- [ ] Step 3: Implement instructor mode using the same section panel as course mode.
- [ ] Step 4: Run test; expect PASS.
- [ ] Step 5: Commit `feat: add instructor mode planner sidebar`.

### Task 7: Workbench page integration

**Files:** Modify `app/timetable/page.tsx`, create `components/timetable/workbench-layout.tsx`, `tests/components/timetable-workbench.test.tsx`.

**Interfaces:** Desktop sidebar + WeekGrid + selected sections drawer; mobile full-screen Sheet.

- [ ] Step 1: Write failing tests for desktop layout, URL state restoration, mobile sheet open/close, and add updates WeekGrid.
- [ ] Step 2: Run test; expect failure.
- [ ] Step 3: Implement desktop two-column layout and mobile bottom button + Sheet. Keep provider as the only write path.
- [ ] Step 4: Ensure `/compare` and floating planner behavior is unchanged.
- [ ] Step 5: Run test; expect PASS.
- [ ] Step 6: Commit `feat: integrate timetable workbench`.

### Task 8: P3 verification

**Files:** Create `docs/superpowers/verification/2026-09-21-next-web-timetable-workbench.md`.

- [ ] Step 1: Run `npm test`; expect green.
- [ ] Step 2: Run `npm run lint`; record result.
- [ ] Step 3: Manual smoke: course mode, instructor mode, faculty/department filter, pagination, add/replace/conflict, refresh URL state, mobile sheet.
- [ ] Step 4: Commit `chore: verify P3 timetable workbench`.

## Self-Review

- Spec coverage: RPCs, catalog APIs, query state, catalog hooks, course mode, instructor mode, filters, layout, mobile sheet, verification.
- Placeholder scan: no TODO/TBD; RPC, API, query, and provider interfaces are named.
- Type consistency: `PlanSection`, provider add actions, `mode`, `faculty`, `department`, `code`, `prof`, and `page` match P1/P2/spec.
