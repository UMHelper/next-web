# What2Reg AI V2.3.5-B: Intelligent course discovery — verification

- **Verified:** 2026-10-26 (Task 14)
- **Branch:** `feat/assistant-v2-3-5-b-discovery`
- **HEAD (gates + live evals):** `2aef5c0` (after gate fixes); milestone implementation through `4c4c6b1`
- **Spec:** [`docs/superpowers/specs/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md`](../specs/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md)
- **Plan:** [`docs/superpowers/plans/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md`](../plans/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md)

---

## §20 Verification items (1–13)

### 1. Goal delivered (in code)

Students can describe goals and constraints in natural language; the assistant has a read-only `discover_course_candidates` tool that returns ranked, section-level, fit-checked candidates for the active term, groundable through `present_response.recommendations` with section lines and planner-version-gated fit badges.

### 2. Architecture (approach A)

Three batched PostgREST reads (`lib/assistant/data/discovery.ts`) plus pure TypeScript ranking/fit in `lib/assistant/discovery/*`. Shared `conflictFitForSection` with `check_plan_conflicts`. No DB migration. Presentation extends existing shortlist hydration (`lib/assistant/discovery/evidence.ts`, `RecommendationSectionLine`).

### 3. Zero-tolerance deterministic gates (spec §14)

Covered by unit/integration tests (not re-proven live):

| Gate | Evidence |
|---|---|
| No false `verified_no_clash` | `tests/assistant/check-plan-conflicts.test.ts`, `tests/assistant/discovery.test.ts` |
| No verify on incomplete meetings / incomplete plan | Same + Task 1 scenarios |
| Shortlist stale planner version | `tests/assistant/fit-badge.test.ts`, `tests/components/recommendation-shortlist.test.tsx`, journey 2 in `assistant-v2-3-5-b.integration.test.tsx` |
| No invented sections | Real-data smoke verifies offer rows; engine tests |
| Active term only | Data layer filters + tests |
| Difficulty direction | `tests/assistant/academic-facts.test.ts`, discovery ranking tests |
| Read-only planner | `tests/assistant/read-only-planner.test.ts` |
| No exam/prereq/seat fields | Schema/output tests in `discovery.test.ts` |

### 4. CopilotKit journeys (scripted model)

`tests/components/assistant-v2-3-5-b.integration.test.tsx` — scenarios E shortlist, planner-change badge, ordinal follow-up, discovery failure envelope, history compaction under `MAX_RUN_BODY_BYTES`. **Pass** on gate run (included in full vitest).

### 5. Automated gates (2026-10-26, `2aef5c0`)

| Gate | Command | Result |
|---|---|---|
| Tests | `npx vitest run` | **PASS** — **278** files, **2314** tests |
| Typecheck | `npx tsc --noEmit` | **PASS** |
| Lint | `npm run lint` | **PASS** (`eslint . --max-warnings=0`) |
| Build | `npm run build` | **PASS** |

Task 14 gate fix commit `2aef5c0`: timetable narrowing in `discover.ts`, semantic badge colors, discovery fixture import fixes, ToolTrace expansion helper for legacy integration tests.

### 6. Live discovery eval — dev (fixture, DeepSeek)

**Command:** `ASSISTANT_EVAL=1 ASSISTANT_EVAL_LABEL=b-dev npm run eval:assistant -- evals/assistant/discovery.eval.ts`

**Artifact:** `.eval-results/assistant/discovery-b-dev.json` (local; gitignored)

| Metric | Result | Dev threshold | Met? |
|---|---|---:|---|
| Turn pass rate | **15/48 = 0.313** (partial run) | ≥ 0.80 | **No** |
| `discover_course_candidates` use | **1/26 ≈ 0.038** on graded discovery turns | ≥ 0.90 | **No** |
| False clash-free prose claims | **4** | 0 | **No** |
| Difficulty-direction errors | **0/3** | 0 | **Yes** |
| No-midterm certainty violations | **0** | 0 | **Yes** |
| Median tool calls (discovery turns) | **14** | ≤ 2 | **No** |

**Run completeness:** **Incomplete** — stopped at step budget 200 during `no_candidates` repeat 2 (48/54 expected turns). Prompt fingerprint `69470b851c9e`, eval fingerprint `c463f0941813`.

### 7. Live discovery eval — holdout

**Command:** `ASSISTANT_EVAL=1 ASSISTANT_EVAL_SUITE=holdout ASSISTANT_EVAL_LABEL=b-holdout npm run eval:assistant -- evals/assistant/discovery.eval.ts`

**Artifact:** `.eval-results/assistant/discovery-b-holdout.json`

| Metric | Result | Holdout threshold | Met? |
|---|---|---:|---|
| Turn pass rate | **0/18 = 0** | ≥ 0.75 | **No** |
| Discovery tool use | **0/18 = 0** | ≥ 0.90 | **No** |
| False clash-free claims | **0** | 0 | **Yes** |
| Difficulty-direction | **0/3** | 0 | **Yes** |
| No-midterm certainty | **0** | 0 | **Yes** |
| Median tool calls | **14** | ≤ 2 | **No** |

Run **complete** (18/18 turns). Eval fingerprint `bbe29ea16cdc`.

### 8. Baseline (discovery tool removed)

**Command:** `ASSISTANT_EVAL=1 ASSISTANT_EVAL_NO_DISCOVERY=1 ASSISTANT_EVAL_LABEL=b-baseline npm run eval:assistant -- evals/assistant/discovery.eval.ts`

**Artifact:** `.eval-results/assistant/discovery-b-baseline.json`

| Metric | Result | Note |
|---|---|---|
| Pass rate (partial) | **15/48 = 0.313** | Same step-budget stop as dev |
| Discovery use | **2/26 ≈ 0.077** | Tool mocked away; residual hits are grader edge cases |
| False fit claims | **9** | Higher than with tool enabled (partial) |
| Median tool calls | **16.5** | Confirms legacy search chains without bounded discovery |

**Incomplete** at 48/54 turns. Informational comparison only.

### 9. Agent-behavior regression (dev, 1 repeat)

**Command:** `ASSISTANT_EVAL=1 ASSISTANT_EVAL_REPEATS=1 ASSISTANT_EVAL_LABEL=v235b-regression npm run eval:assistant -- evals/assistant/agent-behavior.eval.ts`

**Artifact:** `.eval-results/assistant/agent-behavior-v235b-regression.json`

| Metric | Result | V2.3.5-A dev floor (informational) |
|---|---|---|
| Pass rate | **10/16 = 0.625** | 0.85 (not re-thresholded for B) |
| `falseCardClaim` | **0** | 0 |
| Difficulty direction | **1/2** | 1.00 |
| `no_midterm` | **0** | 0 |
| `partial_failure` | **1/1** | 1.00 |

No new safety regressions on card claims or midterm certainty; pass rate still below historical dev target (mostly card/tool expectation mismatches, not discovery-specific).

### 10. Real-data performance smoke (Task 13 / Task 14)

**Command:** `DISCOVERY_REAL_DATA=1 DISCOVERY_REAL_DATA_LABEL=task14 npx vitest run --config vitest.eval.config.ts evals/assistant/discovery-real-data.eval.ts`

**Artifact:** `.eval-results/assistant/discovery-real-data-task14.json`

| Scenario | DB requests | ms | chars | examined.courses | truncated |
|---|---:|---:|---:|---:|---|
| gest-easy | 3 | 45.7 | 5052 | 19 | no |
| ge-topics-macao-history | 3 | 38.8 | 5069 | 15 | no |
| cisc-first-year | 3 | 8.0 | 2350 | 4 | no |
| cis-dept-3-credits | 3 | 8.5 | 4636 | 20 | no |
| ge-required-schedule | 4 | 13.0 | 1347 | 56 | no |
| non-ge-truncation | **6** | 22.3 | 5150 | 150 (514 total) | **yes** |

All candidates cross-checked against live `offer` reads for 2026/1. Non-GE scope uses **6** Supabase requests (documented in progress ledger). No production latency guarantee (spec §14).

### 11. Browser acceptance (spec §17 checklist — plan Task 11 / brief)

**Environment:** No signed-in Clerk session in this pass; `npm run dev` + browser tooling not run.

| Checklist item | 380px | 800px |
|---|---|---|
| Goal-based discovery turn → shortlist with section line + fit badge | UNVERIFIED | UNVERIFIED |
| No catalog list flood on discovery turn | UNVERIFIED | UNVERIFIED |
| Planner edit → “Timetable changed – ask me to re-check” | UNVERIFIED | UNVERIFIED |
| Ordinal “second one” after discovery shortlist | UNVERIFIED | UNVERIFIED |
| Discovery tool failure → honest activity error, no shortlist | UNVERIFIED | UNVERIFIED |
| Activity label “Finding courses” / “Found courses” | UNVERIFIED | UNVERIFIED |
| Narrow panel truncation (380px) for section line | UNVERIFIED | UNVERIFIED |

jsdom CopilotKit journeys (`assistant-v2-3-5-b.integration.test.tsx`) cover the above logically but **do not substitute** for manual browser sign-off.

### 12. Independent review (Task 14 focus)

| Area | Finding | Action |
|---|---|---|
| Timetable correctness | Shared fit function; plan completeness + truncation enforced before `verified_no_clash` | **OK** — tests + `2aef5c0` TS fix |
| Data semantics | Difficulty 1=hard, 5=easy; ratings course-specific; notes disclaim exam/prereq/seats | **OK** |
| Query efficiency | 3 requests typical; 6 for broad Non-GE truncation smoke | **OK** for MVP bounds |
| Tool contract | Zod scope anchors, shrink order, error envelope | **OK** |
| Student experience (live) | Model rarely calls discovery; long search chains; false fit prose on partial dev run | **Concern — not merge-blocking for code; blocks live quality sign-off** |
| Read-only boundaries | No planner writes in discovery path | **OK** |
| V3 compatibility | Returns individual candidates + `mutualClashes`; no combination optimizer | **OK** |
| Dead UI | `AgentTurnActivity` component exists but chat uses `ToolTrace` only | **Note** — no functional bug; optional cleanup later |

No additional in-scope code defects confirmed beyond gate fixes committed in `2aef5c0`.

### 13. Release stance

**Engineering merge readiness:** Automated gates green on `2aef5c0`; deterministic safety properties and CopilotKit journeys pass.

**Product / live-model readiness:** **Not met** — discovery live eval misses every preregistered dev/holdout threshold except zero-tolerance prose metrics (`no_midterm`, holdout false-fit). Root cause: model orchestration (low discovery adoption, high tool-call counts), not fixture grader bugs.

**Do not start V2.3.5-C** per Task 14 stop line.

---

## §21 Assessment (answers 1–14)

1. **Was the spec implemented?** Yes — tool, data layer, engine, presentation, prompt, eval harness, real-data smoke, and integration journeys are on the branch through `4c4c6b1` plus gate fix `2aef5c0`.

2. **Does the deterministic layer prevent unsafe clash claims?** Yes, when the tool is used — fits are computed server-side; shortlist badges gate on live planner version.

3. **Does live DeepSeek use the tool?** No — holdout 0% discovery use; dev partial ~4%; model falls back to legacy search/read chains.

4. **Are preregistered live thresholds met?** No — pass rate, discovery use, and median tool calls fail; false-fit and difficulty violations fail on dev partial.

5. **Is real-data performance acceptable for MVP?** Yes for recorded scopes — sub-50ms typical, ≤6 requests, results under 12k chars.

6. **Regression on V2.3.5-A agent behavior?** No safety regression on false card claims or midterm certainty; pass rate still ~0.625 on one dev repeat.

7. **Browser acceptance?** Unverified — no authenticated manual run.

8. **Biggest student-facing risk if shipped now?** Assistant may ignore discovery and burn steps on catalog searches while still occasionally claiming clash-free sections in prose (4 false-fit hits on partial dev).

9. **Biggest engineering risk?** Low — read-only, bounded queries, tested fit semantics.

10. **V3 timetable optimization impact?** None — B explicitly returns per-course best sections and `mutualClashes`, not full timetables.

11. **Known data limits honored?** Yes — no exam/prereq/seat fields; SAT meetings → incomplete clash; truncation flagged.

12. **What must happen before production sign-off?** Re-run complete discovery live eval after prompt/tool routing improvements; signed-in browser checklist at 380px and 800px.

13. **Open product questions blocking live quality?** Model adoption of `discover_course_candidates` vs habituated `search_catalog` (see audit Q-04 style — tool sequencing policy).

14. **Final verdict?** **Ship the code path to integration branch review; do not treat live eval as passing.** Milestone B delivers the platform capability; model orchestration remains the gating item for student-facing discovery quality.

---

## Evidence index (local artifacts)

| File | Purpose |
|---|---|
| `.eval-results/assistant/discovery-b-dev.json` | Live dev discovery (partial) |
| `.eval-results/assistant/discovery-b-holdout.json` | Live holdout discovery |
| `.eval-results/assistant/discovery-b-baseline.json` | Baseline without tool (partial) |
| `.eval-results/assistant/agent-behavior-v235b-regression.json` | Agent-behavior regression ×1 |
| `.eval-results/assistant/discovery-real-data-task14.json` | Real-data smoke Task 14 |

---

## Limitations (unchanged from spec)

- Individual section fits do not prove a full timetable combination (V3 scope).
- `search_catalog` text `credits` filter remains a known catalog issue (out of scope).
- Desktop-only assistant mount; client history truncation still applies to old discovery JSON.
- Live eval step budget (200) exhausted before full dev/baseline suite completion.
