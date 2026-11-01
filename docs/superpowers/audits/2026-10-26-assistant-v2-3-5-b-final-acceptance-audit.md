# What2Reg AI V2.3.5-B — Final Independent Acceptance Audit (post B.1 remediation)

- **Audit date:** 2026-10-26
- **Auditor mode:** read-only; no production code changes
- **Repository:** `/Users/thomaswu/workspace/next-web`
- **Branch:** `feat/assistant-v2-3-5-b-discovery`
- **Committed HEAD:** `2b00f306f8600ee9de74a04c75a5a5c0d914ca61` (`docs(assistant): V2.3.5-B verification report`)
- **Implementation gate (pre-remediation):** `2aef5c0`
- **Prior audit:** [`2026-10-26-assistant-v2-3-5-b-implementation-audit.md`](./2026-10-26-assistant-v2-3-5-b-implementation-audit.md) — **CHANGES REQUIRED**
- **Remediation plan:** [`../plans/2026-10-26-assistant-v2-3-5-b-remediation.md`](../plans/2026-10-26-assistant-v2-3-5-b-remediation.md)
- **Implementation self-report:** [`../verification/2026-10-26-assistant-v2-3-5-b-remediation-acceptance.md`](../verification/2026-10-26-assistant-v2-3-5-b-remediation-acceptance.md)
- **Spec / plan:** [`../specs/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md`](../specs/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md), [`../plans/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md`](../plans/2026-10-26-assistant-v2-3-5-b-intelligent-discovery.md)

---

## 1. Executive summary

B.1 remediation **materially fixes the deterministic and harness defects** called out in the first audit (strict schema, alternate-section evidence, grader, eval split, pool bounds, referents). **Independent gates confirm:** 2,323/2,323 Vitest tests, TypeScript, ESLint, and production build all pass on the **current working tree**.

**Release acceptance is not met:**

1. **Remediation is not committed.** All B.1 code and eval harness changes live in an **uncommitted working tree** (24 modified files, 7 untracked). Committed HEAD still reflects pre-remediation behavior for several critical paths (e.g. non-strict schema at `HEAD:lib/assistant/discovery/schema.ts`).
2. **Preregistered live-model thresholds fail** on fresh runs with the **repaired harness** (tool present in provider requests, successful `status: "ok"` discovery calls recorded).
3. **Full baseline (3 repeats) did not complete** (timeout); a **1-repeat** baseline run completed (§11.2) for partial workflow comparison.
4. **Authenticated browser acceptance** remains **UNVERIFIED**.

**Deterministic correctness:** largely **acceptable** as a foundation, with documented residual limits (F-10, F-14, F-15, partial F-17/F-18, extreme-shrink note trimming).

**Live product acceptance:** **failed** against preregistered metrics; orchestration still often misses discovery on required turns or exceeds `maxToolCalls`, and journey pass rates are well below targets.

### Final verdict

| Layer | Verdict |
|---|---|
| Deterministic discovery service + contract (worktree) | **Conditionally acceptable** — fixes verified in code/tests; commit + shrink stress test gap |
| Live-model preregistered gates | **CHANGES REQUIRED** — dev/holdout below thresholds |
| Baseline eval | **Partial** — 1× repeat complete; 3× repeat timed out |
| Browser | **UNVERIFIED** |
| **Overall V2.3.5-B acceptance** | **CHANGES REQUIRED** |

V2.3.5-C should **not** start on this branch until remediation is **committed**, live gates pass or thresholds are **formally revised with evidence**, baseline completes, and browser checklist is executed or explicitly waived with product sign-off.

---

## 2. Repository and commit evidence

### 2.1 State at audit time

| Item | Value |
|---|---|
| Branch | `feat/assistant-v2-3-5-b-discovery` |
| `git rev-parse HEAD` | `2b00f306f8600ee9de74a04c75a5a5c0d914ca61` |
| Working tree | **Dirty** — B.1 remediation uncommitted |
| Modified (tracked) | 24 files under `lib/assistant/discovery/`, `lib/assistant/data/discovery.ts`, `lib/assistant/discussed-courses.ts`, `evals/assistant/*`, `tests/**`, one verification doc |
| Untracked | Audit/plan/remediation docs, `discovery-eval-lib.ts`, `discovery-baseline.eval.ts`, `discovery-diagnostic.eval.ts`, `discussed-courses-discovery.test.ts` |
| Unrelated changes | None identified; diff scope aligns with remediation plan |

### 2.2 Commits on branch (since merge base `221e73b`)

Unchanged from implementation audit: 16 commits through `2b00f30`; **no additional commits** for B.1.

### 2.3 Source-of-truth note

Instructions asked for HEAD as source of truth. **HEAD alone is insufficient for B.1 claims:** remediation exists only in the working tree. This audit evaluates **worktree code** for fix correctness and records **HEAD vs worktree** where they diverge.

---

## 3. F-01 through F-18 remediation matrix

| ID | Planned | Fixed in worktree? | Correct? | Tested? | Regression risk | Residual risk | Reported resolved honestly? |
|---|---|---|---|---|---|---|---|
| **F-01** Strict constraints | Fixed | **Yes** | **Yes** — nested `.strict()`; `invalid_request` + `issues[]` via `discoverValidationIssues` | **Yes** — `discovery-schema.test.ts` (credits, must, timesToAvoid, noClassBefore) | Low | Model must learn schema; live dev run showed **0** invalid discovery payloads (strict rejects pre-call) | **Yes** |
| **F-02** Eval harness | Fixed | **Yes** | **Yes** — no hoisted discovery mock in `discovery.eval.ts`; baseline in separate file | **Yes** — `eval-discovery.test.ts`; live tool registration assertions | Low | Old `.eval-results` artifacts pre-17:45 invalid | **Yes** |
| **F-03** Alternate meetings | Fixed | **Yes** | **Yes** — `meetings: string[]`; evidence accepts arrays | **Yes** — `discovery-evidence.test.ts` multi-meeting alternate | Low | Legacy `"; "` split still supported for strings | **Yes** |
| **F-04** Alternate clashes | Fixed | **Yes** | **Yes** — `other.clashes` passed to evidence | **Yes** — fixture with `confirmed_clash` + clash array | Low | — | **Yes** |
| **F-05** Suggested-year caveat | Fixed | **Yes** | **Yes** — in `DISCOVERY_NOTES` and tool description | **Yes** — `discovery.test.ts` notes | Low | Extreme shrink can trim `notes` to 2 entries (F-07 edge) | **Yes** |
| **F-06** Soft unknown | Fixed | **Yes** | **Yes** — denominator excludes unknown; tradeoff text | **Yes** — `discovery-rank.test.ts` | Low | — | **Yes** |
| **F-07** Result compaction | Fixed | **Partial** | **Improved** — staged shrink + `compaction.truncated` / `dropped[]`; safety fields kept until late stages | **Weak** — no dedicated >12 KB shrink test found | Medium | Final stages can still drop `notes` (including caveats) under extreme size | **Mostly** — marker added; stress test gap |
| **F-08** Topic relevance | Fixed | **Yes** | **Yes** — word-boundary / token rules | **Yes** — “AI” vs unrelated substring | Low | Very short tokens still regex-boundary based | **Yes** |
| **F-09** excludeCodes | Fixed | **Yes** | **Yes** — full code regex at schema; quoted PostgREST list | **Yes** — malicious code rejected in schema tests | Low | Count semantics depend on data layer `excludedCodesMatched` | **Yes** |
| **F-10** Planner version | Deferred P3 | N/A | Unchanged | — | — | >30-section false “Timetable changed” | **Yes (deferred)** |
| **F-11** Cross-turn ordinals | Fixed | **Yes** | **Yes** — `recommendationOrderForTurn` / `activeRecommendationCourses` | **Yes** — `discussed-courses-discovery.test.ts`, integration J3 | Low | Depends on `present_response` order | **Yes** |
| **F-12** False-fit grader | Fixed | **Yes** | **Yes** — code-level key for single-section `check_plan_conflicts` | **Yes** — `eval-discovery.test.ts` | Low | — | **Yes** |
| **F-13** Perf flake | Fixed | **Yes** | **Yes** — budget-based performance test | **Yes** — full suite 2323 pass | Low | — | **Yes** |
| **F-14** runReadOnlyTool | Deferred P3 | N/A | Documented exception in `tool.ts` | — | — | Maintainability only | **Yes (deferred)** |
| **F-15** Review injection | Accepted | Partial | `[review]…[/review]` wrapping per plan | Limited | Medium | Prompt-only defense remains | **Yes (limitation)** |
| **F-16** Impossible rules | Fixed minimal | **Yes** | `notApplied` when required filters eliminate all sections | **Yes** — via discovery tests / notApplied paths | Low | Not full mutual-impossibility diagnosis | **Yes (minimal)** |
| **F-17** Catalog cap vs topics | Partial | **Yes** | Topic scan up to 600 then cap 150 | **Yes** — pool tests / data layer | Medium | Relevant course can still miss pool | **Yes (partial)** |
| **F-18** Offer row bound | Partial | **Yes** | `MAX_OFFER_ROWS = 8000` + notApplied note | **Yes** — performance fixture | Medium | Dense catalogs may omit sections | **Yes (partial)** |

---

## 4. Discovery architecture reassessment

Architecture unchanged and still appropriate: one read-only tool → batched Supabase reads → pure TS section assembly, shared conflict fit, ranking, shrink → explicit `present_response`. No planner writes, no migration. Remediation strengthened **contract enforcement**, **evidence fidelity**, **eval validity**, and **retrieval bounds** without redesign.

---

## 5. Strict schema and model compatibility

- **Executor and model** share `discoverCourseCandidatesInputSchema` in `tool.ts`.
- Unsupported fields **fail parse** (not stripped); tests cover the audit’s example mistakes.
- **Live evidence (dev audit):** 27 discovery attempts, 23 successful `ok`, **0** `invalid_request` in traces — DeepSeek currently emits schema-shaped calls on successful paths; failed required-turn cases were mostly **no discovery call** or **maxToolCalls**, not validation recovery loops.
- **Risk:** Strict schema is correct for safety; product still needs either reliable first-call shape or visible retry-after-`invalid_request` behavior — not observed in this run (zero invalid responses).

---

## 6. Deterministic scheduling correctness

- Shared `conflictsForCandidate` / `conflictFitForSection` path retained.
- Complete plan + complete meetings gating unchanged in intent.
- Alternate sections: meetings and clash reasons flow to UI evidence (verified in unit tests).
- Soft schedule preferences: unknown meetings no longer score as fully satisfied (rank tests).

---

## 7. Ranking and uncertainty verification

- Topic: word-boundary matching; “AI” does not match arbitrary substrings (`discovery-rank.test.ts`).
- Soft preferences: tradeoffs include “(could not verify)” for unknown rule outcomes.
- `examined.truncated` and pool caps documented in notes/tool text.

---

## 8. Evaluation harness validity

| Check | Result |
|---|---|
| Discovery-enabled runs register `discover_course_candidates` | **Pass** — `assertDiscoveryToolRegistration` in `discovery-eval-lib.ts`; 0 violations on all completed audit runs |
| Baseline file excludes tool | **Pass by design** — `discovery-baseline.eval.ts` mocks `createDiscoveryTools` → `[]` |
| Tool availability from request artifacts | **Pass** — inspects `trace.runs[].requests[].tools` |
| Discovery “use” metric | **Pass** — `discoverySucceeded` requires parseable `status: "ok"` |
| False-fit grader | **Pass** — code-level fit for unambiguous single-section conflict checks |
| Legacy artifacts | **Invalid** — `discovery-b-dev.json`, `discovery-b-holdout.json`, `discovery-b-baseline.json` (2026-10-26 ~12:25–12:35) lack `toolRegistrationViolations`; dev traces show **tool absent** from provider requests |

### Diagnostic artifact

- **Path:** `.eval-results/assistant/discovery-b-diagnostic.json` (2026-10-26 17:45)
- **Tool in request:** yes (`discover_course_candidates`)
- **Successful discovery:** 1 attempt, 1 success; result prefix `{"status":"ok",...}`
- **Sample args:** `scope.codePrefix GEST`, soft `preferred.startAfter`, priorities `easier`, `better_rated`
- **Note:** Case `easy_gest` turn 4 failed `maxToolCalls` and one false-fit on `GEST1005` in diagnostic summary — not a clean full-journey pass.

---

## 9. Development live-model results (fresh audit run)

**Command:**

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_LABEL=b-dev-audit npm run eval:assistant -- evals/assistant/discovery.eval.ts
```

**Artifact:** `.eval-results/assistant/discovery-b-dev-audit.json`

| Metric | Result | Threshold | Pass? |
|---|---|---:|---|
| Complete | yes (54/54 turns) | complete | yes |
| Pass rate | **0.593** (32/54) | ≥ 0.80 | **no** |
| Discovery use (required turns) | **0.733** (22/30) | ≥ 0.90 | **no** |
| False-fit claims | **4** | 0 | **no** |
| Difficulty direction | **0.667** (2/3) | 1.0 | **no** |
| No-midterm violations | 0 | 0 | yes |
| Median discovery-turn tool calls | **1** | ≤ 2 | yes |
| Tool registration violations | 0 | 0 | yes |
| Discovery attempts / successes | 27 / 23 | — | — |
| Steps used / budget | 136 / 200 | within budget | yes |

**Qualitative:** Model often places anchors in `scope`, hard rules in `required`, and soft prefs in `preferred`. Common failures: `discovery: false` on required turns, `maxToolCalls` exceeded (catalog fallback loops), occasional false-fit despite grader fixes.

---

## 10. Holdout live-model results (fresh audit run)

**Command:**

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_SUITE=holdout ASSISTANT_EVAL_LABEL=b-holdout-audit-full npm run eval:assistant -- evals/assistant/discovery.eval.ts
```

**Artifact:** `.eval-results/assistant/discovery-b-holdout-audit-full.json`

| Metric | Result | Threshold | Pass? |
|---|---|---:|---|
| Complete | yes (18/18) | complete | yes |
| Pass rate | **0.222** (4/18) | ≥ 0.75 | **no** |
| Discovery use | **0.50** (9/18) | ≥ 0.90 | **no** |
| False-fit claims | 1 | 0 | **no** |
| Difficulty direction | 0.333 (1/3) | 1.0 | **no** |
| No-midterm violations | 0 | 0 | yes |
| Median tool calls | 1 | ≤ 2 | yes |
| Tool registration violations | 0 | 0 | yes |
| Discovery attempts / successes | 11 / 11 | — | — |

Holdout is **stricter** and shows **weaker orchestration** (half of required turns never achieve successful discovery).

---

## 11. Baseline comparison

### 11.1 Full baseline (3 repeats) — incomplete

**Command:**

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_LABEL=b-baseline-audit npm run eval:assistant -- evals/assistant/discovery-baseline.eval.ts
```

**Result:** **Not completed.** Vitest **30 min** test timeout and **Model request timed out** after ~55 minutes. **No** `discovery-b-baseline-audit.json`.

### 11.2 Baseline (1 repeat) — completed audit run

**Command:**

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_REPEATS=1 ASSISTANT_EVAL_LABEL=b-baseline-audit-r1 npm run eval:assistant -- evals/assistant/discovery-baseline.eval.ts
```

**Artifact:** `.eval-results/assistant/discovery-b-baseline-audit-r1.json`

| Metric | Baseline (no tool) | Discovery dev audit (3 repeats) |
|---|---:|---:|
| Complete | yes (18/18 turns) | yes (54/54) |
| Pass rate | **0.389** (7/18) | **0.593** (32/54) |
| Successful discovery use | **0** (0/10 required-turn slots) | **0.733** (22/30) |
| False-fit claims | **0** | **4** |
| Median non-present tool calls | **13.5** | **1** |
| Tool registration violations | **0** (tool absent as intended) | **0** (tool present) |
| Discovery attempts / successes | 2 / 0 | 27 / 23 |
| Steps used | (see artifact) | 136 / 200 |

**Methodological note:** Dev and baseline share the same case definitions, including turns graded with `discovery: "required"`. On baseline runs those checks **always fail** because `createDiscoveryTools` is mocked to `[]`. Baseline **pass rate is not directly comparable** to discovery-enabled pass rate; use **tool-call volume**, **false-fit**, and **qualitative traces** for workflow comparison. For apples-to-apples journey pass, a separate baseline grader mode would be needed (not in scope of this audit).

**Legacy baseline** (`discovery-b-baseline.json`, pre-harness-fix): invalid — hoisted mock / missing tool-registration fields.

### 11.3 Interpretation

With discovery enabled, the model completes required discovery turns more often and uses **far fewer** catalog-style tool calls per discovery turn (median **1** vs **13.5**). Baseline shows **zero** false-fit grader hits in this run; discovery-enabled dev still had **4** false-fit claims — product safety metric favors baseline on this slice, while efficiency and discovery coverage favor the tool when the model invokes it successfully.

---

## 12. Student-journey assessment

| Journey | Evidence | Assessment |
|---|---|---|
| **A** Easy GEST + time prefs | Live `easy_gest` in dev/diagnostic; integration J1 | Deterministic path works when discovery succeeds; live multi-turn often fails maxToolCalls / false-fit |
| **B** GE history topic | Live args show topic scopes; fixture journeys | Topic scope used; holdout history case failed pass checks |
| **C** Timetable change | Integration **J2** | Stale badge + re-check **pass** (scripted) |
| **D** Second recommendation | Integration **J3**; `discussed-courses-discovery.test.ts` | Ordinal without `get_course` **pass** in tests |
| **E** Conflicting prefs | `preference_conflict` case | Live difficulty direction **failed** in dev audit |
| **F** No midterm | `no_midterm` / holdout | **No** unsupported midterm certainty violations in metrics; mention/forbidden checks still fail some turns |
| **G** Credits | `fill_credits` | Live failures on tool budget / discovery |
| **H** No match | `no_candidates` | Model often over-calls tools; mention patterns fail |

Scripted CopilotKit integration (5 tests) **passes**; that is **not** a substitute for live student acceptance.

---

## 13. Authenticated browser results

**Status: UNVERIFIED**

No signed-in Clerk session was used at 380 / 450 / 800 px. jsdom integration tests cover logic only.

### Manual checklist (required before PASS)

1. Natural-language discovery triggers `discover_course_candidates` (not catalog flood).
2. Shortlist renders with full multi-meeting section lines.
3. Verified-fit badges match planner evidence; confirmed clashes show real reasons.
4. Planner edit invalidates stale badges.
5. “Second one” resolves to visible shortlist order.
6. Agent Activity stays compact; streaming/cancel/scroll stable.
7. Tool errors surfaced honestly.

---

## 14. Performance and regression results

| Gate | Result |
|---|---|
| Focused discovery + referent tests | **PASS** (78 tests in focused run) |
| Conflict verification | **PASS** |
| Discovery performance smoke | **PASS** (budget-based) |
| V2.3.5-B integration (5 journeys) | **PASS** |
| Full Vitest | **PASS** — 279 files, **2323** tests |
| `npx tsc --noEmit` | **PASS** |
| `npm run lint` | **PASS** |
| `npm run build` | **PASS** |

**Bounds (worktree):** `MAX_POOL_COURSES=150`, `MAX_CATALOG_TOPIC_SCAN=600`, `MAX_OFFER_ROWS=8000`, `MAX_DISCOVERY_RESULT_CHARS=12_000`, batched reads unchanged in spirit.

---

## 15. Remaining defects and severity

| Severity | Item |
|---|---|
| **P0 release** | Uncommitted remediation; live dev/holdout below preregistered thresholds |
| **P1 product** | Required-turn discovery adoption 73% (dev) / 50% (holdout); false-fit claims still non-zero |
| **P2** | Baseline eval incomplete; no A/B cost/latency comparison |
| **P2** | F-07: no automated oversized-result shrink test; extreme path may trim safety notes |
| **P3** | F-10, F-14, F-15, partial F-17/F-18 as documented |

---

## 16. Release blockers

1. **Commit and review** B.1 remediation as a coherent changeset.
2. **Live gates:** dev pass ≥ 0.80, holdout ≥ 0.75, discovery use ≥ 0.90, false-fit = 0, difficulty direction = 0 errors (or formal threshold revision with evidence — not done here).
3. **Complete full baseline eval** (3 repeats, same budget as dev) or document 1-repeat baseline as the authorized comparison; full 3× run still timed out in this audit.
4. **Browser acceptance** or documented product waiver.

---

## 17. V2.3.5-C readiness

The **deterministic discovery engine** on the worktree is a **credible base** for C **after commit**. **Student-facing reliability** is **not** proven: live orchestration and journey pass rates remain below bar, and browser proof is missing. **Do not** treat V2.3.5-B as stable foundation for C until acceptance gaps close.

---

## 18. Final acceptance verdict

### CHANGES REQUIRED

**Rationale:** B.1 fixes are **real and largely verified** in code and unit/integration tests, and the **eval harness is now trustworthy**. However, **remediation is not on HEAD**, **preregistered live-model acceptance fails** on independently rerun dev and holdout suites, **baseline comparison was not completed**, and **browser acceptance is unverified**. Deterministic correctness and product acceptance **must be reported separately** — the former is approaching ready; the latter is **not**.

---

## Appendix: artifact index

| Label | Path | Valid harness? | Notes |
|---|---|---|---|
| b-diagnostic | `.eval-results/assistant/discovery-b-diagnostic.json` | Yes | 1 successful discovery |
| b-dev-audit | `.eval-results/assistant/discovery-b-dev-audit.json` | Yes | Full dev, thresholds fail |
| b-holdout-audit-full | `.eval-results/assistant/discovery-b-holdout-audit-full.json` | Yes | Full holdout, thresholds fail |
| b-dev (legacy) | `.eval-results/assistant/discovery-b-dev.json` | **No** | Tool not in requests |
| b-holdout (legacy) | `.eval-results/assistant/discovery-b-holdout.json` | **No** | 0% discovery with tool absent |
| b-baseline (legacy) | `.eval-results/assistant/discovery-b-baseline.json` | **No** | Incomplete; pre-fix |
| b-baseline-audit | — | — | 3× repeat run timed out; no file |
| b-baseline-audit-r1 | `.eval-results/assistant/discovery-b-baseline-audit-r1.json` | Yes | 1× repeat; tool absent; see §11.2 |
