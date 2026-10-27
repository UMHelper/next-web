# B.3 efficiency diagnosis — trace-backed

Date: 2026-10-27
Worktree: `.worktrees/assistant-v2-3-5-b2`
Branch: `feat/assistant-v2-3-5-b2-remediation`
Starting HEAD: `f052052`
Diagnostic set: frozen `efficiency-v1` (new paraphrases, baseline run before fixes)
Comparison evidence: `.eval-results/assistant/discovery-b3-{efficiency-before,efficiency-final,dev-final,holdout-final,shadow-v2}.json`

This note reconstructs the reported inefficient turns. It separates necessary
work from redundant work, and tool failure/retry from needless re-querying.
Exceeding a benchmark call limit is not treated as a defect by itself.

## 1. Method

- Read `traces[]` in the saved artifacts: message, tool name, arguments, result,
  order, `ms`, and model steps.
- Mark a call **necessary** when its result supplied evidence used in the final
  answer or was required by the tool contract (for example, an instructor name
  before a section lookup).
- Mark a call **redundant** when an earlier result already contained the field,
  when it repeated the same filters, or when it only re-confirmed a bounded
  result.
- Mark a call **recovery** when the previous result was
  `temporarily_unavailable`, `needs_section`, or `needs_clarification` and the
  retry carried new information.
- Call counts exclude `present_response`, matching the existing metric.

## 2. Matrix

| Turn | Intent | Calls observed (baseline) | Necessary | Redundant / recovery | Evidence already sufficient? | Latency / steps | Smallest correction |
|---|---|---|---|---:|---|---|---|
| dev `no_candidates` r2 | Find GEST classes after 18:00; complete zero-match | `discover`, `search_catalog`, 8×`get_course`, 9×`get_course_sections` = 19 | discovery only | 18 redundant: enumerated every course/section after a complete no-match | Yes: `candidates: []`, `examined.truncated: false`, `notApplied` said no section met the rules | 8.9 s, 5 steps | Make complete vs bounded zero-match explicit in the result and discovery contract |
| shadow-v2 `first_year_ge_listing` | Browse first-year GE catalog | 3×`search_catalog` + 3×`count_courses` = 6 | final `search_catalog` | 2 wrong `faculty: GECOURSE` searches + 3 `count_courses` confirmations; `search_catalog` already returned `totalCount` | Yes | 7.9 s, 4 steps | Say `courseType` is GE/Non-GE, faculty/department are academic units; do not re-count a result with `totalCount` |
| shadow-v2 `cis_intro_advice` | First-year CISC recommendation | `discover`, `search_catalog`, 3×`get_course_description`, `get_course` = 6 | discovery, descriptions, one `get_course` for the year-2 course | `search_catalog` repeated the CISC codes discovery already returned | Partly: discovery had codes/ratings; descriptions added real evidence | 8.1 s, 4 steps | Do not re-run catalog for the same codes; keep the fallback when the student asks to broaden |
| shadow-v2 `combined_sections` | Two named sections vs each other and saved plan | 2×`get_course`, 2×`get_course_sections`, `check_plan_conflicts` ×1 + 2 retries = 7 | 2×`get_course` for instructors; combined check | 2 section fetches (preview resolves them), individual checks, and a retry; no `preview_timetable` | No: individual fits cannot prove mutual compatibility | 6.8 s, 5 steps | Preview named sections directly; preview includes saved-plan and mutual conflicts; do not pre-check individuals |
| dev `easy_gest` t4 | Do prior picks clash with saved plan? | 2×`get_course_sections` + 2×`check_plan_conflicts` = 4 | conflict checks | 2 section fetches; `check_plan_conflicts` resolves sections itself | Yes | 3.9 s, 2 steps | Say `check_plan_conflicts` loads sections itself; do not fetch sections first |
| efficiency `detail_followup` t2 | Tell me about the second pick | `get_course` (needs_clarification), `search_catalog`, `get_course` (needs_clarification) = 3 | one targeted course lookup | recovery, but the tool asked “Which course?” twice for an explicit `GEST1005` | Not from the referent path | 6.2 s, 4 steps | No efficiency change: this is a referent-binding correctness defect, reported separately |
| efficiency `cis_advice` r1 | First-year CISC recommendation | discovery, search, `get_course`, description, 2×ILO, 2×reviews, discovery, search, present = 11 | discovery + one description path | repeated discovery/catalog and ILO/reviews after evidence was sufficient | Yes after the first discovery | 11.0 s, 5 steps | Model-variance issue; not fixed in this pass |

## 3. What was fixed

1. **Complete zero-match is now conclusive evidence.**
   - Discovery adds a note when `candidates` is empty:
     - complete pool (`examined.truncated: false`) → “complete no-match for this
       scope … do not repeat the same search or enumerate the subject”;
     - truncated pool → “pool was bounded … do not claim no course exists.”
   - The discovery description says the same.
   - After the change, dev `no_candidates` ran 1, 1, and 2 calls in three
     repeats (baseline worst case: 19).
2. **Catalog listing is one scoped call.**
   - `search_catalog` now states that `courseType` is GE/Non-GE, that
     faculty/department are academic units, that it has no time/weekday filter,
     and that one scoped call returns `totalCount`.
   - `count_courses` no longer encourages confirming an existing `totalCount`.
   - `efficiency-v1` browse: 6 calls → 1 non-presentation call.
3. **Combined checks use the preview directly.**
   - `preview_timetable` states that it resolves sections itself and includes
     saved-plan and mutual conflicts; individual checks are not proof.
   - `efficiency-v1` combined: 7 calls and no preview → 3 calls with
     `preview_timetable`, in both repeats.
4. **Individual fit does not pre-fetch sections.**
   - `check_plan_conflicts` states it loads sections itself.
   - Dev `easy_gest` t4 fell to 2–3 calls in most repeats; transient
     `temporarily_unavailable` retries still produce 4–12 calls in some runs.
5. **A hard-constraint parsing example was added.**
   - `startAfter` now says “For ‘no class before 10:00’, use 10:00.”
   - Dev `explicit_constraints` then passed 3/3 with `startAfter: "10:00"`.

## 4. Before / after

Frozen `efficiency-v1`, baseline 1 repeat; final 2 repeats (new paraphrases,
not holdout wording):

| Measure | Before | After |
|---|---:|---:|
| Turns / passed | 9 / 6 (66.7%) | 18 / 14 (77.8%) |
| Median non-presentation calls | 2 | 1 |
| Catalog browse calls | 6 | 1 non-presentation |
| Combined check calls | 7 | 3 |
| No-match evening calls | 2 (search + discovery) | 1 (discovery) |
| CIS advice calls | 6 | 1 and 6 (stochastic) |
| Detail follow-up calls | 3 | 1 and 8 (stochastic) |

## 5. What was not fixed

- `eff-no_match_topic` still answers from `search_catalog` without discovery.
  The question is an existence query (“is there a GEST course about marine
  biology?”), and two catalog searches answer it truthfully. The frozen case
  marks discovery required; this is a case-design limitation, not a loop.
- `eff-detail_followup` can still call discovery on a detail follow-up and can
  hit the referent-binding `needs_clarification` path.
- `cis_advice` remains variable: one repeat used one discovery call; another
  repeated discovery/catalog and read ILOs/reviews until it exhausted 11 calls.
- Transient `temporarily_unavailable` responses from `check_plan_conflicts`
  cause retry loops. That is a reliability follow-up, not a search-loop fix.
