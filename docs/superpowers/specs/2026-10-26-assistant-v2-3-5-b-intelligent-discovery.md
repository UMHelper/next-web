# What2Reg AI V2.3.5-B: Intelligent Course Discovery (spec)

**Status:** Design approved in conversation on 2026-10-26 (approach A, strict fit in both tools, fixture live eval + real-data perf smoke, pause for plan review).
**Source of truth:** the V2.3.5-B brief (conversation of 2026-10-26) plus this document.
**Branch / base:** `feat/assistant-v2-3-5-b-discovery` off `feat/global-assistant-v2` @ `221e73b`.

## 1. Goal

A student can describe a goal and its constraints in their own words. The assistant then returns a small, grounded set of **real offered course sections** for the active term. Students do not have to supply course codes.

> The LLM understands goals and explains recommendations. Deterministic services discover candidates, validate constraints, calculate conflicts and produce evidence.

**B discovers and evaluates individual course-section candidates. V3 optimizes complete timetable combinations.**

## 2. Approaches considered

| | Approach | Trade-off | Decision |
|---|---|---|---|
| A | One read-only tool, `discover_course_candidates`. It makes 3 batched PostgREST reads, then runs a pure TypeScript engine for scope, sections, constraints, fit, ranking and evidence. | No migration. All logic is unit-testable TypeScript. 3 round trips instead of 1. | **Chosen** |
| B | Same contract, but filtering and joins run in a new Postgres RPC | One round trip. Needs a production migration, and the logic is split between SQL and TypeScript. | Rejected |
| C | Prompt-only orchestration of the existing tools | No new code. Needs 10–20 sequential calls per request and exceeds `ASSISTANT_MAX_STEPS = 8`. | Rejected |

## 3. Repository and data findings (HEAD `221e73b`, live DB probed read-only)

1. **Queryable data.** `course_catalog` is a view over `course_noporf` with `equivalent_codes`. Its columns include `New_code`, titles, `Offering_Unit`, `Offering_Department`, `Credits` (text, e.g. `"3.0"`), `Is_Offered`, `courseType` (`GE` / `Non-GE`), `offeringProgLevel`, `suggestedYearOfStudy` (numeric), `courseDescription` and `ilo`.
2. **Batch sections.** The chain is `prof_with_course` (id, `course_id` = code, `prof_id`, ratings) → `offer` (`course_id` = pwc id, `section`, `year`, `sem`) → `schedule` → `time_location` (`date`, `times`, `location`). There is **no FK from `offer` to `prof_with_course`**, but `offer` embeds `schedule(time_location(...))`. Three batched reads therefore cover any pool: catalog, then pwc by `course_id in (codes + equivalents)`, then offers by `course_id in (pwc ids)` filtered by term with meetings embedded. The index `offer_section_unique_idx (course_id, section, year, sem)` serves the third read.
3. **Meetings.** All 2026/1 times parse as `H:MM-H:MM`, and every offer has at least one meeting. The days are MON–FRI plus 23 SAT meetings. The planner stores only MON–FRI (`lib/timetable/schema.ts`), so a SAT meeting makes the section's clash check `incomplete`. This matches the current `check_plan_conflicts` behaviour.
4. **Section ↔ instructor.** An offer row is one (course, instructor, section). Co-taught sections show up as several pwc rows with the same section number: 44 in 2026/1, all with identical meetings. Section identity is `(primary course code, normalized section)`, and instructors are the union of their pwc rows.
5. **Ratings.** These are `prof_with_course.result/grade/hard/reward/attendance` plus `comments`. They are **course-specific per instructor**, accumulated over all past terms. Instructor-wide figures exist only as an aggregate in `get_instructor`. Coverage is sparse: 300 of 829 offered pwc rows have zero reviews, and the median is 2. Difficulty (`hard`) runs 1 = Very hard to 5 = Very easy.
6. **Reliable server-side filters.** These are `courseType`, `New_code` prefix, `Offering_Unit`, `Offering_Department`, `Credits` (text, matched through its numeric variants), `suggestedYearOfStudy <= n`, `Is_Offered = 1`, and `ilike` on titles, description and ILO. Prerequisites, seats, exam format and workload do not exist.
7. **Active term.** `getAppConfig()` → `currentYear` / `currentSem` (cached for 300 s). The value is 2026/1. Section reads always filter `offer.year/sem` to it, so historical offers never count.
8. **Planner snapshot.** The client sends the active plan as `TIMETABLE_CONTEXT_DESCRIPTION` on every run. `parseTimetableContext` validates it, and the server computes `version = timetableVersion(sections)` itself; no client-asserted version is trusted. Before the next run, the history of earlier turns is cut down (`shapeConversation`: earlier tool results are trimmed to 200 characters). Old fit evidence therefore cannot be parsed or reused on the server.
9. **Batched conflicts.** `detectScheduleConflicts` is pure. `conflictsForCandidate` in `check-plan-conflicts.ts` already checks one candidate against the plan, so it is reused per section (O(sections × plan meetings)).
10. **Limits.** In 2026/1 there are 571 offered courses, 1,246 sections and 1,300 offer rows. Reading the whole term took about 60 ms. GE scope is 57 courses and 124 sections. 25 catalog-offered courses have no listed sections.
11. **Presentation.** `present_response.recommendations.courses` is checked against the turn's evidence (`search_catalog` and `get_course` results) and hydrated into `RecommendationShortlist` rows (`CatalogCourseRow`).
12. **Gap found.** `check_plan_conflicts` can return `verified_no_clash` while `planComplete` is false. A saved section without times could still clash. This is fixed in both tools (see §7).

## 4. Student use cases → behaviour

| Scenario | Model action | Deterministic outcome |
|---|---|---|
| A: easy GEST, preferably not morning | `scope.codePrefix: "GEST"`, `preferred.startAfter: "12:00"`, `priorities: ["easier"]` | Sections ranked by shrunk ease plus time preference. Each candidate is fit-checked. |
| B: Chinese and Macao history GE | `scope.courseType: "GE"`, `topics: ["Macao", "Macau", "Chinese history", "history"]` | Only GE courses. Title matches outrank description matches. |
| C: first-year CS | `scope.department: "CIS"` or `codePrefix: "CISC"`, `maxSuggestedYear: 1` | Year-1 courses only. A "suggested year" is not eligibility; `notes` says so. |
| D: 9 → 18 credits | Model reads `totals.credits` from the digest and passes `credits: 3`, `limit: 5` | Individual fits plus `mutualClashes` among the returned sections. A note says individual fits do not prove the combination works. |
| E: no class before 10, no Friday, no clash | `required: { startAfter: "10:00", avoidDays: ["FRI"], noClash: true }` | Only sections that are verified to satisfy these. Data gaps are listed in `unverified`. |
| F: really easy, but no mornings | `priorities: ["easier"]`, `preferred.startAfter: "12:00"` | A morning section can still rank, but it is penalized and its trade-off is named. |
| G: nothing suitable | Same call | Empty `candidates`, with `excluded` counts per rule and `examined.truncated` to tell an exhausted search from a bounded one. |
| H: planner changed | The next turn reruns discovery | New `plannerVersion`. The shortlist badge for the old result shows "Timetable changed" (§11). |

Clarification policy: ask only when the answer changes eligibility or correctness. "I don't like early classes" → `preferred`, and the assistant states its assumed time. "No classes before 10" → `required`. "Absolutely cannot do lunch" → `required.avoidWindows`, and the assistant states the window it assumed (e.g. 12:00–14:00) unless the student gave one.

## 5. Tool contract: `discover_course_candidates`

Read-only and server-side. It is registered beside the other server tools. Input (zod, `lib/assistant/discovery/schema.ts`):

```ts
scope: {                       // at least one of courseType, codePrefix, faculty, department, topics, maxSuggestedYear
  courseType?: "GE" | "Non-GE";
  codePrefix?: string;         // /^[A-Za-z]{2,4}\d{0,3}$/, e.g. GEST, CISC1
  faculty?: string;            // Offering_Unit, e.g. FST
  department?: string;         // Offering_Department, e.g. CIS
  topics?: string[];           // ≤5, 2–40 chars each; OR-matched on titles, description, ILO
  maxSuggestedYear?: number;   // 1..5
  credits?: number;            // exact, 0..12
  excludeCodes?: string[];     // ≤20
}
required?:  TimeRules & { noClash?: boolean }      // hard: eliminates
preferred?: TimeRules & { fewerDays?: boolean }    // soft: ranks and explains
priorities?: ("easier" | "higher_grades" | "better_rated" | "more_useful" | "topic_match")[]  // ≤4, ordered
reviewTerms?: string[]         // ≤3, 2–30 chars, e.g. ["midterm", "期中"]
limit?: number                 // 1..8, default 5 (distinct courses)

TimeRules = {
  startAfter?: "HH:MM";        // every meeting starts at or after
  endBefore?: "HH:MM";         // every meeting ends at or before
  avoidDays?: ("MON"|"TUE"|"WED"|"THU"|"FRI"|"SAT")[];
  avoidWindows?: { start: "HH:MM"; end: "HH:MM"; days?: Weekday[] }[];  // ≤3; strict overlap, touching is fine
}
```

Always applied: active term only, catalog `Is_Offered = 1`, sections listed in the active term, and courses already in the saved plan excluded (codes and their equivalents).

Failures use the shared envelope `{ error: "invalid_request" | "temporarily_unavailable" }`. An empty result is not a failure.

## 6. Output (candidate representation)

```ts
{
  status: "ok",
  term: { year, sem, label },                         // label from formatAcademicYear
  timetable: { status: "ready" | "no_plan" | "loading" | "unavailable" | "term_mismatch",
               plannerVersion?: string, planComplete?: boolean },
  examined: { courses, sections, totalMatchingCourses, truncated },
  excluded: { alreadyInPlan, excludedCodes, noListedSections,
              required: { startAfter, endBefore, avoidDays, avoidWindows, noClash } },  // section counts
  notApplied: string[],                                // e.g. "noClash: no saved timetable"
  candidates: Candidate[],                             // ≤ limit, one per course, ranked
  unverified: { courseCode, section, reason: "meeting_times_incomplete" | "clash_check_incomplete" }[], // ≤5
  noListedSections: string[],                          // ≤10 offered courses without sections this term
  mutualClashes: [string, string][],                   // pairs among returned best sections ("CODE-SEC")
  ranking: string,                                     // one-line policy description
  notes: string[]                                      // fixed limits: individual fit, ratings meaning, no official exam/prereq/seat data
}

Candidate = {
  rank, courseCode, titleEn, titleZh, credits, courseType, suggestedYear,
  section,                                             // best section for this course
  instructors: { name, reviews, difficulty, grade, result, sampleSize }[],  // ≤3, course-specific
  meetings: string[],                                  // "TUE 11:30-12:45"
  meetingsComplete: boolean,
  fit: "verified_no_clash" | "confirmed_clash" | "incomplete" | "not_checked",
  clashes?: { with: string, day, overlap }[],          // fits are relative to timetable.plannerVersion
  matched: string[],                                   // e.g. "starts at or after 10:00", "no Friday"
  tradeoffs: string[],                                 // e.g. "meets Friday (you prefer to avoid)", "only 2 reviews"
  signals: { ease?, grade?, rating?, usefulness?: { mean, adjusted, reviews } },  // only for priorities used
  score: number,                                       // 0..100
  otherSections: { section, meetings: string, fit }[], // ≤3 eligible alternatives
  reviewEvidence?: { read, mentions: Record<string, number>, excerpts: string[] }  // only with reviewTerms, top 3
}
```

`MAX_DISCOVERY_RESULT_CHARS = 12_000`. When the limit is exceeded, the shrink order is excerpts, then `otherSections`, then `unverified`. A truncated result is never a failure.

## 7. Deterministic fit and freshness

- **Fit function**, shared with `check_plan_conflicts` (`lib/assistant/check-plan-conflicts.ts`):
  - `conflicts > 0` → `confirmed_clash`. A known overlap is real even when other data is missing.
  - Else, if candidate complete AND plan complete AND not truncated → `verified_no_clash`.
  - Else → `incomplete`.
- **Candidate complete** means at least one meeting, no meeting dropped while parsing, and no SAT/SUN meeting.
- **Plan complete** means `analyzeTimetable(plan).complete && !state.truncated`.
- **`not_checked`** is used when the timetable is `no_plan`, `loading` or `unavailable`, or the plan term differs from the catalog term. `notApplied` explains why. The `noClash` requirement is then not applied, and the model must say so.
- **Version.** Every computed fit is relative to `timetable.plannerVersion = state.version`, the server-side hash of the snapshot used.
- **Freshness**, enforced three ways:
  1. Old results are cut down to 200 characters in history, so the model cannot reuse them across turns.
  2. `summarizeConflictVerifications` includes discovery fits marked with `stale`.
  3. The client shortlist compares the result's `plannerVersion` with the live planner `timetableVersion`. On a mismatch it shows "Timetable changed – ask me to re-check" instead of any fit badge.
- **Prose claims.** No keyword policing. The tool description and prompt say a section may be called clash-free only when its fit is `verified_no_clash` in this turn. Live-eval grading counts violations (§14).

## 8. Ranking policy

1. **Hard rules** are checked per section. A known violation eliminates the section. Unknown data that a required rule depends on moves it to `unverified`.
2. **Section rating signals.** For each instructor row with `reviews > 0`, take the review-weighted mean `m` over the section's instructors, with `n = Σ reviews`. Shrink it toward a neutral prior: `adjusted = (n·m + 5·3.0) / (n + 5)`, where 5 = `SMALL_REVIEW_SAMPLE`. Normalize: `s = (adjusted − 1) / 4`. With no reviews, `s = 0.5`, and the trade-off "no reviews" is added.
   - `easier` → difficulty (higher = easier, never inverted)
   - `higher_grades` → grade
   - `better_rated` → result
   - `more_useful` → reward
3. **Schedule preference.** `s_pref = 1 − violatedPreferred / totalPreferred`. Each of `startAfter`, `endBefore`, `avoidDays` and `fewerDays` counts as one rule, and each avoid window counts as one. `fewerDays` is satisfied when the section meets on ≤ 2 distinct days.
4. **Topic relevance.** `s_topic = min(1, Σ_topic (title hit ? 1 : body hit ? 0.5 : 0) / topics.length)`.
5. **Weights.**
   - Ordered priorities get 0.40, 0.25, 0.15, 0.10. With no priorities, the default is `["better_rated"]`.
   - Schedule preference gets 0.35 when any preferred rule exists.
   - Topic gets 0.20 when topics exist and `topic_match` is not listed.
   - All weights are normalized to sum to 1. `score = round(100 · Σ w·s)`.
6. **Fit adjustment** (when `noClash` is not required). `confirmed_clash` → score × 0.5 with the trade-off "clashes with X". `incomplete` → × 0.9 with "clash check incomplete".
7. **Order.** Score desc, then total reviews desc, then course code asc, then section asc. Ties are fully deterministic. Each course keeps its best section, and up to 3 other eligible sections become `otherSections`.

## 9. Evidence categories and review enrichment

- **Verified facts**: catalog fields, this term's sections and meetings, deterministic fits.
- **Student-reported**: `instructors[].difficulty/grade/result`, `reviewEvidence`.
- **Derived**: `score`, `matched`, `tradeoffs`, `signals.adjusted`.
- **Unknown**: exam format, prerequisites, seats, workload. This is listed in `notes`, and no field ever asserts it.
- **Review enrichment** runs only when `reviewTerms` is given. It covers the top 3 candidates and at most 6 instructor rows. It makes one query per pwc id: newest 8 public top-level reviews (`replyto is null`, `hidden <> 1`), reading `content` and `content_en` only. It returns mention counts per term (case-insensitive) and ≤2 excerpts of ≤120 code points centred on a match. These are always framed as "reviewers mentioned", never as the current arrangement.

## 10. Bounds and performance

| Bound | Value |
|---|---|
| Courses examined (`MAX_POOL_COURSES`) | 150, with `count: exact` → `totalMatchingCourses`, `truncated` |
| DB round trips without review terms | 3 (plus `getAppConfig`, which is cached) |
| DB round trips with review terms | ≤ 3 + 6 |
| `in (...)` chunk size | 200 ids or codes per request |
| Returned candidates | ≤ 8 courses, ≤ 3 `otherSections` each |
| Result size | ≤ 12,000 chars |
| Timeout | `AbortSignal.timeout(MCP_TOOL_TIMEOUT_MS)` shared by all reads |
| Model steps for a discovery turn | Target: 1 discovery call + optional `present_response` + answer |

There is no cross-request cache: `getAppConfig` is already cached, and the catalog reads are cheap. Room is left for a later term-level cache.

## 11. Presentation integration

- Discovery never mounts UI. Its activity row is labelled "Finding courses" / "Found courses" and is counted as a search in the turn summary.
- `present_response.recommendations.courses` accepts `CODE` or `CODE-SECTION`; at most 5, and course codes must be unique.
  - **Course evidence** now also comes from successful discovery results in the turn.
  - **`CODE-SECTION`** is `ready` only when that section appears in a discovery result for that code in the turn; otherwise it is `not_in_turn_evidence`.
- **Ordinals** follow the presented course order, as before.
- **`RecommendationShortlist` rows** show the course row (title and credits, hydrated from discovery when there is no search or `get_course`). When a discovery candidate supplies the section, a compact second line shows `Sec 002 · TUE, FRI 11:30–12:45` and one fit badge:

| Fit | Live planner version matches | Live planner version differs |
|---|---|---|
| `verified_no_clash` | "No clash with saved timetable" | "Timetable changed – ask me to re-check" |
| `confirmed_clash` | "Clashes with GEGA1000-007" | "Timetable changed – ask me to re-check" |
| `incomplete` | "Class times incomplete" | "Class times incomplete" |
| `not_checked` | No badge | No badge |

- **Live planner version** comes from `PlannerVersionContext`, which `AssistantPanel` provides from `useTimetablePlanner`. Outside a provider the context is `null`, so any version-dependent badge reads "re-check".

## 12. Prompt guidance (concise additions)

Add one bullet under *Investigating*, about 600 characters:
- Use `discover_course_candidates` once for goal-based searches without codes.
- Put only must/cannot statements in `required`.
- State assumed windows for vague words.
- Explain the top options with their trade-offs.
- Clash-free only for `verified_no_clash` in this turn.
- Individual fits are not a combined timetable; check `mutualClashes`.
- Follow-ups use the existing course tools.

The tool description carries the field semantics.

## 13. Error and incomplete-data semantics

- **Invalid input** returns `{error: "invalid_request"}`. This includes an empty scope, bad times, `endBefore ≤ startAfter`, and a window with `start ≥ end`.
- **Catalog, pwc or offer read failure** returns `{error: "temporarily_unavailable"}`.
- **Review-enrichment failure** drops `reviewEvidence` and appends `notApplied: "reviewTerms: reviews could not be read"`. Discovery itself still succeeds.
- Timetable states map to fit statuses as described in §7.

## 14. Evaluation (thresholds fixed before the live run)

**Zero-tolerance gates.** These are deterministic and checked by unit and integration tests:
- No false `verified_no_clash`.
- None when meetings are incomplete.
- None when the plan is incomplete.
- No stale version shown as current in the shortlist.
- No invented course or section: every candidate maps to pool rows.
- No historical offers.
- No inverted difficulty.
- No planner writes: the tool has no planner write path, and `read-only-planner.test.ts` covers it.
- No exam, prereq or seat fields.

**Live DeepSeek eval** (fictional discovery fixture, 3 repeats, `ASSISTANT_EVAL=1`):

| Metric | Dev threshold | Holdout threshold |
|---|---|---|
| Turn pass rate | ≥ 80 % | ≥ 75 % |
| `discover_course_candidates` used on discovery turns | ≥ 90 % | ≥ 90 % |
| Prose clash-free claim for a non-verified section | 0 | 0 |
| Difficulty-direction errors | 0 | 0 |
| No-midterm certainty claims | 0 | 0 |
| Median tool calls per discovery turn (excluding `present_response`) | ≤ 2 | ≤ 2 |

A baseline comparison runs the dev suite with the discovery tool removed (`ASSISTANT_EVAL_NO_DISCOVERY=1`), measuring tool calls, steps and latency.

**Real-data perf smoke** (`DISCOVERY_REAL_DATA=1`, read-only Supabase): 6 representative scopes. It reports DB requests, ms, result chars and pool sizes. There is no production performance guarantee.

**Browser acceptance** runs at 380 px and 800 px with a signed-in student when an environment is available. Otherwise it is reported UNVERIFIED.

## 15. Scope

In scope: everything above.

Out of scope:
- timetable combination or optimization
- degree audit
- eligibility prediction
- live seats
- planner writes
- persistence or memory
- quota admin
- model or framework change
- fixing `search_catalog`'s text `credits` filter (noted as a known issue)

## 16. Left to the builder

- Internal helper names inside `lib/assistant/discovery/*` beyond the interfaces in the plan.
- Exact wording of `matched` and `tradeoffs` strings, as long as they are short, English, and name the rule.
- Tailwind classes for the section line and badge, following `CatalogCourseRow`.
