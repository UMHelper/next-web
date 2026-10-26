# V2.3.5-B Intelligent Course Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `discover_course_candidates` tool. From a student's scope, hard rules and soft preferences, it returns ranked, section-level, fit-checked candidates for the active term. The candidates can be shown through the existing `present_response` shortlist.

**Architecture:**
- The tool does 3 batched PostgREST reads (catalog → `prof_with_course` → term `offer` rows with embedded meetings), done by `lib/assistant/data/discovery.ts`.
- A pure TypeScript engine in `lib/assistant/discovery/` builds sections, applies rules, computes fit with the shared conflict function, and ranks with confidence-shrunk ratings.
- Presentation is extended so recommendations can be grounded in discovery results and carry a section. The shortlist shows a fit badge gated on the live planner version.

**Tech Stack:** TypeScript, zod (v3 `zod` for tool params and results, as in `check-plan-conflicts.ts`), Supabase PostgREST (`supabaseServer`), CopilotKit runtime v2 `defineTool`, React 19 + Tailwind, Vitest + Testing Library, live DeepSeek eval harness in `evals/assistant/`.

**Spec:** `docs/superpowers/specs/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md`

## Global Constraints

- **Read-only.** No planner writes, and no import of `@/lib/timetable/client` or of the mutators listed in `tests/assistant/read-only-planner.test.ts`.
- **Term.** Active term only, from `getAppConfig()` `currentYear/currentSem`. Offers are always filtered by `year`/`sem`, and catalog `Is_Offered = 1`.
- **Difficulty.** 1 = Very hard, 5 = Very easy. Higher is easier. Never invert it.
- **Fit values.** `verified_no_clash | confirmed_clash | incomplete | not_checked`.
  - `verified_no_clash` requires all three: candidate complete, plan complete, and plan not truncated.
  - A known overlap is always `confirmed_clash`.
- **Shrinkage.** `adjusted = (n·mean + 5·3.0)/(n + 5)`. Use `SMALL_REVIEW_SAMPLE` (5) from `lib/assistant/rating-semantics.ts`.
- **Bounds.**
  - `MAX_POOL_COURSES = 150` and `IN_CHUNK = 200`.
  - Candidates are 1..8 (default 5), each with ≤3 `otherSections`.
  - `unverified` ≤5, `noListedSections` ≤10.
  - Review enrichment: top 3 candidates, ≤6 pwc ids, 8 reviews each, ≤2 excerpts of ≤120 code points.
  - `MAX_DISCOVERY_RESULT_CHARS = 12_000`.
- **Tool name.** `discover_course_candidates`. Its activity labels are "Finding courses" / "Found courses".
- **Presentation.**
  - `present_response.recommendations.courses` holds ≤5 unique course codes. Each is `CODE` or `CODE-SECTION`.
  - Retrieval tools never mount UI.
  - `preview_timetable` stays the only always-rich tool.
- **No DB migration.** No new dependencies.
- **Gates.** `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.

## Review Focus

1. **Saved plan with a section that has no class times** (`planComplete:false`). Expect no `verified_no_clash` anywhere: in discovery, in `check_plan_conflicts`, and in the shortlist badge. Covered by Task 1 and Task 6 tests.
2. **Planner edited after a discovery turn.** Expect the old shortlist badge to read "Timetable changed – ask me to re-check" and never "No clash". Covered by Task 9 and Task 11 tests.
3. **Course whose sections are only listed under an old (equivalent) code.** Expect the candidate under the primary code with its sections, and no duplicate course. Covered by Task 5 and Task 6 tests.
4. **Co-taught section** (two instructors, same section number). Expect one candidate section listing both instructors, with ratings weighted by review count. Covered by Task 3 and Task 4 tests.
5. **Broad scope beyond 150 courses.** Expect `examined.truncated: true` with `totalMatchingCourses`, and the model told the search was bounded rather than exhausted. Covered by Task 5 and Task 6 tests.

---

### Task 1: Strict shared fit function

**Files:**
- Modify: `lib/assistant/check-plan-conflicts.ts`
- Test: `tests/assistant/check-plan-conflicts.test.ts`

**Interfaces:**
- Produces:
  - `conflictFitForSection(input: { complete: boolean; conflicts: readonly unknown[]; planComplete: boolean }): ConflictFit`
  - exported `conflictsForCandidate(plan: PlanSection[], candidate: PlanSection): SectionCheck["conflicts"]`

- [ ] **Step 1: Write failing tests** in `check-plan-conflicts.test.ts`:
  - `conflictFitForSection` cases:
    - `{complete:true, conflicts:[], planComplete:true}` → `verified_no_clash`
    - `{complete:true, conflicts:[], planComplete:false}` → `incomplete`
    - `{complete:false, conflicts:[{}], planComplete:true}` → `confirmed_clash`
    - `{complete:false, conflicts:[], planComplete:true}` → `incomplete`
  - `"never verifies a section while the saved plan has unscheduled sections"`: `readyState()` (has `GEND1001-001` unscheduled), ECON1001 002 → `fit: "incomplete"`, `conflicts: []`.
  - `"never verifies when the timetable context was truncated"`: a complete plan with `truncated: true` → `incomplete`.
  - Rewrite `"does not count end-to-start as a conflict"` to use a complete plan (the fixture without `GEND1001-001`). It still expects `verified_no_clash`.
- [ ] **Step 2: Run** `npx vitest run tests/assistant/check-plan-conflicts.test.ts`. Expect FAIL on the new cases.
- [ ] **Step 3: Implement.**
  - Change the fit order: conflicts first, then completeness.
  - In `runCheckPlanConflicts`, pass `planComplete: analysis.complete && !state.truncated`.
  - Export `conflictsForCandidate`.
- [ ] **Step 4: Run** `npx vitest run tests/assistant evals tests/components/assistant-v2-3*.tsx`. Expect PASS. Any other expectation that encoded the old gap is updated, and the change is recorded in the commit message.
- [ ] **Step 5: Commit** `fix(assistant): verify no-clash only against a complete saved plan`.

### Task 2: Discovery contract and time rules

**Files:**
- Create: `lib/assistant/discovery/schema.ts`, `lib/assistant/discovery/constraints.ts`
- Test: `tests/assistant/discovery-schema.test.ts`, `tests/assistant/discovery-constraints.test.ts`

**Interfaces:**
- Produces (`schema.ts`):
  - `DISCOVER_COURSE_CANDIDATES_TOOL_NAME = "discover_course_candidates"`
  - `discoverCourseCandidatesParameters`: a zod object with no refinements, used as the tool `parameters`.
  - `discoverCourseCandidatesInputSchema`: `parameters.superRefine(...)`.
  - `type DiscoverInput`, `type DiscoveryScope = DiscoverInput["scope"]`, `type TimeRules`, `type DiscoveryWeekday = "MON"|"TUE"|"WED"|"THU"|"FRI"|"SAT"`, `type DiscoveryPriority`, `type DiscoveryFit = ConflictFit | "not_checked"`
  - `discoverResultSchema` (spec §6 shape, `.strict()` objects) and `type DiscoverResult`
  - `parseDiscoverResult(content: unknown): DiscoverResult | null`. It accepts a string or an object.
- Produces (`constraints.ts`):
  - `type Meeting = { day: DiscoveryWeekday | "SUN"; start: string; end: string }`
  - `type RuleOutcome = { rule: "startAfter"|"endBefore"|"avoidDays"|"avoidWindows"|"fewerDays"; label: string; status: "met"|"violated"|"unknown" }`
  - `evaluateTimeRules(meetings: Meeting[], meetingsComplete: boolean, rules: TimeRules | undefined, fewerDays?: boolean): RuleOutcome[]` returns one outcome per stated rule and one per avoid window.

- [ ] **Step 1: Write failing schema tests:**
  - Empty `scope` → `safeParse` fails.
  - `scope: { credits: 3 }` alone fails (credits is not a scope anchor).
  - `scope: {codePrefix:"gest"}` passes and is upper-cased to `GEST`.
  - `codePrefix: "GE%"` fails.
  - `required.startAfter: "25:00"` fails.
  - `required: {startAfter:"14:00", endBefore:"10:00"}` fails.
  - `avoidWindows: [{start:"13:00", end:"12:00"}]` fails.
  - `topics` with 6 items fails.
  - `limit` defaults to 5, and `limit: 9` fails.
  - `priorities: ["easier","easier"]` fails (duplicates).
  - `reviewTerms` with 4 items fails.
  - `parseDiscoverResult('{"error":"invalid_request"}')` → `null`.
- [ ] **Step 2: Write failing constraint tests:**
  - **startAfter.** For `startAfter "10:00"`:
    - meeting `MON 10:00-11:15` → met.
    - `MON 08:30-09:45` → violated.
    - Incomplete meetings plus one 11:00 meeting → `unknown`.
    - Incomplete meetings plus one 08:30 meeting → `violated`, since a known violation wins.
  - **endBefore "17:00".** `16:00-17:15` → violated.
  - **avoidDays ["FRI"].** A Mon/Thu section → met. A Tue/Fri section → violated, label `"no FRI"`.
  - **avoidWindows.** `{start:"12:00", end:"14:00"}`:
    - `11:30-12:45` → violated.
    - `10:30-12:00` → met (touching).
    - With `days:["MON"]`, a THU 12:30 meeting → met.
  - **fewerDays.** Mon/Thu → met. Mon/Wed/Fri → violated.
  - Zero meetings with `meetingsComplete:false` → every rule `unknown`.
- [ ] **Step 3: Run** `npx vitest run tests/assistant/discovery-schema.test.ts tests/assistant/discovery-constraints.test.ts`. Expect FAIL (modules missing).
- [ ] **Step 4: Implement both modules.** `.describe()` text on every parameter states the hard/soft meaning ("required: only what the student says must/cannot happen"). Time comparison uses `timeToMinutes` from `lib/timetable/conflicts.ts`.
- [ ] **Step 5: Run** the same command. Expect PASS.
- [ ] **Step 6: Commit** `feat(assistant): discovery input contract and time-rule evaluation`.

### Task 3: Pool types and section assembly

**Files:**
- Create: `lib/assistant/discovery/pool.ts` (types only), `lib/assistant/discovery/sections.ts`
- Test: `tests/assistant/discovery-sections.test.ts`, `tests/fixtures/discovery-pool.ts` (shared fixture builders)

**Interfaces:**
- Produces (`pool.ts`):
  - `PoolCourse { courseCode; titleEn; titleZh; credits: string|null; courseType: string|null; suggestedYear: number|null; faculty; department; aka: string[]; topicTitle: string; topicBody: string }`
  - `PoolInstructorRow { pwcId: number; courseCode: string /* primary */; instructor: string; reviews: number; result; grade; difficulty; reward: number|null }`
  - `PoolOffer { pwcId: number; section: string; meetings: { date: unknown; times: unknown; location: unknown }[] }`
  - `DiscoveryPool { term: {year; sem}; totalMatchingCourses: number; truncated: boolean; courses: PoolCourse[]; instructorRows: PoolInstructorRow[]; offers: PoolOffer[] }`
  - `ReviewTextRow { pwcId: number; texts: string[] }`
- Produces (`sections.ts`):
  - `SectionCandidate { courseCode; section; label /* CODE-SEC */; instructors: PoolInstructorRow[]; meetings: Meeting[]; meetingLines: string[]; meetingsComplete: boolean; planSection: PlanSection }`
  - `buildSectionCandidates(pool: DiscoveryPool): SectionCandidate[]`. Order is course code asc, then section asc.
- Fixture (`tests/fixtures/discovery-pool.ts`): `poolCourse(partial)`, `pwcRow(partial)`, `offer(pwcId, section, meetings: string[] /* "MON 10:00-11:15" */)`, `pool(partial)`.

- [ ] **Step 1: Write failing tests:**
  - **Co-taught.** Two pwc rows with the same `001` and identical meetings → one candidate, two instructors, meetings deduped to 2 lines.
  - **Multiple sections.** Two sections of one course → two candidates.
  - **Unparseable time.** A meeting with `times: "TBA"` → `meetingsComplete:false`. The meeting is skipped, and the others are kept.
  - **No meetings.** An offer with zero meetings → `meetingsComplete:false`, `meetings: []`.
  - **Saturday.** A SAT meeting is kept in `meetings` but `meetingsComplete:false`, because the planner cannot hold SAT.
  - **Format.** Times `"8:30-9:45"` are padded to `08:30-09:45`.
  - **Missing pwc row.** An offer whose `pwcId` has no instructor row is ignored.
  - **Normalization.** Section `" 001 "` is normalized to `001`. `planSection.key` equals `makeSectionKey(code, firstInstructor, "001")`.
- [ ] **Step 2: Run** `npx vitest run tests/assistant/discovery-sections.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - Reuse `parseWeekday` and `parseSectionTimeRange` from `lib/mcp/data/get-course-sections.ts`, and `normalizePlanSection` / `normalizeSection` from `lib/timetable/schema.ts`.
  - Co-taught meeting sets are unioned. A union is conservative for clash detection.
- [ ] **Step 4: Run** the same command. Expect PASS.
- [ ] **Step 5: Commit** `feat(assistant): assemble section-level discovery candidates`.

### Task 4: Ranking

**Files:**
- Create: `lib/assistant/discovery/rank.ts`
- Test: `tests/assistant/discovery-rank.test.ts`

**Interfaces:**
- Consumes: `SectionCandidate` (Task 3), `RuleOutcome` (Task 2), `DiscoveryFit`, `DiscoveryPriority`.
- Produces:
  - `shrunkSignal(rows: PoolInstructorRow[], metric: "difficulty"|"grade"|"result"|"reward"): { mean: number|null; adjusted: number; reviews: number }`. `mean` is the review-weighted mean over rows with `reviews > 0` and a value > 0. `adjusted` uses the Global Constraints formula, with `adjusted = 3` when there are no reviews.
  - `rankingWeights(input: { priorities: DiscoveryPriority[]; hasPreferred: boolean; hasTopics: boolean }): Array<{ key: DiscoveryPriority | "schedule"; weight: number }>`. Weights are normalized to sum to 1.
  - `scoreSection(input: { section: SectionCandidate; preferred: RuleOutcome[]; topicScore: number; fit: DiscoveryFit; clashWith: string[]; weights: ReturnType<typeof rankingWeights> }): { score: number; signals: Partial<Record<"ease"|"grade"|"rating"|"usefulness", {mean:number|null; adjusted:number; reviews:number}>>; tradeoffs: string[]; matched: string[] }`
  - `topicScore(course: PoolCourse, topics: string[]): number`
  - `compareRanked(a: {score; reviews; courseCode; section}, b: same): number`
  - `RANKING_NOTE: string`

- [ ] **Step 1: Write failing tests:**
  - **Shrinkage.**
    - 5.0 difficulty from 1 review → adjusted ≈ 3.33.
    - 4.0 from 100 reviews → adjusted ≈ 3.95.
    - With priority `easier`, the 100-review section outranks the 1-review one.
  - **Difficulty direction.** Difficulty 4.5 (easier) scores higher than 1.5 under `easier`, all else equal.
  - **No reviews.** Signal adjusted = 3. Trade-offs include `"no reviews"`.
  - **Small sample.** reviews = 2 → trade-off `"only 2 reviews"`.
  - **Co-taught weighting.** Rows (4.0 × 10 reviews, 2.0 × 30 reviews) → mean 2.5.
  - **Weights.**
    - `rankingWeights({priorities:["easier","higher_grades"], hasPreferred:true, hasTopics:false})` → keys `easier, higher_grades, schedule`, raw 0.40/0.25/0.35, normalized to sum 1.
    - No priorities → `[{key:"better_rated", weight:1}]`.
  - **Scenario F.**
    - Easiest section (difficulty 4.8, 40 reviews) meets 08:30 with preferred `startAfter 12:00` violated.
    - Second section (difficulty 4.0, 40 reviews) meets 14:30 with it met.
    - The second scores higher. The first's trade-offs mention the start time.
  - **Clash penalty.** `confirmed_clash` halves the score, with trade-off `"clashes with GEGA1000-007"`. `incomplete` multiplies by 0.9.
  - **Topic.** Topics `["Macao","history"]`: title "History of Macao" → 1; title-less body match on one topic → 0.25.
  - **Tie-break.** Equal score → more reviews first → code asc → section asc. Sorting a shuffled array twice gives an identical order.
- [ ] **Step 2: Run** `npx vitest run tests/assistant/discovery-rank.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** per spec §8. Priority → metric mapping: `easier→difficulty→ease`, `higher_grades→grade`, `better_rated→result→rating`, `more_useful→reward→usefulness`. `topic_match` uses `topicScore`.
- [ ] **Step 4: Run** the same command. Expect PASS.
- [ ] **Step 5: Commit** `feat(assistant): confidence-aware discovery ranking`.

### Task 5: Batched data loader

**Files:**
- Create: `lib/assistant/data/discovery.ts`
- Test: `tests/assistant/discovery-data.test.ts`

**Interfaces:**
- Consumes: `DiscoveryScope` (Task 2), pool types (Task 3), `sanitizeSearchTerm` from `lib/assistant/data/search-catalog.ts`.
- Produces:
  - `MAX_POOL_COURSES = 150`
  - `loadDiscoveryPool(scope: DiscoveryScope, term: {year:number; sem:number}, signal: AbortSignal, client?: SupabaseLike): Promise<DiscoveryPool>`
  - `loadReviewTexts(pwcIds: number[], signal: AbortSignal, client?: SupabaseLike): Promise<ReviewTextRow[]>`
  - `type SupabaseLike = Pick<typeof supabaseServer, "from">`, defaulting to `supabaseServer`
  - Read errors throw `McpToolError("temporarily_unavailable")`.

**Queries:**
1. **Catalog.** `course_catalog.select(cols, {count:"exact"}).eq("Is_Offered",1)`.
   - Columns: `New_code, courseTitleEng, courseTitleChi, Offering_Unit, Offering_Department, Credits, courseType, suggestedYearOfStudy, equivalent_codes`, plus `courseDescription, ilo` only when topics are given.
   - Filters:
     - `courseType` → `eq`
     - `codePrefix` → `ilike "PREFIX%"`
     - `faculty` / `department` → `eq`
     - `maxSuggestedYear` → `lte`
     - `credits` → `in("Credits", [String(n), n.toFixed(1), n.toFixed(2)])`
     - topics → one `.or()` of `field.ilike.%term%` across `courseTitleEng, courseTitleChi, courseDescription, ilo` for each sanitized topic
     - `excludeCodes` → `not.in`
   - Ordered by `New_code`, `.range(0, MAX_POOL_COURSES-1)`.
2. **Instructor rows.** `prof_with_course.select("id,course_id,prof_id,comments,result,grade,hard,reward").in("course_id", codes ∪ equivalents)`, chunked at 200. Each row maps back to its primary code through `equivalent_codes`.
3. **Offers.** `offer.select("course_id,section,schedule(time_location(date,times,location))").eq("year",y).eq("sem",s).in("course_id", pwcIds)`, chunked at 200.

**Reviews:** per pwc id (≤6, `Promise.all`), `comment.select("content,content_en").eq("course_id", id).is("replyto", null).neq("hidden", 1).order("pub_time", {ascending:false}).limit(8)`.

- [ ] **Step 1: Write failing tests** with a recording fake client: a chainable builder that records `table`, the method calls and their args, and resolves to configured `{data, error, count}`.
  - Without topics: exactly 3 `from()` calls (`course_catalog`, `prof_with_course`, `offer`), and the catalog `select` string has no `courseDescription`.
  - `offer` query has `eq("year",2026)` and `eq("sem",1)`.
  - A pwc row with `course_id` = an old code listed in `equivalent_codes` maps to the primary `courseCode`.
  - 450 pwc ids → 3 offer requests (chunking).
  - `count: 400` with 150 rows → `truncated:true`, `totalMatchingCourses:400`.
  - Catalog `error` → rejects with `McpToolError` code `temporarily_unavailable`.
  - Topics `["Macao", "a,b(c)"]` → the `.or` argument contains no raw `,` or `(` from user input; it relies on `sanitizeSearchTerm`.
  - `credits: 3` → `in("Credits", ["3","3.0","3.00"])`.
  - Empty catalog result → 1 request only, and an empty pool.
  - `loadReviewTexts([1,2])` → 2 `comment` queries, each with `is("replyto", null)` and `neq("hidden", 1)`, returning `content` and `content_en` texts.
- [ ] **Step 2: Run** `npx vitest run tests/assistant/discovery-data.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** as above. Skip the pwc and offer reads when there is nothing to look up.
- [ ] **Step 4: Run** the same command. Expect PASS.
- [ ] **Step 5: Commit** `feat(assistant): batched discovery pool reads`.

### Task 6: Discovery orchestrator

**Files:**
- Create: `lib/assistant/discovery/discover.ts`
- Test: `tests/assistant/discovery.test.ts`, `tests/assistant/discovery-performance.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5. `TimetableState` from `lib/assistant/timetable-context.ts`, `analyzeTimetable` and `sectionLabel` from `lib/timetable/analysis.ts`, `formatAcademicYear`, `ToolFailure` from `lib/assistant/tools.ts` (type-only import), `NOT_AVAILABLE_ON_SITE`.
- Produces:
  - `type DiscoveryDeps = { loadCatalogTerm(): Promise<{year; sem}>; loadPool: typeof loadDiscoveryPool; loadReviews: typeof loadReviewTexts }`
  - `defaultDiscoveryDeps`. Its term loader is the same as `defaultTimetableToolDeps.loadCatalogTerm`.
  - `runDiscoverCourseCandidates(state: TimetableState, args: unknown, deps?: DiscoveryDeps, signal?: AbortSignal): Promise<DiscoverResult | ToolFailure>`
  - `MAX_DISCOVERY_RESULT_CHARS = 12_000`

**Algorithm** (spec §5–§9):
1. Validate the input.
2. Load the term, then the pool.
3. Exclude saved plan codes and their `aka`.
4. Build sections.
5. Compute fit per section:
   - `not_checked` when the state is not `ready`, or the plan term ≠ catalog term (`timetable.status: "term_mismatch"`).
   - Otherwise use `conflictsForCandidate` and `conflictFitForSection` with `planComplete = analyzeTimetable(plan).complete && !state.truncated`.
6. Evaluate required rules: violated → excluded count; unknown → `unverified`. `noClash` uses fit: `confirmed_clash` → excluded; `incomplete` → `unverified`; `not_checked` → `notApplied`.
7. Evaluate preferred rules.
8. Score sections, keep the best section per course, and take the top `limit` courses.
9. Compute `mutualClashes` among the returned best sections with `detectScheduleConflicts`.
10. Run review enrichment if `reviewTerms`.
11. Shrink to the size limit.

- [ ] **Step 1: Write failing tests** with fixture pools (Task 3 builders) and stub deps.

  **Fit tests:**
  - *CISC1001 regression.* The plan contains GEGA1000-007 MON/THU 13:00–14:15. Candidate CISC1001-001 meets MON/THU 13:30–14:45. With `required.noClash` absent → `fit:"confirmed_clash"`, and `clashes` lists MON and THU with GEGA1000-007. With `required.noClash:true` → absent from candidates, and `excluded.required.noClash === 1`.
  - *Boundary.* A candidate MON 14:15–15:30 against the plan's 13:00–14:15 → `verified_no_clash`.
  - *Unscheduled saved section* (plan has a section with no schedules). A non-overlapping candidate → `fit:"incomplete"`, never verified. With `noClash:true` it is listed in `unverified` with reason `clash_check_incomplete`.
  - *Incomplete candidate meetings.* With `required.startAfter:"10:00"` and the known meetings at 11:00 → in `unverified` with `meeting_times_incomplete`, not in candidates.
  - *Timetable states.*
    - `no_plan` → every fit `not_checked`, `timetable.status:"no_plan"`, and `notApplied` contains a `noClash` entry when it was required.
    - `loading` → `timetable.status:"loading"`.
    - Plan year 2025 → `term_mismatch`.
  - *plannerVersion.* `timetable.plannerVersion` equals `state.version`.

  **Rule and ranking tests:**
  - *Scenario E.* `required {startAfter:"10:00", avoidDays:["FRI"]}` → no candidate has a meeting before 10:00 or on FRI. `excluded.required.startAfter` and `excluded.required.avoidDays` count the removed sections.
  - *Section level.* A course with section 001 (clashes) and 002 (verified) → candidate `section:"002"`, and `otherSections` lists `001` with `confirmed_clash` (when `noClash` is not required).
  - *Equivalent codes.* Instructor rows from an old code (already mapped to the primary code by the loader) plus primary-code rows → one candidate course under the primary code.
  - *Dedupe.* One candidate per course. The `limit: 2` of 4 eligible courses → 2 candidates with `rank` 1 and 2.

  **Exclusion and scope tests:**
  - *Already in plan.* A course in the saved plan → excluded, `excluded.alreadyInPlan === 1`.
  - *No listed sections.* An offered course with no offers → in `noListedSections`, not in candidates.
  - *Empty result.* Every section fails required → `candidates: []`, `status:"ok"`, `examined.truncated:false`.
  - *Truncation.* `truncated` pool → `examined.truncated:true`.

  **Failure tests:**
  - *Invalid input.* `{scope:{}}` → `{error:"invalid_request"}`, and `loadPool` is not called.
  - *Read failure.* `loadPool` rejects with `McpToolError("temporarily_unavailable")` → `{error:"temporarily_unavailable"}`.

  **Review tests:**
  - *Enrichment.* With `reviewTerms:["midterm"]`, the top-3 candidates get `reviewEvidence.mentions.midterm`, excerpts ≤120 code points, and `loadReviews` is called once with ≤6 ids.
  - *Enrichment failure.* `loadReviews` rejects → candidates still returned, no `reviewEvidence`, and `notApplied` contains `"reviewTerms: reviews could not be read"`.
  - *Invented exam facts.* No output key matches `/midterm|exam|prereq|seat/i` except inside `reviewEvidence`, `notes` and `notApplied`.

  **Output tests:**
  - *Schema.* Every result in this file passes `discoverResultSchema.parse`.
  - *Mutual clashes.* Two returned best sections that overlap each other → `mutualClashes` contains that pair.
- [ ] **Step 2: Write the failing performance test** (`discovery-performance.test.ts`).
  - Fixture: 60 courses, about 300 sections, 3 meetings each, co-taught rows, sparse and dense reviews, and a 10-section saved plan.
  - Assert `runDiscoverCourseCandidates` completes in under 200 ms in vitest and `JSON.stringify(result).length <= 12_000` at `limit: 8`.
  - Assert stub `loadPool` is called once and `loadReviews` at most once.
  - Log the measured ms and chars with `console.info` so the verification report can cite them.
- [ ] **Step 3: Run** `npx vitest run tests/assistant/discovery.test.ts tests/assistant/discovery-performance.test.ts`. Expect FAIL.
- [ ] **Step 4: Implement `discover.ts`.**
  - `notes` (fixed strings):
    - "Fit is checked for each course on its own; several courses can still clash with each other—see mutualClashes."
    - "Ratings are past students' reports for this instructor's offering of the course."
    - "The site has no official exam format, prerequisite, seat or workload data."
  - `ranking` = `RANKING_NOTE`.
- [ ] **Step 5: Run** the same command. Expect PASS.
- [ ] **Step 6: Commit** `feat(assistant): discover ranked section-level course candidates`.

### Task 7: Tool registration, activity and verification ledger

**Files:**
- Create: `lib/assistant/discovery/tool.ts`
- Modify: `lib/assistant/tools.ts`, `components/ai-elements/tool.tsx` (`TOOL_LABELS`), `lib/assistant/tool-activity.ts`, `lib/assistant/turn-activity.ts`, `lib/assistant/conflict-verification.ts`, `tests/assistant/read-only-planner.test.ts` (allowlist)
- Test: `tests/assistant/tools.test.ts`, `tests/assistant/tool-activity.test.ts`, `tests/assistant/turn-activity.test.ts`, `tests/assistant/conflict-verification.test.ts`

**Interfaces:**
- Produces:
  - `DISCOVER_COURSE_CANDIDATES_DESCRIPTION: string`
  - `createDiscoveryTools(timetable: TimetableSlot, presentation: PresentationSlot, deps?: DiscoveryDeps): ReturnType<typeof defineTool>[]`. It returns a one-tool array that `createAssistantTools` spreads, the same pattern as `createTimetableTools`. It calls `trackDiscovery` from Task 8 when that exists; until then it only runs.
  - `ASSISTANT_SERVER_TOOL_NAMES` gains `"discover_course_candidates"` directly after `"get_course_sections"`.
- Consumes: `runDiscoverCourseCandidates` (Task 6), `parseDiscoverResult` (Task 2).

**Tool description** (keep it under 900 chars). It must say:
- Use for goal-based searches without codes.
- Scope needs a subject anchor.
- `required` is only for must/cannot statements.
- `preferred` is for likes.
- State any assumed window.
- Results are one best section per course, with `otherSections`.
- Call a section clash-free only when its fit is `verified_no_clash`.
- `not_checked` / `notApplied` mean the timetable check did not run.
- Individual fits are not a combined timetable (`mutualClashes`).
- `examined.truncated` means the search was bounded.
- Data only; use `present_response` for a shortlist.

- [ ] **Step 1: Write failing tests:**
  - **Tool names.** `createAssistantTools().map(name)` equals `ASSISTANT_SERVER_TOOL_NAMES` and contains `discover_course_candidates`. The last tool is still `preview_timetable`.
  - **Activity classification.** `classifyToolContent("discover_course_candidates", <valid result>)` → `success`. An `{error:"temporarily_unavailable"}` result → `domain_error`. `"nope"` → `malformed`.
  - **Turn summary.** One discover call counts in `catalogSearches`, giving `formatTurnActivityDetail` `"1 search"`.
  - **Verification ledger.**
    - `summarizeConflictVerifications` with a discover tool message (candidate `GEST1006-002` `verified_no_clash`, otherSection `001` `confirmed_clash`, `plannerVersion "aaa"`) and current `"aaa"` → two checks, `stale:false`.
    - With current `"bbb"` → `stale:true`.
    - `not_checked` fits produce no entries.
  - **Read-only.** The allowlist contains the new tool, and the existing scan still passes.
- [ ] **Step 2: Run** `npx vitest run tests/assistant/tools.test.ts tests/assistant/tool-activity.test.ts tests/assistant/turn-activity.test.ts tests/assistant/conflict-verification.test.ts tests/assistant/read-only-planner.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.** The tool `execute` runs `runDiscoverCourseCandidates(timetable.current, args, deps, AbortSignal.timeout(MCP_TOOL_TIMEOUT_MS))`. Add the label `{ running: "Finding courses", done: "Found courses" }`.
- [ ] **Step 4: Run** the same command. Expect PASS.
- [ ] **Step 5: Commit** `feat(assistant): expose discover_course_candidates as a read-only tool`.

### Task 8: Presentation grounding with sections

**Files:**
- Create: `lib/assistant/discovery/evidence.ts`
- Modify: `lib/assistant/presentation.ts`, `lib/assistant/recommendation-hydrate.ts`, `lib/assistant/tools.ts` (`present_response` description and param `.describe`), `lib/assistant/discovery/tool.ts` (call `trackDiscovery`)
- Test: `tests/assistant/presentation.test.ts`, `tests/assistant/discovery-evidence.test.ts`, `tests/assistant/visible-blocks.test.ts`, `tests/assistant/discussed-courses.test.ts`

**Interfaces:**
- Produces (`evidence.ts`):
  - `type DiscoverySectionEvidence = { courseCode: string; section: string; meetings: string[]; fit: DiscoveryFit; plannerVersion: string | null; clashWith: string[] }`
  - `type DiscoveryCourseEvidence = { course: CatalogCourse; bestSection: string; sections: Map<string, DiscoverySectionEvidence> }`
  - `discoveryEvidenceFromCalls(calls: readonly ToolCallLike[], results: Map<string, {content?: unknown}>): Map<string, DiscoveryCourseEvidence>`. Newest call wins per course. `CatalogCourse` is built from the candidate fields, with `isOffered: true`, `aka: []` and `url` from `absoluteUrl(buildCoursePath(code))`. `otherSections` meetings are split on `"; "`.
- Changes (`presentation.ts`):
  - `PresentRequest.recommendations: { courses: string[]; sections: Record<string, string> }`. Courses stay plain codes in order. `sections` maps a code to its requested section.
  - `parsePresentRecommendations` accepts `/^[A-Z]{4}\d{4}(-[A-Z0-9]{1,6})?$/`. Two items with the same code → rejected.
  - `PresentationLedger.discoveries: Array<{ sectionsByCourse: Record<string, string[]> }>`
  - `trackDiscovery<T>(ledger, run: Promise<T>): Promise<T>`
  - `seedLedgerFromMessages` handles discover calls.
  - `RecommendationEligibility` adds nothing new. A code with a section absent from discovery evidence → `not_in_turn_evidence`.
  - `RichBlock` recommendations gains `sections: Record<string, string>`.
  - `activeRecommendationCourses` counts discovery evidence and requires any requested section to exist in it.
  - `PRESENT_RECEIPT_NOTE` mentions discovery evidence.
- Changes (`recommendation-hydrate.ts`):
  - `hydrateRecommendationCourse` falls back to discovery.
  - New `hydrateRecommendationSection(code: string, section: string | undefined, calls, results): DiscoverySectionEvidence | null`. It uses the requested section or `bestSection`, and returns null when the course has no discovery evidence.

- [ ] **Step 1: Write failing tests:**
  - **Discovery-only shortlist.** A turn with only a discover call (candidates GEST1006, GESB1013) and `present_response {recommendations:{courses:["GEST1006-002","GESB1013"]}}`:
    - receipt items are both `ready`;
    - `planRichBlocks` yields `{kind:"recommendations", courses:["GEST1006","GESB1013"], sections:{GEST1006:"002"}}`;
    - `activeRecommendationCourses` → `["GEST1006","GESB1013"]`.
  - **Unknown section.** `"GEST1006-009"` (not in evidence) → `not_in_turn_evidence`, and no recommendations block.
  - **Duplicate code.** `["GEST1006-001","GEST1006-002"]` → `{status:"rejected"}`.
  - **Old path.** `get_course` / search-only recommendations still work unchanged.
  - **Hydration.** `hydrateRecommendationSection("GEST1006", undefined, ...)` → the best section with meetings, fit and `plannerVersion`.
  - **Ordinals.** `visible-blocks` and `discussed-courses` ordinals for a discovery-grounded shortlist follow the presented order.
  - **Ledger seeding.** `seedLedgerFromMessages` with a discover result in the current turn → the ledger `discoveries` has its sections.
- [ ] **Step 2: Run** `npx vitest run tests/assistant/presentation.test.ts tests/assistant/discovery-evidence.test.ts tests/assistant/visible-blocks.test.ts tests/assistant/discussed-courses.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** the changes above. Update the `present_response` `recommendations.courses` param description to "Course codes, or CODE-SECTION from discover_course_candidates".
- [ ] **Step 4: Run** the same command plus `npx vitest run tests/assistant tests/components`. Expect PASS.
- [ ] **Step 5: Commit** `feat(assistant): ground shortlists in discovery evidence with sections`.

### Task 9: Shortlist section line and freshness badge

**Files:**
- Create: `lib/assistant/discovery/fit-badge.ts`, `components/assistant/planner-version-context.tsx`, `components/assistant/recommendation-section-line.tsx`
- Modify: `components/assistant/recommendation-shortlist.tsx`, `components/assistant/assistant-chat-view.tsx` (pass `block.sections`), `components/assistant/assistant-panel.tsx` (provide context)
- Test: `tests/assistant/fit-badge.test.ts`, `tests/components/recommendation-shortlist.test.tsx`

**Interfaces:**
- Produces:
  - `fitBadge(evidence: Pick<DiscoverySectionEvidence, "fit" | "plannerVersion" | "clashWith">, currentPlannerVersion: string | null): { label: string; tone: "ok" | "warn" | "muted" } | null` (labels exactly as in spec §11).
  - `PlannerVersionContext = createContext<string | null>(null)` and `usePlannerVersion(): string | null`.
  - `RecommendationSectionLine({ evidence }: { evidence: DiscoverySectionEvidence })`.
  - `RecommendationShortlist` gains `sections?: Record<string, string>`.
- `formatMeetingSummary(meetings: string[]): string` lives in `fit-badge.ts`. It groups identical times, e.g. `["TUE 11:30-12:45","FRI 11:30-12:45"]` → `"TUE, FRI 11:30–12:45"`.

- [ ] **Step 1: Write failing tests:**
  - **`fitBadge`.** Every row of the spec §11 table:
    - verified + same version → "No clash with saved timetable" (`ok`)
    - verified + other version → "Timetable changed – ask me to re-check" (`warn`)
    - verified + null current → re-check
    - clash + same → "Clashes with GEGA1000-007" (`warn`)
    - incomplete → "Class times incomplete" (`muted`)
    - not_checked → null
  - **`formatMeetingSummary`.** Grouping as above, and different times are kept separate.
  - **Shortlist, matching version.** `RecommendationShortlist` with a discovery call and a `PlannerVersionContext` value equal to the result's version → text `Sec 002`, `TUE, FRI 11:30–12:45`, `No clash with saved timetable`.
  - **Shortlist, mismatched version.** The same with a different context value → `Timetable changed – ask me to re-check`, and no "No clash" text.
  - **Get_course-only shortlist.** No section line.
  - **Narrow width.** At 380 px the row keeps `min-w-0` and truncation classes (no horizontal overflow class missing). Assert the class names exist.
- [ ] **Step 2: Run** `npx vitest run tests/assistant/fit-badge.test.ts tests/components/recommendation-shortlist.test.tsx`. Expect FAIL.
- [ ] **Step 3: Implement.** `AssistantPanel` computes `timetableVersion(activePlan.payload.sections)` (or null) once and wraps its children in the provider. The section line renders under `CatalogCourseRow` inside the same `<li>`: wrap `CatalogCourseRow` with an optional `footer` prop rather than duplicating it.
- [ ] **Step 4: Run** the same command plus `npx vitest run tests/components`. Expect PASS.
- [ ] **Step 5: Commit** `feat(assistant): show section fit on shortlists, gated on the live planner`.

### Task 10: Prompt guidance

**Files:**
- Modify: `lib/assistant/prompt.ts`
- Test: `tests/assistant/golden.test.ts` (or the existing prompt test that pins prompt content and size)

- [ ] **Step 1: Write a failing test.**
  - `ASSISTANT_PROMPT` contains `discover_course_candidates`, `verified_no_clash` and `mutualClashes`.
  - It stays within the current prompt-size assertion. If none exists, assert length ≤ 16,000 chars.
- [ ] **Step 2: Run** `npx vitest run tests/assistant/golden.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.** Add one bullet under *Investigating*, ≤600 chars. Its content is spec §12: one call per goal-based search; required = must/cannot only; state assumed windows; explain top options with trade-offs; clash-free only for `verified_no_clash` this turn; individual fits are not a combined timetable; follow-ups use the existing tools. Also add `discover_course_candidates` to the *Rich content* sentence about recommendations.
- [ ] **Step 4: Run** `npx vitest run tests/assistant`. Expect PASS.
- [ ] **Step 5: Commit** `feat(assistant): prompt guidance for goal-based discovery`.

### Task 11: CopilotKit end-to-end journeys

**Files:**
- Create: `tests/components/assistant-v2-3-5-b.integration.test.tsx`
- Uses: the pattern of `tests/components/assistant-v2-3-5.integration.test.tsx`: real `AssistantPanel`, `/api/copilotkit` route and server tools; mocked adapters only. Add `vi.mock("@/lib/assistant/data/discovery", ...)` that returns fixture pools from `tests/fixtures/discovery-pool.ts`.

- [ ] **Step 1: Write failing journeys** (scripted model steps):
  1. **Scenario E with shortlist.**
     - Saved plan has GEGA1000-007 MON/THU 13:00–14:15.
     - Model: `discover_course_candidates {scope:{courseType:"GE"}, required:{startAfter:"10:00", avoidDays:["FRI"], noClash:true}}` → `present_response {recommendations:{courses:["GEST1006-002","GESB1013"]}}` → text.
     - Assert the tool result has no candidate before 10:00 or on FRI, and CISC1001 is absent.
     - Assert the DOM shows "Recommended courses", `Sec 002` and "No clash with saved timetable", and no catalog list.
     - Assert exactly one activity summary.
  2. **Planner change.** Continue journey 1, then change `h.plan` so GEST1006-002 now overlaps.
     - The earlier shortlist badge becomes "Timetable changed – ask me to re-check".
     - Next turn's model input timetable digest has the new version.
     - A second discover call returns `confirmed_clash` for GEST1006-002.
  3. **Ordinal follow-up.** After journey 1, the student says "tell me more about the second one". Assert the visible-blocks context in the model input has `recommendations` `["GEST1006","GESB1013"]` and the scripted model calls `get_course {code:"GESB1013"}`.
  4. **Failure envelope.** The discovery loader rejects with `McpToolError("temporarily_unavailable")`. The activity row shows the error state, and no shortlist mounts.
  5. **History compaction.** After 3 discovery turns, the request body stays under `MAX_RUN_BODY_BYTES`, and earlier discover results are squeezed to ≤ 201 chars in the posted messages.
- [ ] **Step 2: Run** `npx vitest run tests/components/assistant-v2-3-5-b.integration.test.tsx`. Expect FAIL until the wiring is right, then PASS. Fix only real integration defects.
- [ ] **Step 3: Run** `npx vitest run tests/components tests/assistant`. Expect PASS.
- [ ] **Step 4: Commit** `test(assistant): V2.3.5-B discovery journeys through the CopilotKit path`.

### Task 12: Live discovery eval suite

**Files:**
- Create:
  - `evals/assistant/discovery-fixture.ts`. A fictional pool (GEST, GEGA, GESB and CISC courses, about 20 courses and 45 sections), `filterFixturePool(scope)` faking `loadDiscoveryPool`, a fake `loadReviewTexts`, and consistent fakes for `getCourse`, `getCourseSections`, `getCourseReviews`, `searchCatalogForAssistant`, `getInstructorForAssistant` and `getCourseText`.
  - `evals/assistant/discovery-cases.ts` (dev) and `evals/assistant/discovery-holdout-cases.ts`.
  - `evals/assistant/discovery-grade.ts`.
  - `evals/assistant/discovery.eval.ts`.
- Test: `tests/assistant/eval-discovery.test.ts`

**Interfaces:**
- `type DiscoveryExpect = { discovery: "required" | "optional" | "forbidden"; args?: (args: Record<string, unknown>) => boolean; mention?: RegExp[]; forbid?: RegExp[]; maxToolCalls?: number }`
- `gradeDiscovery(trace: TurnTrace, expect: DiscoveryExpect): { pass: boolean; checks: Record<string, boolean>; falseFitClaims: string[]; toolCalls: number }`. A false fit claim is a sentence that names `CODE` or `CODE-SEC` alongside `/no clash|doesn't clash|won't clash|without (a )?clash|conflict-free|fits (your|the) timetable|不衝突|不冲突/i` while that code's newest fit in this turn's discover or `check_plan_conflicts` results is not `verified_no_clash`.
- `summarizeDiscovery(grades): { turns; passed; passRate; discoveryUse: Metric; falseFitClaims: number; difficultyDirection: Metric; noMidtermCertainty: { violations: number }; medianToolCalls: number }`
- `discovery.eval.ts` mirrors `agent-behavior.eval.ts`:
  - Env vars: `ASSISTANT_EVAL`, `ASSISTANT_EVAL_SUITE=dev|holdout`, repeats, budget, label.
  - Writes `.eval-results/assistant/discovery-<label>.json`.
  - Uses `runCase(..., { timetableForTurn })`.
  - When `ASSISTANT_EVAL_NO_DISCOVERY=1`, mocks `@/lib/assistant/discovery/tool` so `createDiscoveryTools` returns `[]` (baseline).
  - Asserts the spec §14 thresholds only for the non-baseline run.

**Dev cases** (each a multi-turn journey):
- `easy_gest`: Journey 1, all 5 turns.
- `history_ge`: Journey 2.
- `first_year_cs`: Scenario C.
- `fill_credits`: Journey 4, with a 9-credit fixture plan.
- `explicit_constraints`: Scenario E.
- `preference_conflict`: Scenario F.
- `no_candidates`: Scenario G, with an impossible required window.
- `planner_change`: Journey 3, with `timetableForTurn` swapping plans.
- `no_midterm`: Journey 5.

**Holdout:** 6 paraphrased cases, including one Traditional Chinese and one Simplified Chinese.

- [ ] **Step 1: Write failing grader tests** with synthetic `TurnTrace`s:
  - **False fit claim.** A reply "GEST1006 has no clash with your timetable" with a discover fit `incomplete` → `falseFitClaims` = `["GEST1006"]`, `pass:false`.
  - **Verified claim.** The same with `verified_no_clash` → no claim.
  - **Discovery required.** Missing the discover call on a required turn → `checks.discovery:false`.
  - **Tool count.** `toolCalls` excludes `present_response`.
  - **Median.** `medianToolCalls` over [1,1,3] = 1.
- [ ] **Step 2: Run** `npx vitest run tests/assistant/eval-discovery.test.ts`. Expect FAIL, then implement the grader and fixture until PASS.
- [ ] **Step 3: Check the fixture.** `ASSISTANT_EVAL` unset → `npx vitest run --config vitest.eval.config.ts evals/assistant/discovery.eval.ts` skips cleanly. `npx tsc --noEmit` passes.
- [ ] **Step 4: Commit** `test(assistant): live discovery eval suite with preregistered thresholds`.

### Task 13: Real-data performance smoke

**Files:**
- Create: `evals/assistant/discovery-real-data.eval.ts`

- [ ] **Step 1: Implement a gated run** (`describe.skipIf(process.env.DISCOVERY_REAL_DATA !== "1")`).
  - Load `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` from `.env.local` into `process.env` before a dynamic `import("@/lib/assistant/data/discovery")`. `vi.mock("server-only", () => ({}))`.
  - Read the term with one `app_config` select.
  - Wrap `globalThis.fetch` to count Supabase requests.
  - Run `runDiscoverCourseCandidates` with real loaders for 6 inputs:
    - GEST easy
    - GE + topics Macao/history
    - CISC year ≤1
    - department CIS credits 3
    - GE required `{startAfter:"10:00", avoidDays:["FRI"]}` with a fixture plan
    - `courseType:"Non-GE"` (truncation)
  - Write `.eval-results/assistant/discovery-real-data-<label>.json` with requests, ms, chars, `examined`, candidate codes and sections.
  - Assert every candidate section exists in a direct `offer` read for that term (no invented sections), and requests ≤ 3 (≤ 9 with `reviewTerms`).
- [ ] **Step 2: Run** `DISCOVERY_REAL_DATA=1 npx vitest run --config vitest.eval.config.ts evals/assistant/discovery-real-data.eval.ts`. Expect PASS and a results file.
- [ ] **Step 3: Commit** `test(assistant): read-only real-data discovery performance smoke`.

### Task 14: Verification, live evaluation, review and report

**Files:**
- Create: `docs/superpowers/verification/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md`

- [ ] **Step 1: Run the gates.** `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. Expect all pass. Record the file and test counts.
- [ ] **Step 2: Run live evals.**
  - Dev: `ASSISTANT_EVAL=1 ASSISTANT_EVAL_LABEL=b-dev npm run eval:assistant -- evals/assistant/discovery.eval.ts`
  - Holdout: the same with `ASSISTANT_EVAL_SUITE=holdout ASSISTANT_EVAL_LABEL=b-holdout`
  - Baseline: `ASSISTANT_EVAL_NO_DISCOVERY=1 ASSISTANT_EVAL_LABEL=b-baseline`
  - Record the results against the spec §14 thresholds. Do not change the thresholds.
  - Also rerun `agent-behavior.eval.ts` dev (`ASSISTANT_EVAL_REPEATS=1`) to check for regressions.
- [ ] **Step 3: Real-data smoke.** Run Task 13 and record the numbers.
- [ ] **Step 4: Browser acceptance.** Run `npm run dev` and use any available signed-in session and browser tooling at 380 px and 800 px, against the spec §17 checklist from the brief. If either is unavailable, mark each item UNVERIFIED.
- [ ] **Step 5: Independent review.** Use superpowers:requesting-code-review. Cover timetable correctness, data semantics, query efficiency, tool contract, student experience, read-only boundaries and V3 compatibility. Fix confirmed in-scope defects with tests and a commit each.
- [ ] **Step 6: Write the verification report.** Brief §20 items 1–13 and §21 answers 1–14, with evidence links to the results files.
- [ ] **Step 7: Commit** `docs(assistant): V2.3.5-B verification report`. Stop. Do not merge, and do not start V2.3.5-C.
