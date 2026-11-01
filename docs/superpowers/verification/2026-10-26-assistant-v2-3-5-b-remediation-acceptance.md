# V2.3.5-B remediation — acceptance and resolution matrix

- **Date:** 2026-10-26
- **Branch:** `feat/assistant-v2-3-5-b-discovery`
- **Audit:** [`docs/superpowers/audits/2026-10-26-assistant-v2-3-5-b-implementation-audit.md`](../audits/2026-10-26-assistant-v2-3-5-b-implementation-audit.md)
- **Plan:** [`docs/superpowers/plans/2026-10-26-assistant-v2-3-5-b-remediation.md`](../plans/2026-10-26-assistant-v2-3-5-b-remediation.md)

## Automated gates (post-remediation)

| Gate | Result |
|---|---|
| Targeted discovery + referent tests | **PASS** |
| Full Vitest | **PASS** — 279 files, 2323 tests |
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

## Live-model evaluation harness

| Check | Before (audit) | After |
|---|---|---|
| `discover_course_candidates` in provider `tools` | Absent in dev/holdout/baseline artifacts | **Asserted** in [`discovery-eval-lib.ts`](../../evals/assistant/discovery-eval-lib.ts) |
| Baseline isolation | Hoisted conditional mock broke both arms | **Separate** [`discovery-baseline.eval.ts`](../../evals/assistant/discovery-baseline.eval.ts) |
| Discovery “use” metric | Counted rejected calls | **Successful** `status: "ok"` only ([`discovery-grade.ts`](../../evals/assistant/discovery-grade.ts)) |
| False-fit grader | Missing code-level key for `check_plan_conflicts` | **Fixed** + unit test |

### Diagnostic live run (2026-10-26)

**Command:** `ASSISTANT_EVAL=1 ASSISTANT_EVAL_CASES=easy_gest ASSISTANT_EVAL_REPEATS=1 ASSISTANT_EVAL_LABEL=b-diagnostic npm run eval:assistant -- evals/assistant/discovery-diagnostic.eval.ts`

**Artifact:** `.eval-results/assistant/discovery-b-diagnostic.json`

| Metric | Value |
|---|---|
| Tool registration violations | 0 |
| Discovery attempts | 1 |
| Discovery successes | 1 |
| `discoveryUse.rate` (required turns) | 1.0 |

Preregistered dev/holdout/baseline full suites remain to be executed on this branch when budget allows; the harness now measures B validly.

## Authenticated browser acceptance

**Status: UNVERIFIED — release blocker**

No signed-in Clerk session was available in this remediation pass. jsdom/CopilotKit integration tests cover logic only, not 380px / 450px / 800px rendered acceptance.

## Finding resolution matrix (F-01–F-18)

| ID | Status | Verification |
|---|---|---|
| F-01 | **Fixed** | Strict Zod objects; `invalid_request` + `issues`; schema tests |
| F-02 | **Fixed** | Split eval files; tool-list assertions; diagnostic artifact |
| F-03 | **Fixed** | `otherSections.meetings` as `string[]`; evidence test uses producer shape |
| F-04 | **Fixed** | Alternate `clashes` passed to evidence |
| F-05 | **Fixed** | `DISCOVERY_NOTES` + tool description; discovery.test notes |
| F-06 | **Fixed** | Schedule score + tradeoffs for unknown; rank tests |
| F-07 | **Fixed** | Shrink preserves safety fields; `compaction` marker when trimming |
| F-08 | **Fixed** | Word-boundary topic match; “AI” vs “daily” test |
| F-09 | **Fixed** | Course-code validation; `excludedCodesMatched` from data layer |
| F-10 | **Deferred (P3)** | Server/UI planner-version mismatch for large plans; document only |
| F-11 | **Fixed** | `discussed-courses` cross-turn active order; unit + course-referent tests |
| F-12 | **Fixed** | Grader code-level fit; eval-discovery tests |
| F-13 | **Fixed** | Performance test uses budgets not 200ms wall-clock gate |
| F-14 | **Deferred (P3)** | Documented exception in `tool.ts` (trackDiscovery path) |
| F-15 | **Accepted limitation** | Review excerpts wrapped `[review]…[/review]`; prompt-only defense noted |
| F-16 | **Fixed (minimal)** | `notApplied` when no candidates after required exclusions |
| F-17 | **Partial** | Topic-aware catalog scan up to 600 rows before top-150 cap |
| F-18 | **Partial** | `MAX_OFFER_ROWS` cap in data layer |

## Independent review (remediation pass)

No new P1/P2 defects identified in code review of this diff. Live product acceptance remains **partially unverified** until full dev/holdout/baseline reruns and browser checklist complete.

## Before / after (behavior)

| Area | Before | After |
|---|---|---|
| Unknown constraint keys | Silently stripped | Parse fails with `issues` |
| Live eval | Tool never registered | Tool asserted + successful call in diagnostic |
| Alternate meetings | Comma-joined string | Array; all meetings in UI evidence |
| Soft schedule unknown | Treated as satisfied | Tradeoff + reduced schedule score |
| 12KB shrink | Dropped safety fields silently | Descriptive trim first; `compaction` when needed |
| Cross-turn “second one” | Required `get_course` | Prior `present_response` order in discussed context |
