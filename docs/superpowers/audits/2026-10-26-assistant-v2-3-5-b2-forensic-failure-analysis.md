# What2Reg AI V2.3.5-B.2 — Forensic Failure Analysis (live student journeys)

- **Date:** 2026-10-26
- **Mode:** read-only investigation; produced before any code change
- **Branch / HEAD:** `feat/assistant-v2-3-5-b-discovery` @ `718afd8` (B.1 remediation committed, tree clean)
- **Inputs audited:** [`2026-10-26-assistant-v2-3-5-b-final-acceptance-audit.md`](./2026-10-26-assistant-v2-3-5-b-final-acceptance-audit.md), [`2026-10-26-assistant-v2-3-5-b-implementation-audit.md`](./2026-10-26-assistant-v2-3-5-b-implementation-audit.md), [`../plans/2026-10-26-assistant-v2-3-5-b-remediation.md`](../plans/2026-10-26-assistant-v2-3-5-b-remediation.md), [`../verification/2026-10-26-assistant-v2-3-5-b-remediation-acceptance.md`](../verification/2026-10-26-assistant-v2-3-5-b-remediation-acceptance.md), [`../specs/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md`](../specs/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md)
- **Live artifacts audited (valid harness, tool present in provider requests):**
  - `.eval-results/assistant/discovery-b-dev-audit.json` — 54 turns, 3 repeats
  - `.eval-results/assistant/discovery-b-holdout-audit-full.json` — 18 turns, 3 repeats
  - `.eval-results/assistant/discovery-b-diagnostic.json` — 5 turns, 1 repeat
  - `.eval-results/assistant/discovery-b-baseline-audit-r1.json` — 18 turns, 1 repeat (no discovery tool)
- **Legacy artifacts excluded** (harness did not assert tool registration): `discovery-b-dev.json`, `discovery-b-holdout.json`, `discovery-b-baseline.json`.

Trace references below use `<artifact>#<case>/r<repeat>/t<turn>`; turn numbers are 1-based as a student sees them.

---

## 0. Executive summary

The deterministic discovery engine is **not** the source of the reported live failures. Of the 35 failed turn grades across dev and holdout:

| Classification | Turns | Notes |
|---|---:|---|
| **Evaluation/grader defect** — the product behaviour was correct | 20 | metric conflation, reply-pattern over/under-matching, sentence splitting, case expectation contradicting the spec |
| **Tool-selection failure** — discovery not chosen | 9 | 6 dev/holdout "browse by department / year" turns, 3 holdout "recommend 3-credit courses" turns that asked a clarifying question instead of acting |
| **Over-broad constraint extraction after a successful discovery call** | 2 | `scope.codeType: GE` used where the student said GEST |
| **Redundant per-course enrichment (no runtime budget involved)** | 13 | 4–6× `get_course_reviews` (or 7–9× section lookups) after a discovery call that could have carried `reviewTerms` |
| **Zero-result dead end in the topic pool filter** | 2 | literal-phrase `ilike` did not match "Macao history and Chinese cultural heritage" |

Counts overlap (a turn can be both "no discovery" and ">3 tool calls").

Three headline claims in the acceptance audit do not survive trace inspection:

1. **"Difficulty-direction errors 2/3 and 1/3"** — false. `difficultyDirection` in [`evals/assistant/discovery-grade.ts`](../../../evals/assistant/discovery-grade.ts) counts *whole-turn passes* for three case ids; it never inspects the scale direction. **All 72 replies state the scale correctly.** Zero direction errors were observed.
2. **"`maxToolCalls` exceeded / budget exhaustion"** — false as stated. There is **no `maxToolCalls` in the agent runtime at all** (`grep -rn maxToolCalls` matches only eval files). It is a per-turn grader assertion (`toolCalls <= expect.maxToolCalls`). No turn hit `runCapHit`, no turn raised an error, and the 8-step model budget was never exhausted in discovery mode (dev max 5 steps/turn, holdout max 8 once).
3. **"4 dev + 1 holdout unsupported fit claims"** — 4 of the 5 are grader false positives, and the fifth is a graded boundary case whose evidence is in fact `verified_no_clash` for every section. **No fabricated compatibility claim was found.**

The gap between the deterministic engine and the live assistant is real, but it is concentrated in **three product surfaces**: tool-selection precedence, the topic pool query, and per-candidate evidence fan-out. Everything else in the reported numbers is measurement error.

---

## 1. Git / B.1 commit verification

| Check | Result |
|---|---|
| Working tree | Clean (`git status --porcelain` empty) |
| B.1 remediation commit | `718afd8 fix(assistant): B.1 discovery correctness, evidence and eval harness remediation` |
| Files in commit | 32 — 8 under `lib/assistant/`, 6 under `evals/assistant/`, 13 under `tests/`, 5 under `docs/superpowers/` |
| Files outside the B.1 scope | none |
| Secret scan (`sk-…`, `api_key=`, private keys, passwords) | no matches in the commit diff |
| Remediation plan traceability | commit body references `docs/superpowers/plans/2026-10-26-assistant-v2-3-5-b-remediation.md`; file list matches that plan's finding matrix (F-01…F-18) |
| Merge performed | no |

The acceptance audit's blocker "remediation is not committed" is **resolved**: the changeset is coherent, scoped, secret-free, and reviewable.

---

## 2. What each reported metric actually measures

Read before the matrix; five of the six preregistered numbers are not what their names claim.

| Metric (as reported) | Implementation | What it really measures |
|---|---|---|
| Turn pass rate | `gradeDiscovery` → all of `discovery`, `mention`, `forbid`, `falseFitClaims`, `maxToolCalls` | product behaviour **and** case-level rubric string matching |
| Discovery use | `discoveryGrades.filter(g => g.checks.discovery)` where `discovery` = successful parse **AND** the case's `args` predicate | *selection + argument shape*, not adoption. A successful call with `scope.courseType: "GE"` instead of `codePrefix: "GEST"` scores 0. |
| Unsupported fit claims | `falseFitClaimsFromTrace` — sentence regex + course-code regex vs. newest tool fits | includes sentences that name the **student's own saved-plan** sections |
| Difficulty direction | `DIFFICULTY_DIRECTION_CASES` → `hits = grades.filter(g => g.pass)` | whole-turn pass. No scale check exists. |
| No-midterm certainty | `forbid` patterns on the reply | accurate |
| Median discovery-turn tool calls | `median(toolCalls)` excluding `present_response` | accurate (dev 1, holdout 1) |
| `maxToolCalls` (per case) | `toolCalls <= expect.maxToolCalls`, passed as `checks.maxToolCalls` | eval-only assertion; drives 19 of the 35 failures |

Consequence: **the preregistered "discovery use ≥ 90 %" and "difficulty-direction errors = 0" gates are currently unmeasurable.** Fixing the instruments is part of remediation, not a threshold change.

---

## 3. Failure matrix — every failed turn

Legend: `D` = discovery, `M` = mention, `F` = forbid, `FF` = falseFit, `T` = maxToolCalls. Classification codes in §4.

### 3.1 Development (`discovery-b-dev-audit.json`, 22/54 failed)

| Case / r / t | Calls | Failed checks | Tool composition | Classification |
|---|---|---:|---|---|
| `history_ge` r0 t2 | 6 | T | `get_course_description`×3, `get_course_ilo`×3 | R7-a over-fetch |
| `first_year_cs` r0 t1 | 2 | D | `search_catalog`, `count_courses` | **R1** selection |
| `no_candidates` r0 t1 | 1 | D, M | `discover` → `invalid_request` | **R3** case contradicts spec + **R4** mention regex |
| `planner_change` r0 t3 | 2 | D, FF | `check_plan_conflicts`×2 | **R1/R6** follow-up uses the right fine-grained tool; **R5** course-level claim |
| `no_midterm` r0 t2 | 6 | T | `discover`, `get_course_reviews`×5 | R7-a |
| `easy_gest` r1 t1 | 5 | T | `discover`, `get_course_reviews`×4 | R7-a |
| `easy_gest` r1 t4 | 4 | T | `check_plan_conflicts`×4 | R7-b (no `preview_timetable`) |
| `history_ge` r1 t1 | 4 | T | `discover`, `get_course`, `get_course_description`, `get_course_reviews` | R7-a |
| `first_year_cs` r1 t1 | 2 | D | `search_catalog`×2 | **R1** |
| `fill_credits` r1 t2 | 9 | T | `get_course`×4, `get_course_sections`×4, `preview_timetable` | R7-b (8 redundant lookups before the right call) |
| `preference_conflict` r1 t1 | 4 | T | `discover`, `get_course_reviews`×3 | R7-a |
| `no_candidates` r1 t1 | 1 | D | `discover` → `invalid_request` | **R3** |
| `planner_change` r1 t1 | 1 | FF | `discover` | **R5** false positive (plan codes named) |
| `planner_change` r1 t2 | 4 | T | `get_course_reviews`×2, `get_course`×2 | R7-a |
| `planner_change` r1 t3 | 2 | D, FF | `check_plan_conflicts`×2 | **R5** false positive (plan codes named) |
| `no_midterm` r1 t2 | 5 | T | `discover`, `get_course_reviews`×4 | R7-a |
| `history_ge` r2 t1 | 5 | T | `discover`, `search_catalog`, `get_course`, `get_course_reviews`, `get_course_sections` | R7-a + fallback after discovery |
| `first_year_cs` r2 t1 | 1 | D | `search_catalog` | **R1** |
| `fill_credits` r2 t2 | 7 | T | `get_course_sections`×7 | **R7-b** worst case: no `present_response`, no combined check |
| `no_candidates` r2 t1 | 2 | M | `discover`×2 | **R4** mention regex ("No GEST course fits that") |
| `planner_change` r2 t3 | 2 | D | `check_plan_conflicts`×2 | **R1/R6** (see §7.4) |
| `no_midterm` r2 t2 | 5 | T | `discover`, `get_course_reviews`×4 | R7-a |

### 3.2 Holdout (`discovery-b-holdout-audit-full.json`, 14/18 failed)

| Case / r / t | Calls | Failed checks | Tool composition | Classification |
|---|---|---:|---|---|
| `holdout-history_ge` r0 t1 | 13 | D, T | `search_catalog`×7, `get_course`×3, `get_course_reviews`×3 | **R1** + catalog flailing loop |
| `holdout-first_year_cs` r0 t1 | 5 | D, T | `search_catalog`×2, `get_course`×3 | **R1** |
| `holdout-constraints_zh` r0 t1 | 1 | FF | `discover` | **R5** false positive (CJK sentence splitting) |
| `holdout-no_midterm` r0 t1 | 5 | T | `discover`, `get_course_reviews`×4 | R7-a |
| `holdout-fill_credits_zh` r0 t1 | 0 | D, M | none — clarifying question | **R2** over-clarification |
| `holdout-easy_ge` r1 t1 | 5 | D, T | `discover` (`courseType` only), `get_course_reviews`×4 | **R2b** over-broad scope + R7-a |
| `holdout-first_year_cs` r1 t1 | 2 | D | `search_catalog`×2 | **R1** |
| `holdout-no_midterm` r1 t1 | 5 | T | `discover`, `get_course_reviews`×4 | R7-a |
| `holdout-fill_credits_zh` r1 t1 | 0 | D | none — clarifying question | **R2** |
| `holdout-easy_ge` r2 t1 | 1 | D | `discover` (`courseType` only) | **R2b** |
| `holdout-history_ge` r2 t1 | 10 | T | `discover` (0 results), `search_catalog`×5, `count_courses`, `get_course`, `get_course_reviews`, `get_course_sections` | **R8** topic pool returns 0 → fallback loop |
| `holdout-first_year_cs` r2 t1 | 1 | D | `search_catalog` | **R1** |
| `holdout-no_midterm` r2 t1 | 7 | T | `discover`, `get_course_reviews`×6 | R7-a |
| `holdout-fill_credits_zh` r2 t1 | 0 | D | none — clarifying question | **R2** |

### 3.3 Diagnostic (`discovery-b-diagnostic.json`, 1/5 failed)

| Case / r / t | Calls | Failed | Classification |
|---|---|---:|---|
| `easy_gest` r0 t4 | 6 | T, FF (`GEST1005`) | R7-b + **R5** boundary (all sections `verified_no_clash`) |

---

## 4. Root causes

### R1 — Discovery tool-selection precedence is ambiguous (product, P1)

**Evidence (6 turns, deterministic across repeats):**

| Turn | Student | Model action | Discovery calls |
|---|---|---|---|
| `first_year_cs` r0/r1/r2 | "What first-year CS courses could I take this term?" | `search_catalog` with `suggestedYear: 1` | 0/3 |
| `holdout-first_year_cs` r0/r1/r2 | "I'm a year-one student—what CIS intro courses are offered?" | `search_catalog` with `department: CIS` | 0/3 |
| `holdout-history_ge` r0 | "Got a GE about Macau history or Chinese heritage?" | `search_catalog` ×7 | 0 (r1, r2 selected discovery) |

**Why:** the two descriptions overlap and `search_catalog` advertises the exact filters the student's words map to:

- `search_catalog` ([`lib/assistant/tools.ts`](../../../lib/assistant/tools.ts)): "filter by faculty, department, exact credits, course type, programme level, **suggested year and offered status**".
- `discover_course_candidates` ([`lib/assistant/discovery/tool.ts`](../../../lib/assistant/discovery/tool.ts)): "Goal-based course search **when the student has no specific codes yet**" — it never claims department/prefix/year browsing, never claims precedence over `search_catalog`, and never says a constraint-only request is enough to act.

The system prompt says only "Call `discover_course_candidates` once for goal-based searches without codes" ([`lib/assistant/prompt.ts`](../../../lib/assistant/prompt.ts)). A "which courses are offered for year-1 CIS" request reads equally well as a catalog browse.

**Not** a keyword-routing problem: the model's intent reading is right in 2 of 3 repeats on the history case; the contract does not tell it which tool owns that intent.

### R2 — Two intent classes where the model does not act at all (product, P1)

- **R2a over-clarification (3 turns):** `holdout-fill_credits_zh` — "我还差学分，有没有三门学分的课可以推荐？" → **zero tool calls**, a clarifying question asking for a department, in all 3 repeats. The prompt says "When a reasonable reading of the request lets you act, act. Ask one short question only when a missing choice would change the answer and nothing in the context settles it." Nothing in the discovery description says a credit target alone is a sufficient goal.
- **R2b over-broad scope (2 turns):** `holdout-easy_ge` r1/r2 — discovery called with `scope: { courseType: "GE" }` although the student said **GEST**. The schema lists `courseType` as an equal "scope anchor", so a GE-wide pool is valid; the eval then measures the argument mismatch as "no discovery use". Real effect: the reply recommends `GESB1012` / `GESB1013`, not GEST courses.

Both are contract-shape problems, not model capability problems.

### R3 — The `no_candidates` case contradicts the spec (grader, P1)

`required: { startAfter: "18:00", endBefore: "08:00" }` → `discoverCourseCandidatesInputSchema` rejects it (`endBefore must be after startAfter`), returning `invalid_request`. The spec says this is correct behaviour (§13: "Invalid input … includes … `endBefore ≤ startAfter`"), and the remediation's F-16 "impossible rules → `notApplied`" path is unreachable for contradictory windows by design.

The eval case then requires `parseDiscoverResult(...) !== null` **and** the impossible args, so a spec-conformant refusal scores as a failure. The model's actual behaviour was correct in all three repeats (explained the contradiction, offered the two plausible readings) — and in r2 it went on to run the *valid* variant and correctly report zero matches.

### R4 — Reply `mention` patterns miss correct prose (grader, P2)

- `no_candidates` r0: "…which **no class** can satisfy." — pattern is `/no (suitable|match|candidate|option|course)/`, no "class".
- `no_candidates` r2: "**No GEST course fits that.**" — the pattern requires "no course" adjacent.

Both replies are accurate. The pattern is too narrow.

### R5 — Fit-claim grader produces false positives and one boundary miss (grader, P1)

`falseFitClaimsFromTrace` splits the reply on `/(?<=[.!?。！？])\s+|\n+/` and flags any sentence that contains a compatibility idiom **and** a course code whose newest fit is not `verified_no_clash`.

Four false positives, all verified against the raw tool results:

| Trace | Flagged | The sentence is actually about | Raw evidence |
|---|---|---|---|
| `planner_change` r1 t1 | `GEGA1000` | the student's **saved plan**: "verified no clash with your saved plan (GEGA1000-007, MON/THU 13:00–14:15)" | discovery `excluded.alreadyInPlan: 1`; GEGA1000 not a candidate |
| `planner_change` r1 t3 | `GEGA1000`, `ART1001` | the **stale-context caveat**: "your timetable context … still shows … (GEGA1000-007 and ART1001-001)" | `check_plan_conflicts` ran only for GESB1013 / GEGA1001 |
| `holdout-constraints_zh` r0 | `GEGA1000` | "你目前只有 **GEGA1000-007**（MON、THU 13:00-14:15）" — the plan, in the *next* Chinese sentence | Chinese `。` is followed by no space, so the split regex never fires and two sentences become one |
| `holdout-constraints_zh` r1 | (none flagged) | mutual-clash sentence | `verified_no_clash` lookups happened to resolve |

One boundary miss (`planner_change` r0 t3, `easy_gest` diagnostic t4): the sentence "**GEST1005 (CHEUNG WAI) — verified no clash.**" precedes per-section detail. `check_plan_conflicts` returned **both** sections `verified_no_clash` with `complete: true` / `planComplete: true`. The claim is deterministically supported for the course, but the grader only resolves a course-level key when a course has exactly one section (F-12 fixed that case only).

The **product** gate is intact: `fitBadge` in [`lib/assistant/discovery/fit-badge.ts`](../../../lib/assistant/discovery/fit-badge.ts) still suppresses `not_checked`, downgrades `incomplete`, and shows "Timetable changed" when the planner version moves. Nothing in this forensic pass found a badge rendered for unverified evidence.

### R6 — Follow-up turns legitimately use fine-grained tools while the case demands discovery (grader, P2 — recommendation only)

`planner_change` t3 ("I updated my plan—please check those picks again against my timetable") is marked `discovery: "required"`. The model called `check_plan_conflicts` for both recommended courses in all 3 repeats — the tool that produces the authoritative per-section fit for **the picks the student is asking about**, and the cheaper of the two. Marking this a failure penalises the desired behaviour described in the mission (§3: "For follow-up inspection … use the existing … specific tools"; "Do not force every academic question through discovery").

This is a **case-design** defect, not a product failure. It must be changed deliberately and reported as a rubric correction (§"Do not relabel known product failures" — this is not a product failure: the re-check evidence is correct in every repeat).

### R7 — `maxToolCalls` failures are enrichment fan-out, not budget exhaustion (product, P1)

Findings from the traces:

- `maxToolCalls` exists only in [`evals/assistant/discovery-cases.ts`](../../../evals/assistant/discovery-cases.ts) / `discovery-holdout-cases.ts` and [`discovery-grade.ts`](../../../evals/assistant/discovery-grade.ts). **No runtime component enforces it.**
- No failing turn hit `runCapHit`, produced `error`, or exhausted `ASSISTANT_MAX_STEPS = 8`. Steps/turn: dev `{1:6, 2:28, 3:9, 4:8, 5:3}`; holdout `{1:3, 2:4, 3:6, 4:1, 5:2, 7:1, 8:1}`. Total 136/200 dev steps.
- The failure shapes are deterministic:

| Shape | Turns | What the model does | What the contract should have told it |
|---|---:|---|---|
| `discover` then N× `get_course_reviews` | 11 | discovery without `reviewTerms`, then one review read per candidate | `reviewTerms` in the **same** discovery call returns mention counts + excerpts for the top 3 |
| `get_course_description` + `get_course_ilo` ×3 | 1 | 6 reads to answer "strongest history focus?" | description alone answers it; ILO is not needed |
| Per-course section lookups instead of one combined check | 3 | `get_course_sections`×4–7 (+ a late `preview_timetable`) | `preview_timetable({ add: [...] })` answers "do these clash with each other and my plan" in one call |
| Catalog loop after nothing found | 2 | `search_catalog`×5–7 | these are R1/R8 consequences |

Root cause is **not** budget: it is that discovery's contract hides its own enrichment path, and the mutual-clash path is not named for follow-ups. Two of these (R7-b) also show a **lost-context** effect: prior-turn tool results are squeezed to 200 characters ([`lib/assistant/conversation.ts`](../../../lib/assistant/conversation.ts) `OLD_TOOL_RESULT_CHARS`), so `mutualClashes` from turn 1 is unreadable in turn 2 and the model re-derives it the expensive way.

### R8 — Topic pool filter is literal-phrase and diverges from the ranker (product, P1)

`holdout-history_ge` r2 asked discovery for `topics: ["Macau history", "Chinese heritage", "Macao culture"]`. Result: `status: "ok"`, `examined.courses: 0`, `totalMatchingCourses: 0`. The fixture contains **GEGA1000 "Macao and Chinese History"**, description "Macao history and Chinese cultural heritage".

Cause: [`buildTopicOr`](../../../lib/assistant/data/discovery.ts) emits `ilike.%<phrase>%` per topic. "Macau history" is not a substring of "Macao history…"; "Chinese heritage" is not a substring; "Macao culture" is not a substring. The dev paraphrase happened to include "Chinese history", which *is* a substring of the title "…Chinese History" — which is why dev found 3 candidates and holdout found 0.

`topicScore` in [`lib/assistant/discovery/rank.ts`](../../../lib/assistant/discovery/rank.ts) already matches on word boundaries (F-08), so **the pool stage is stricter than the scorer**. That inconsistency is the root cause. The model then spent 9 more calls searching the catalog.

Note also the same run's `topics`/`matched` behaviour: dev `history_ge` r0 returned 3 candidates with `matched: []`, i.e. the relevance reason string is not attached even when the topic filter matched. Not a correctness failure, but it weakens the evidence the model can cite.

### R9 — Baseline eval is neither resumable nor diagnostic (harness, P2)

- 1× baseline completed: 18/18 turns, 69/200 steps, **136 s**, max turn 14.7 s, no errors, no `runCapHit`.
- 3× baseline produced **no artifact** and was reported as a 30-minute Vitest timeout plus a ~55-minute model request timeout.
- Nothing in the harness persists partial results: `runDiscoveryEval` writes the artifact once, after the loop. A timeout therefore destroys all evidence and makes the failure unattributable.
- `vitest.eval.config.ts` sets `testTimeout: 30 * 60 * 1000` for the whole file, so a single stalled provider request cannot be distinguished from slow aggregate work.
- Baseline turns do hit `ASSISTANT_MAX_STEPS = 8` (turns 11, 12, 14: 8 steps) — expected without discovery, and the reason the baseline arm is slower per turn (13.5 non-present calls/turn).

### R10 — Oversized-result compaction is untested and trims safety notes (robustness, P2)

`shrinkDiscoverResult` never drops `mutualClashes`, `unverified`, `notApplied`, `candidates[].fit/clashes` — good. But its final stage is `notes: next.notes.slice(0, 2)`, which drops "The site has no official exam format, prerequisite, seat or workload data" and "suggestedYear is a catalog hint only; it is not official registration eligibility" — the two caveats the F-05/F-15 findings exist to protect. `compaction.dropped` does record `"notes"`, so it is not silent, but the safety text is gone.

There is **no test** that drives the result past `MAX_DISCOVERY_RESULT_CHARS = 12_000` (`grep -n "compaction\|12000" tests/` finds only the constant assert). The acceptance audit flagged this; it remains open.

---

## 5. Case-by-case false-fit analysis (mission §5)

| # | Trace | Claimed course / section | Claim text (excerpt) | Planner snapshot | Deterministic evidence | Verdict |
|---|---|---|---|---|---|---|
| 1 | `planner_change` r0 t3 | GEST1005 (course-level) | "GEST1005 (CHEUNG WAI) — verified no clash. Section 002 … is clear, and so is section 001, though that one meets FRI 11:00–12:15" | `GE plan`, 2026/1, `planComplete: true` | `check_plan_conflicts` → sections `001` `FRI 11:00-12:15` `verified_no_clash`, `002` `TUE 15:00-16:15` `verified_no_clash`, both `complete: true` | **Grounded.** Both sections verified. Grader cannot resolve a course-level key for a 2-section course. → grader defect |
| 2 | `planner_change` r1 t1 | GEGA1000 | "all **verified no clash** with your saved plan (**GEGA1000-007**, MON/THU 13:00–14:15)" | same | GEGA1000 is the plan's own section; discovery excluded it (`alreadyInPlan: 1`); 5 candidates all `verified_no_clash` | **False positive.** The code names the *plan*, not a recommendation → grader defect |
| 3 | `planner_change` r1 t3 | GEGA1000, ART1001 | "…still shows the same two courses as before (**GEGA1000-007** and **ART1001-001**)" | same | `check_plan_conflicts` ran for GESB1013 (verified) and GEGA1001 (`temporarily_unavailable`) | **False positive.** Plan codes in a stale-context caveat → grader defect |
| 4 | `holdout-constraints_zh` r0 | GEGA1000 | "你目前只有 **GEGA1000-007**（MON、THU 13:00-14:15），所以大部分時段都空著。" (joined to the previous sentence by the splitter) | `GE plan` | 8 candidates, all `verified_no_clash`; GEGA1000 is the plan section | **False positive.** CJK sentence splitting + plan code → grader defect |
| 5 | diagnostic `easy_gest` r0 t4 | GEST1005 | "**GEST1005 (CHEUNG WAI) — checked, no clash:**" then per-section lines | `GEGA_PLAN` | `check_plan_conflicts` → both sections `verified_no_clash` | **Grounded.** Same boundary as #1 → grader defect |

Reproduction: each row's fit is taken from the recorded tool JSON in the trace, which is produced by the deterministic engine against the fixture pool; rows 1/2/3/5 are additionally reproducible by `check_plan_conflicts` / discovery unit fixtures (regression tests added in remediation).

**Confirmed product errors: 0 fabrications; 0 claims about a clashing or unchecked section.** The prose is verbose and sometimes course-level where a section is what matters, but it does not invent compatibility.

---

## 6. Difficulty-direction root cause (mission §6)

**Reported:** dev 2/3, holdout 1/3. **Actual direction errors: 0/72.**

`summarizeDiscovery` computes:

```ts
const difficultyGrades = grades.filter((g) => DIFFICULTY_DIRECTION_CASES.has(g.caseId));
const difficultyHits = difficultyGrades.filter((g) => g.pass).length;   // whole-turn pass
```

- Dev `cases: 3` = `preference_conflict` ×3. r1's only failing check was `maxToolCalls` (`discover` + 3 review reads). The reply says "ranked by difficulty score where 5 = very easy".
- Holdout `cases: 3` = `holdout-easy_ge` ×3. r1/r2 failed on discovery-argument scope. Both replies label the column "Difficulty (1 hard–5 easy)" / "Difficulty (ease)" and rank correctly.

A scan of every reply in all three artifacts found **no inversion** (`1 = easiest`, `5 = hardest`, "lower is easier", "difficulty 4.3 (harder)", …): every one of the 30 difficulty-bearing statements carries the correct direction, including the Chinese replies ("難度分數越高代表越容易").

The deterministic ranking already uses `easier → difficulty/ease` correctly (`RANKING_PRIORITIES` in `rank.ts`); no data or ranking change is warranted. The fix is to make the metric check what it claims: an explicit direction assertion on the difficulty-case replies, with an inversion blacklist.

---

## 7. Discovery-tool-selection investigation (mission §3)

### 7.1 Model-visible surface

16 tools per request (provider emits them alphabetically; `discover_course_candidates` is 6th):

`AGUISendStateDelta`, `AGUISendStateSnapshot`, `check_plan_conflicts`, `count_courses`, `count_reviews`, `discover_course_candidates`, `get_course`, `get_course_description`, `get_course_ilo`, `get_course_reviews`, `get_course_sections`, `get_instructor`, `navigate`, `present_response`, `preview_timetable`, `search_catalog`.

The two `AGUI*` state tools are framework overhead (never selected, harmless). Tool ordering is provider-controlled and not a lever.

### 7.2 Selection outcomes for required-discovery turns

| Bucket | Dev | Holdout |
|---|---:|---:|
| Successful discovery with matching args | 22 | 9 |
| Successful discovery, args predicate failed | 0 | 2 |
| Call made, rejected (`invalid_request`) | 2 | 0 |
| No discovery call at all | 6 | 7 |

The 6 + 7 "no call" turns are exactly R1 (6) and R2a (3) plus `holdout-history_ge` r0 (1). So **adoption is not "the model can't call the tool"** — it is "the contract does not claim these three intent classes".

### 7.3 Desired behaviour vs. observed

| Intent | Desired | Observed |
|---|---|---|
| "easy GEST courses that fit my timetable" | one bounded discovery call | ✅ 9/9 (dev+holdout) |
| "how many credits is X" (factual) | fine-grained tool, no discovery | ✅ `easy_gest` t3 / `no_midterm` t1 forbidden checks pass 6/6 |
| "tell me about the second recommendation" (follow-up) | referent + course tools, no discovery | ✅ 6/6 (`easy_gest` t3 passes with `get_course` + `get_course_description`) |
| "which courses are offered for year-1 CIS" | discovery | ❌ 0/6 |
| "recommend 3-credit courses" (constraint only) | discovery | ❌ 0/3 |
| topic/keyword discovery | discovery | ⚠️ 2/3 holdout (r0 fell back to catalog) |
| re-check after planner edit | fine-grained fit tool | ✅ 3/3 (graded as failure — R6) |

### 7.4 Is a structured orchestration policy needed?

No, not yet. Every observed selection error is a *description coverage* gap, not a reasoning gap: the model picks a defensible tool for the words it sees, and the losing tool advertises the winning filter. Prompt/description refinement is demonstrably sufficient to test next; a router or procedural policy would be a second framework for a problem that is currently three sentences of contract.

---

## 8. Step budget

`ASSISTANT_MAX_STEPS = 8` is sufficient for the intended workflow with discovery: the maximum observed is 5 steps/turn in dev and 8 in one holdout turn (the `holdout-history_ge` r2 fallback loop, which is an R8 consequence and disappears when the topic pool returns candidates). No change to `ASSISTANT_MAX_STEPS` is justified, and none is proposed.

---

## 9. Baseline comparison validity

| Item | Value |
|---|---|
| 1× baseline | 18/18 turns, 69/200 steps, 136 s, 13.5 median non-present tool calls on required-discovery turns, 0 false-fit, `toolRegistrationViolations: 0` |
| 3× baseline | no artifact; reported Vitest 30-min timeout + provider timeout |
| Dev (discovery) | 136/200 steps, median 1 tool call on discovery turns |
| Comparability | baseline is graded with `discovery: "required"` expectations that **cannot** pass without the tool (10 required slots, 0 hits by construction). Its pass rate (0.389) is not comparable to dev (0.593) and must not be reported as an improvement. Tool-call volume, latency, false-fit and qualitative traces are comparable. |

Missing instrumentation: no per-case elapsed persistence, no partial artifact, no per-arm wall clock. Fix is in R9.

---

## 10. What is verified working (do not regress)

- Batched catalog/pwc/offer reads (3 round trips + review enrichment ≤ 6).
- Offered-term filtering, `Is_Offered = 1`, plan-course exclusion (`alreadyInPlan`).
- Strict schema: 0 `invalid_request` payloads in dev, 27 attempts → 23 `ok`; the only 2 rejections are the deliberate impossible-window case (R3).
- Deterministic conflict checks shared with `check_plan_conflicts`; `planComplete`/`sectionListComplete`/`meetingsComplete` gating.
- Planner version in evidence (`fitBadge` stale detection) and cross-turn ordinals (`discussed-courses-discovery.test.ts`, integration J3).
- `mutualClashes`, `unverified`, `notApplied`, `examined.truncated` present and surfaced.
- Soft-unknown scoring, review sample-size shrinkage, `notes` for individual-vs-mutual fit, suggested-year caveat.
- Tool registration assertions (`toolRegistrationViolations: 0` in all valid artifacts).
- `present_response` excluded from tool-call counts; no catalog flooding in the successful discovery turns.
- Read-only boundary (no planner writes anywhere in the discovery path).

---

## 11. Conclusion

The failure taxonomy, ranked by what actually moves the student experience:

| Rank | Cause | Product or measurement | Fix surface |
|---|---|---|---|
| 1 | R1 tool-selection precedence | product | discovery description + one prompt bullet |
| 2 | R2a/R2b act-vs-clarify and scope breadth | product | same contract text |
| 3 | R8 topic pool phrase matching | product | `buildTopicOr` + fixture, shared word expansion |
| 4 | R7 evidence fan-out | product | `reviewTerms` and mutual-clash guidance in contract text |
| 5 | R5 fit-claim grader | measurement | sentence split, plan-code exclusion, all-sections rule |
| 6 | R3/R4/R6 case rubric | measurement | case expectations (documented as corrections) |
| 7 | metric definitions (`discoveryUse`, `difficultyDirection`) | measurement | `discovery-grade.ts` |
| 8 | R9 baseline resumability | measurement | eval harness |
| 9 | R10 shrink test and safety notes | robustness | `discover.ts` + test |

No evidence supports changing ranking data, the fit engine, the schema, the step budget, or the architecture. Remediation must stay inside the nine surfaces above.
