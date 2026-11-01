# V2.3.5-B.2 — Final Acceptance Report

**Date:** 2026-10-27  
**Canonical worktree:** `/Users/thomaswu/workspace/next-web/.worktrees/assistant-v2-3-5-b2`  
**Branch:** `feat/assistant-v2-3-5-b2-remediation`  
**HEAD:** `b3a8e7c` (acceptance docs; implementation tip `4a50394` prompt budget fix)  
**Recovery baseline:** `d204670`  
**Implementation commits after recovery:** `859a66c`, `4e1fda0`, `49d1600`, `18e13f3`, `4a50394`

## 1. Implementation scope verified

| Check | Result |
|---|---|
| Branch / HEAD | `feat/assistant-v2-3-5-b2-remediation` @ `4a50394` |
| Working tree at report time | Clean after acceptance commit (verification docs + prompt budget fix) |
| Exclusive writer | Single agent session in canonical worktree; no branch reset or extra worktrees |
| Plan + forensic audit | Present under `docs/superpowers/plans/` and `docs/superpowers/audits/` (`18e13f3`) |
| B.2 product tasks (7–9) | Tiered topic match, individual vs combined fit notes, compaction downgrade (commits above) |

## 2. Automated verification (Phase C.1)

Commands run from worktree root:

| Command | Exit | Result |
|---|---:|---|
| `npx vitest run` | 0 | **282** files, **2420** tests passed (after prompt budget fix) |
| `npx tsc --noEmit` | 0 | Clean |
| `npm run lint` | 0 | Clean (`eslint . --max-warnings=0`) |
| `npm run build` | 0 | Production build succeeded when env loaded from repo-root `.env.local` (bare worktree build fails at page-data collection without Supabase public env) |

**Gate fix during acceptance:** `ASSISTANT_PROMPT` exceeded 15 000 characters after B.3 `reviewTerms` guidance; compressed wording in `lib/assistant/prompt.ts` (`4a50394`) without removing combined-fit or `reviewTerms` semantics.

## 3. Topic retrieval correctness

**Deterministic:** `topic-match.ts` tier tests (Macau/Macao variants, phrase vs word-combination, bounded fallback) pass in Vitest. SQL prefilter + in-memory rank share the same matcher.

**Live (`history_ge`, `b2-dev` repeat 0):** `discover_course_candidates` returned candidates `GEGA1000`, `GEGA1001`, `GEGA1002` on the Macao/Chinese history turn (no zero-result dead end observed in this run).

## 4. Evidence compaction correctness

**Deterministic:** Oversized discovery payloads trim non-critical fields; when fit evidence is dropped, `candidates[].fit` downgrades to `incomplete` with `compaction.downgraded` (`49d1600`, covered in `discovery.test.ts`).

## 5. Historical regrading (Comparison A)

**Status: VERIFIED**

Original v1 JSON artifacts were found (read-only) at:

- `/Users/thomaswu/workspace/next-web/.eval-results/assistant/discovery-b-dev-audit.json` (mtime 2026-10-26, 54 traces)
- `discovery-b-holdout-audit-full.json` (18 traces)
- `discovery-b-diagnostic.json` (5 traces)
- `discovery-b-baseline-audit-r1.json` (18 traces)

Regrade outputs (new files only) under worktree `.eval-results/assistant/discovery-regrade-b2-b-*.json`. Sources were not modified.

See [before-after report](./2026-10-26-assistant-v2-3-5-b2-before-after.md) for Comparison A metrics.

## 6. Live diagnostic (`b2-diagnostic`)

| Check | Result |
|---|---|
| Discovery tool registered | Yes (`toolRegistrationViolations: []`) |
| Discovery executes | Yes (`discoverySuccesses: 1`) |
| Provider settings consistent | Yes (`requestMismatches: []`) |
| Full journey on smoke case | **Partial** — 2/5 turns passed on `easy_gest`; fan-out (`get_course_reviews` ×4 after discovery) and `maxToolCalls` failures on several turns |
| Aggregate false-fit on diagnostic only | 2 (full dev/holdout suites: **0**) |

Diagnostic validated harness + model connectivity; it did **not** clear all journey-quality checks on the smoke case.

## 7. Development evaluation (`b2-dev`, 3×, `dev-v2`)

Artifact: `.eval-results/assistant/discovery-b2-dev.json` — **complete**, 63 turns.

| Preregistered gate | Threshold | Result |
|---|---:|---|
| Journey pass rate | ≥ 80% | **80.95%** — pass (margin ~0.95 pp) |
| Discovery use | ≥ 90% | **92.59%** — pass |
| Confirmed false-fit claims | 0 | **0** — pass |
| Difficulty direction inverted | 0 | **0** — pass |
| No-midterm certainty violations | 0 | **0** — pass |
| Median discovery-turn tool calls | ≤ 2 | **2.0** — pass (at ceiling) |

**Vitest:** `discovery.eval.ts` thresholds **passed** for dev.

Recurring failure themes (12 turns): `maxToolCalls` exceeded after discovery (review/section fan-out), `first_year_cs` discovery not called in some repeats.

## 8. Holdout evaluation (`b2-holdout`, 3×, `holdout-v1`)

Artifact: `.eval-results/assistant/discovery-b2-holdout.json` — **complete**, 18 turns.

| Preregistered gate | Threshold | Result |
|---|---:|---|
| Journey pass rate | ≥ 75% | **55.56%** — **FAIL** |
| Discovery use | ≥ 90% | **77.78%** — **FAIL** |
| Confirmed false-fit claims | 0 | **0** — pass |
| Difficulty direction inverted | 0 | **0** — pass |
| Median tool calls | ≤ 2 | **1.5** — pass |

**Vitest:** `discovery.eval.ts` **failed** on holdout pass rate (expected ≥ 0.75, got ~0.556).

## 9. Baseline comparison

| Run | Complete | Median tool calls | Pass rate (not comparable to discovery) |
|---|---:|---:|---:|
| `b2-baseline-diag` | yes | 16 | 33.3% (3-case partition) |
| `b2-baseline` (full dev-v2, 1×) | yes | 18 | 42.9% |

Baseline arm confirms higher tool volume without discovery (expected). Incremental artifact write path exercised; no timeout partials in these runs.

## 10. Student-journey assessment (fixture-backed live traces)

Eval cases map to the requested journeys:

| Journey | Case / evidence | Assessment |
|---|---|---|
| Easy GEST + timetable | `easy_gest` | Discovery used; recommendations shown; fit re-check turns still hit `maxToolCalls` / fan-out |
| Constraint refinement | `explicit_constraints` | Covered in dev suite; passes in aggregate |
| Macao / heritage GE | `history_ge` | Topic retrieval returns relevant GEGA candidates (live trace) |
| 3-credit discovery | `fill_credits` / holdout paraphrases | Mixed; holdout `fill_credits_zh` missed discovery in one repeat |
| Combined compatibility | Prompt + `DISCOVERY_NOTES`; eval fit grader | No aggregate false-fit in full suites; model still uses multiple `check_plan_conflicts` on some fit turns |
| Follow-up reference | `easy_gest` turn 3 | `discover` forbidden; uses context tools |
| Planner change | `planner_change` | In dev suite |
| Catalog browse without discovery | `catalog_browse` + J6 integration test | Integration test passes tool-selection bullet |

## 11. Browser acceptance

**Status: UNVERIFIED**

No authorized signed-in Clerk session was available in this pass. jsdom/CopilotKit integration tests cover logic, not rendered chat at **380px / 450px / 800px**.

**Manual checklist (when session available):**

1. Open assistant on a signed-in student account at 380px, 450px, and 800px widths.
2. Course discovery: ask for an easy GEST course that fits the timetable — expect shortlist + meetings, no catalog flood.
3. Subject discovery: Macao/heritage GE — expect discovery-driven recommendations, not empty topic dead ends.
4. Combined fit: ask whether three selected sections work together — expect `preview_timetable` or explicit incomplete evidence, not prose-only verified badges.
5. Verify `present_response` receipts: verified-fit badges match tool evidence; stale planner shows stale state.
6. Recommendation reference: “second recommendation” resolves from visible/discussed context.
7. Catalog browse: “list CIS courses” stays `search_catalog` list, not discovery shortlist.
8. Scroll, loading, and error states remain usable on narrow widths.

## 12. Remaining defects (by severity)

| Severity | Issue | Evidence |
|---|---|---|
| **P1 (acceptance)** | Holdout journey pass rate below 75% | `b2-holdout` 55.6% |
| **P1 (acceptance)** | Holdout discovery use below 90% | `b2-holdout` 77.8% |
| **P2** | Post-discovery review fan-out (`get_course_reviews` loops vs `reviewTerms`) | Dev/holdout `maxToolCalls` failures; diagnostic trace |
| **P2** | Inconsistent discovery on `first_year_cs` / some holdout paraphrases | Repeated `discovery: false` in failures list |
| **P3** | Dev pass rate only marginally above 80% | 80.95% |
| **Process** | Browser acceptance unverified | §11 |
| **Process** | Baseline 3-repeat partitioned run not completed | Only 1× full baseline + diag partition (time budget; artifacts complete for 1×) |

## 13. Preregistered threshold summary

| Gate | Dev | Holdout |
|---|---|---|
| Pass rate | **Pass** (80.95%) | **Fail** (55.56%) |
| Discovery use | **Pass** (92.59%) | **Fail** (77.78%) |
| False-fit claims | **Pass** (0) | **Pass** (0) |
| Difficulty inversions | **Pass** (0) | **Pass** (0) |
| Median tool calls | **Pass** (2.0) | **Pass** (1.5) |

## 14. Recommendation for V2.3.5-B acceptance

**Verdict: CHANGES REQUIRED**

**Rationale:**

- **Deterministic / B.2 product fixes** are implemented and covered by automated tests (topic matching, compatibility semantics, compaction downgrade, prompt contract).
- **Comparison A** confirms substantial prior failure mass was mis-measured; regrading is **verified** on original artifacts.
- **Comparison B** shows dev gates **barely met** on a expanded `dev-v2` suite, with **zero aggregate false-fit** and corrected difficulty metrics — material progress on measurement-sensitive claims.
- **Holdout gates fail** on both journey pass rate and discovery use; frozen paraphrase reliability is not yet at preregistered acceptance levels.
- **Browser acceptance** remains **UNVERIFIED** (release checklist blocker unless formally waived).

**Do not merge** this branch for V2.3.5-B sign-off until holdout thresholds are met (or thresholds are formally revised in spec) and browser acceptance is executed or waived.

**Do not start V2.3.5-C** from this acceptance state.

---

Related: [Before / after metrics](./2026-10-26-assistant-v2-3-5-b2-before-after.md), [Remediation plan](../plans/2026-10-26-assistant-v2-3-5-b2-remediation.md), [Forensic analysis](../audits/2026-10-26-assistant-v2-3-5-b2-forensic-failure-analysis.md).
