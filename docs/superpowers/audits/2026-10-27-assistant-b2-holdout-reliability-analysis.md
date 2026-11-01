# V2.3.5-B.2 — Holdout Reliability Forensic Analysis

**Date:** 2026-10-27  
**Mode:** read-only investigation (no product, grader, or prompt changes)  
**Canonical worktree:** `/Users/thomaswu/workspace/next-web/.worktrees/assistant-v2-3-5-b2`  
**Branch / HEAD:** `feat/assistant-v2-3-5-b2-remediation` @ `2e26643`  
**Primary artifacts:** `.eval-results/assistant/discovery-b2-holdout.json`, `discovery-b2-diagnostic.json`, `discovery-b2-dev.json`  
**Rubric / case set:** `b2-v2`, holdout `holdout-v1` (`evals/assistant/discovery-holdout-cases.ts`)  
**Prompt fingerprint (live runs):** `1d0be6222930`

Trace references use `discovery-b2-<suite>.json#<caseId>/r<repeat>/t<turn>` (turn 0 = first student message in the case).

---

## Executive summary

Phase C live holdout (`discovery-b2-holdout.json`) **passed 10/18 turns (55.56%)** and **discovery use 14/18 (77.78%)**, both below preregistered gates (≥75% pass, ≥90% discovery use). **Zero aggregate false-fit claims** on the full holdout and dev suites under `b2-v2`.

Compared to regraded v1 traces on the same six holdout identities (Comparison A: 27.8% pass, 61.1% discovery use), B.2 **materially improved** Macao/heritage GE (`holdout-history_ge` **3/3 pass**, discovery + topic retrieval), Traditional Chinese constraints (`holdout-constraints_zh` **3/3**), and credit-fill Chinese (`holdout-fill_credits_zh` **2/3**). Remaining holdout mass concentrates in three **generalizable** gaps:

1. **Systematic tool-selection (4/18 turns):** `holdout-first_year_cs` **never** calls `discover_course_candidates` (3/3 repeats); one stochastic over-clarification on `holdout-fill_credits_zh` (r2 only).
2. **Post-discovery review fan-out (4/18 turns):** discovery succeeds with correct `reviewTerms`, fixture returns empty review text, model still loops `get_course_reviews` (± `count_reviews`), breaching per-case `maxToolCalls` while often delivering a good final answer.
3. **Diagnostic-only false-fit flags (2 turns):** not reproduced on holdout/dev aggregates; one is **grader false positive** (plan code in a compound clash sentence); one is **section-qualified fit phrasing** (`GEST1006 §002` vs grader’s `CODE-SECTION` convention) with **supported** `check_plan_conflicts` evidence for §002.

**No change** to frozen holdout questions or acceptance thresholds is warranted. **Do not** merge B.2 for sign-off until holdout gates pass and browser acceptance runs (or is formally waived).

---

## Evaluation denominators (Comparison B, holdout)

| Quantity | Value | Source |
|---|---:|---|
| Holdout cases | 6 | `discovery-holdout-cases.ts` |
| Repeats | 3 | `discovery-b2-holdout.json` → `repeats: 3` |
| Graded turns | **18** | `summary.turns` |
| Passed turns | **10** | `summary.passed` |
| Failed turns | **8** | §2 |
| Discovery required | **18/18** | each case turn `expect.discovery: "required"` |
| Discovery use (succeeded + args OK) | **14/18 (77.78%)** | `summary.discoveryUse` |
| Discovery not called | **4** | `summary.discoverySelection.notCalled` |
| False-fit claims (aggregate) | **0** | `summary.falseFitClaims` |
| Median non-`present_response` tool calls | **1.5** | `summary.medianToolCalls` (gate pass) |

Dev suite (`discovery-b2-dev.json`): **63 turns**, pass **80.95%**, discovery use **92.59%**, false-fit **0**, median tool calls **2.0** (at ceiling).

Diagnostic (`discovery-b2-diagnostic.json`): **5 turns** on `easy_gest`, pass **2/5**, aggregate false-fit **2** (isolated to this smoke multi-turn trace).

---

## 2. Eight failed holdout turns (verified on current traces)

### Summary matrix

| Trace | Pass | Primary failed check | Root cause class |
|---|---|---|---|
| `#holdout-first_year_cs/r0/t0` | No | `discovery` | Product: catalog vs discovery (systematic) |
| `#holdout-first_year_cs/r1/t0` | No | `discovery` | Product: catalog vs discovery (systematic) |
| `#holdout-first_year_cs/r2/t0` | No | `discovery` | Product: catalog vs discovery (systematic) |
| `#holdout-fill_credits_zh/r2/t0` | No | `discovery` | Product: over-clarification (stochastic) |
| `#holdout-easy_ge/r1/t0` | No | `maxToolCalls` | Product: review fan-out |
| `#holdout-easy_ge/r2/t0` | No | `maxToolCalls` | Product: review fan-out (+ `present_response`) |
| `#holdout-no_midterm/r0/t0` | No | `maxToolCalls` | Product: review fan-out |
| `#holdout-no_midterm/r2/t0` | No | `maxToolCalls` | Product: review fan-out + extra `count_reviews` |

All eight produced a **final natural-language answer** (no timeout, `runCapHit: false`). None failed `falseFitClaims`, `forbid`, or `mention` on the current artifact.

---

### 2.1 `discovery-b2-holdout.json#holdout-first_year_cs/r0/t0`

1. **Student request / state:** Single turn: *"I'm a year-one student—what CIS intro courses are offered?"* Default timetable fixture, no saved plan (`DEFAULT_DISCOVERY_TIMETABLE`).
2. **Expected (rubric):** `discover_course_candidates` with discovery args satisfying case predicate (personalized discovery for year/department intent); mention CISC/CIS/year; ≤3 non-presentation tool calls.
3. **Tool choices:** `search_catalog` (department CIS, `suggestedYear: 1`, offered) → `search_catalog` (query CIS, code_title).
4. **Arguments:** See trace `toolCalls[0].args`, `toolCalls[1].args` — catalog filters mirror student wording exactly.
5. **Tool results:** Both calls return the same **3** offered CISC1001–1003 rows (`totalCount: 3`); success.
6. **Retrieval relevance:** Catalog result is **factually relevant** but is a **flat list**, not ranked discovery with signals/tradeoffs.
7. **Hard constraints:** N/A (no schedule rules in request).
8. **Final answer:** Yes — lists three CIS year-1 offered courses, notes Data Structures may not be a true intro, offers follow-up on ratings/timetable.
9. **Failure reason:** `discovery: false`, `discoveryBucket: notCalled`, `toolChoice: search_catalog`. Rubric requires discovery; model treated intent as **catalog browse**.
10. **Defect type:** **Product defect** (tool-selection contract), not grading defect. **Systematic** (same on r1, r2).

---

### 2.2 `discovery-b2-holdout.json#holdout-first_year_cs/r1/t0`

Same student message and expectation as §2.1.

3. **Tool choices:** `search_catalog` (department CIS, year 1) → `present_response` (`catalog.mode: browse`).
4. **Results:** Catalog success; presentation receipt `catalog.eligibility: missing_search` (no matching browse `resultSetId` in turn — presentation metadata issue secondary to wrong tool).
5. **Final answer:** Yes — same three courses in prose.
9. **Failure reason:** `discovery: false`, `notCalled`.
10. **Product defect**, **systematic**.

---

### 2.3 `discovery-b2-holdout.json#holdout-first_year_cs/r2/t0`

Same message and expectation.

3. **Tool choices:** Two `search_catalog` variants (department + query/year) → `present_response` (browse).
9. **Failure reason:** `discovery: false`.
10. **Product defect**, **systematic**. **100% failure rate** on this holdout identity under B.2 live runs.

---

### 2.4 `discovery-b2-holdout.json#holdout-fill_credits_zh/r2/t0`

1. **Request:** *"我还差学分，有没有三门学分的课可以推荐？"* (credit gap + recommend 3-credit courses).
2. **Expected:** Discovery with credit-target recommendation; mention 学分/3/credit; ≤3 tool calls.
3. **Tool choices:** **None** (`toolCalls: []`).
4. **Arguments / results:** N/A.
6. **Retrieval:** N/A.
7. **Constraints:** Student did not name department; rubric still expects acting on **credit + recommend** (plan D1).
8. **Final answer:** Yes — clarifying questions (how many credits, subject preference, offers to search “好拿分/评价好、3 学分” if student confirms).
9. **Failure reason:** `discovery: false`, `toolChoice: none`, `discoveryBucket: notCalled`.
10. **Product defect** (over-clarification vs “one constraint is enough to act”). **Stochastic:** r0 and r1 **passed** with discovery (see §2 note below).

**Contrast (same case, passing repeats):**

- `#holdout-fill_credits_zh/r0/t0`: two discovery calls (`scope.credits: 3`, GE then Non-GE) — acted without department.
- `#holdout-fill_credits_zh/r1/t0`: one discovery (`credits: 3`, `maxSuggestedYear: 4`) — acted with no plan.

---

### 2.5 `discovery-b2-holdout.json#holdout-easy_ge/r1/t0`

1. **Request:** *"Any chill GEST classes that aren't early mornings?"*
2. **Expected:** Discovery with `codePrefix: GEST` (gestScope); ≤3 tool calls.
3. **Tools:** `discover_course_candidates` → 3× `get_course_reviews`.
4. **Discovery args:** `scope.codePrefix: GEST`, `required.startAfter: 11:00`, priorities easier/grades/ratings, `reviewTerms: ["workload","easy","chill"]` — **args OK**.
5. **Discovery result:** 6 candidates; every `reviewEvidence.read: 0`, empty excerpts (fixture has no review bodies).
6. **Review calls:** Redundant — same empty pages as discovery already implied.
7. **Constraints:** `startAfter: 11:00` applied; no plan → fit `not_checked` (acceptable).
8. **Final answer:** Yes — ranked GEST table, difficulty scale stated, admits empty reviews.
9. **Failure:** `maxToolCalls: false` (4 > 3). Discovery check **passes**.
10. **Product defect** (enrichment fan-out). **Stochastic** vs r0 (passed with 3 calls: discover + 2 reviews).

---

### 2.6 `discovery-b2-holdout.json#holdout-easy_ge/r2/t0`

Same message and expectation (gestScope; ≤3 calls).

3. **Tools:** discover → 3× `get_course_reviews` → `present_response` (recommendations) = **4** counted calls.
5. **Discovery:** `startAfter: 10:00`, `reviewTerms` present; candidates relevant.
8. **Final answer:** Yes — “chill” interpreted via schedule + ratings; caveats on empty reviews.
9. **`maxToolCalls` only** (4 > 3).
10. **Product defect** (fan-out + optional presentation in same turn). **Stochastic** (r0 passed).

---

### 2.7 `discovery-b2-holdout.json#holdout-no_midterm/r0/t0`

1. **Request:** *"I'd rather skip courses with midterms—any easy GEST picks?"*
2. **Expected:** GEST discovery, mention midterm/review, forbid definitive “no midterm” claims; ≤4 tool calls.
3. **Tools:** discover (`reviewTerms: midterm, easy, workload`) → 4× `get_course_reviews`.
4. **Discovery:** Correct scope; `reviewEvidence` empty per candidate.
5. **Reviews:** All return `"reviews":[]`.
7. **Midterm constraint:** Reply **correctly** refuses to certify midterm-free; cites missing official + empty review text (`forbid` pass).
8. **Final answer:** Yes — strong epistemic hygiene on midterms.
9. **Failure:** `maxToolCalls: false` (5 > 4).
10. **Product defect** (fan-out). **Stochastic** (r1 passed with exactly 4 calls).

---

### 2.8 `discovery-b2-holdout.json#holdout-no_midterm/r2/t0`

Same message and expectation.

3. **Tools:** discover → 4× `get_course_reviews` → 2× `count_reviews` → `present_response` = **7** calls.
9. **`maxToolCalls: false` (7 > 4)**.
10. **Product defect** (fan-out escalated to count_reviews). Reply quality remains acceptable on midterm honesty.

---

### Holdout identities that **pass** on current artifact (verification)

| Case | Pass rate | Notes |
|---|---:|---|
| `holdout-history_ge` | **3/3** | Discovery with `topics` (Macau/heritage); **no** catalog flailing (contrast v1 forensic R8). B.2 topic tier fix **verified live**. |
| `holdout-constraints_zh` | **3/3** | Discovery `courseType: GE`, schedule rules + `noClash: true`; single call each repeat. |
| `holdout-fill_credits_zh` | **2/3** | r2 failure only (§2.4). |
| `holdout-easy_ge` | **1/3** | r0 pass; r1/r2 fan-out (§2.5–2.6). |
| `holdout-no_midterm` | **1/3** | r1 pass; r0/r2 fan-out. |

---

## 3. Diagnostic false-fit investigations (correctness-critical)

Artifact: `discovery-b2-diagnostic.json` (`easy_gest`, 5-turn journey). Aggregate **`falseFitClaims: 2`** on turns 3 and 4 only. Full dev/holdout B runs: **0**.

### 3.1 Flag A — `discovery-b2-diagnostic.json#easy_gest/r0/t3` → `GEST1006`

**Quoted claim (excerpt):** *"So of the options discussed, only GEST1006 §002 is confirmed conflict-free"* (also §002 bullet: *"clear. No clash with your plan."*).

**Course/section:** GEST1006 **§002** (Tue/Thu 11:30–12:45); §001 clashes with plan.

**Deterministic evidence:** `check_plan_conflicts` for GEST1006 / WONG SIU MING returned `status: checked`, `planComplete: true`, `sectionListComplete: true`, `plannerVersion: ee590414`:

- §001 → `confirmed_clash` vs GEGA1000-007  
- §002 → `verified_no_clash`

Three other courses returned `temporarily_unavailable` (not negative fit).

**Planner snapshot:** Matches fixture plan; evidence complete for GEST1006 listing.

**Claim scope:** Intended **section-specific** (§002 only); model also states §001 clashes.

**Grader verdict:** Flags **`GEST1006`** because compatibility idiom is tied to course code **without** `-002` suffix (`tests/assistant/eval-discovery.test.ts` expects `GEST1006-002` form for section-level claims).

**Classification:** **Inconclusive / contract mismatch**, not an unsupported compatibility assertion. Evidence **supports** §002. **Not a release blocker** for fit correctness; optional prompt nudge to use `CODE-SECTION` in fit prose aligns model with grader and UI badges.

**Secondary failure on same turn:** `maxToolCalls` (4× `check_plan_conflicts`) driven by unavailable checks — **product/runtime reliability** for parallel conflict reads, not false-fit.

---

### 3.2 Flag B — `discovery-b2-diagnostic.json#easy_gest/r0/t4` → `GEGA1000`

**Quoted claim (excerpt):** Single bullet combining clash + clearance: *"§001 Mon & Thu 13:30–14:45 **clashes** with GEGA1000-007; §002 Tue & Thu 11:30–12:45 is **verified conflict-free**"*.

**Course/section:** GEGA1000 referenced as **saved-plan entry** GEGA1000-007; positive idiom applies to **GEST1006 §002**.

**Evidence:** Turn 3 trace holds GEST1006 §002 `verified_no_clash`; no claim that GEGA1000 “fits”.

**Grader behavior:** Sentence splitter does not break on `;`. `claimSubjects` attributes codes appearing **before** the idiom in the same sentence; GEGA1000-007 is treated as subject of “verified conflict-free”.

**Classification:** **Confirmed grader false positive** (same failure class as pre-B.2 `holdout-constraints_zh` CJK/parenthetical issues, now on **semicolon-compound English**). **Not a product false-fit release blocker.**

**Recommendation:** Fix grader (semicolon boundary or clash-polarity handling) **without** weakening unsupported-claim detection; add regression in `eval-discovery.test.ts`.

---

## 4. Tool-selection failures (required discovery, not called)

Holdout + dev (`discovery-b2-*.json`), `discoveryBucket: notCalled` when required:

| Trace | Model behavior | Misread intent? |
|---|---|---|
| `#holdout-first_year_cs/r0–r2/t0` | `search_catalog` (+ browse present) | No — intent is “what can I take”; contract says browse |
| `#holdout-fill_credits_zh/r2/t0` | Clarification only | Partially — “推荐” + 3 credits is actionable (r0/r1 prove) |
| `#discovery-b2-dev.json` `first_year_cs/r0,r1` | `search_catalog` | Same systematic class as holdout |

**Not observed on current holdout:** `holdout-history_ge` catalog loops (v1 failure mode) — **fixed**.

**Semantic distinction preserved:** Cases like dev `catalog_browse` (not in holdout) should remain `search_catalog`; first-year **offered intro** phrasing is **recommendation/discovery**, not pure listing.

---

## 5. Post-discovery review fan-out

**Pattern:** After successful discovery with `reviewTerms`, candidates show `reviewEvidence.read: 0` and empty excerpts (fixture empty review bodies). Model often issues **N parallel `get_course_reviews`** for top-N candidates; midterm turns sometimes add **`count_reviews`**.

| Suite | Turns with discover + ≥2 `get_course_reviews` |
|---|---:|
| Holdout | 6 |
| Dev | 8 |
| Diagnostic t0 | 1 |

**`reviewTerms` supplied?** Yes on all holdout fan-out failures listed in §2.5–2.8.

**Adequate discovery evidence?** Structurally yes — explicitly records zero readable review text for terms; model treats as “need more detail.”

**Student asked for deep reviews?** Holdout easy_ge: chill/workload — aggregate ratings often sufficient. No_midterm: student asked midterm preference — discovery already searched terms; empty corpus should end loop.

**Justified enrichment?** **No** when discovery `reviewEvidence` already reports read count and empty mentions; redundant calls add latency and fail `maxToolCalls`.

**Fix locus (priority):**

1. **Discovery result content / notes** — explicit “do not call `get_course_reviews` for the same instructors when `reviewEvidence.read` is 0” (`lib/assistant/discovery/discover.ts` notes or candidate-level flag).
2. **`get_course_reviews` description** — defer to discovery `reviewTerms` when discovery ran in-turn (`lib/assistant/tools.ts`).
3. **Prompt** — one short line only if schema/note insufficient (`lib/assistant/prompt.ts`, budget ≤15k).
4. **Not recommended:** hard tool-call cap in runtime (no evidence of step-budget exhaustion; `runCapHit: false` everywhere on holdout).

---

## 6. Grader correctness (`b2-v2` integrity)

Verified on artifacts and code (`evals/assistant/discovery-grade.ts`, `discovery-case-sets.ts`):

| Check | Status |
|---|---|
| `holdout-v1` vs `dev-v2` identifiable in artifact `caseSetId` | Yes |
| Discovery use vs args vs selection buckets | Distinct in `summary` |
| Difficulty inversion vs omission | `difficultyDirection.inverted` empty on holdout/dev |
| Fit grading uses planner version + compaction flags | Yes in `newestFitsFromTrace` |
| Tool counts exclude `present_response` | Consistent with median 1.5 holdout |
| Timeouts / partial runs | `complete: true`, `timedOutTurns: []` on holdout |

**New grader defect (reproduction):** `#easy_gest/r0/t4` — plan code in same sentence as positive fit idiom on a **different** course → false `GEGA1000` flag. Repro: grade reply string in §3.2 with empty tool calls.

**Do not** relax frozen holdout thresholds or cases.

---

## 7. Prioritized minimal remediation

| Root cause | Affected turns (B holdout) | Student impact | Proposed fix | Files | Regression test | Risk |
|---|---|---|---|---|---|---|
| Catalog vs discovery for year/dept **recommendation** phrasing | `first_year_cs` ×3 (+ dev `first_year_cs` ×2) | Student gets flat catalog, not ranked discovery / signals | Sharpen **objective** boundary in tool descriptions + one prompt bullet: “which courses for my year/major” → discovery; “list all X” → catalog | `lib/assistant/tools.ts` (`search_catalog`), `lib/assistant/discovery/tool.ts`, `lib/assistant/prompt.ts` (≤15k) | Extend `discovery-contract.test.ts`; add **new** paraphrase eval case (not holdout text) | Low — wording only |
| Over-clarification on credit-only recommend (ZH) | `fill_credits_zh` r2 (1/18) | Extra turn before any candidates | Emphasize in discovery tool: credit target + 推荐 = act with `scope.credits` | `lib/assistant/discovery/tool.ts` | New ZH paraphrase case in dev-only set | Low |
| Review fan-out after empty `reviewEvidence` | `easy_ge` r1,r2; `no_midterm` r0,r2 (+ dev/diagnostic) | Slow turns; eval failures; wasted API | Discovery note/flag when review read=0; tighten `get_course_reviews` description | `discover.ts`, `tools.ts`, optional `prompt.ts` | Unit test on discovery JSON note; eval expects ≤N calls on fixture | Low |
| Semicolon sentence false-fit | Diagnostic t4 only (holdout/dev 0) | Misleading eval signal | Split sentences on `;`; or ignore reference codes after “clashes with” | `evals/assistant/discovery-grade.ts` | `eval-discovery.test.ts` case from §3.2 | Low |
| Section notation in fit prose (`§002` vs `CODE-SECTION`) | Diagnostic t3 | Rare badge/grading mismatch | Prompt: use `GEST1006-002` for section fit claims | `lib/assistant/prompt.ts` | Existing grader test `GEST1006-002` | Low |
| Conflict check `temporarily_unavailable` fan-out | Diagnostic t3 | Student told checks “failed” | Separate reliability track (retries/backoff) — **out of scope** for smallest holdout fix | — | — | Medium |

### Changes **not** warranted

- Keyword-based tool router or phrase gating  
- Forcing discovery on factual catalog-only requests  
- Lengthening system prompt materially or exceeding 15k budget  
- Replacing DeepSeek without evidence  
- Redesigning deterministic discovery ranking/SQL  
- Raising `ASSISTANT_MAX_STEPS` / live step budget  
- Modifying frozen `holdout-v1` messages or lowering ≥75%/≥90% gates  
- Weakening false-fit grader to clear diagnostic flags  

---

## 8. Verification protocol (post-fix)

1. **Targeted deterministic regressions:** `npx vitest run tests/assistant/discovery-contract.test.ts tests/assistant/eval-discovery.test.ts tests/assistant/discovery-topic-match.test.ts` (+ any new paraphrase case tests).
2. **New paraphrase cases:** Author 4–6 holdout-**analog** prompts in a **new** case file (e.g. `discovery-paraphrase-cases.ts`), never copied from frozen holdout strings; run in dev only until stable.
3. **One inexpensive live diagnostic:** `ASSISTANT_EVAL_SUITE=diagnostic` — confirm tool registration, zero false-fit on midturn smoke, median calls ≤ prior.
4. **Full development evaluation:** `b2-dev` 3× — must stay ≥80% pass, ≥90% discovery use.
5. **One final frozen holdout evaluation:** original `holdout-v1` 3× under unchanged protocol — release gate.
6. **Unsupported compatibility claims:** Manual or grader spot-check on fit turns (especially multi-section GEST) independent of pass rate.
7. **Authenticated browser acceptance:** 380 / 450 / 800 px checklist from acceptance report §11.

### Shadow holdout for generalization confidence

- Create **`holdout-v2-shadow`**: six **new** journeys, independently authored, structurally mirroring holdout **intent classes** (easy GEST, heritage GE, year-one dept, ZH constraints, midterm preference, ZH credits) with **different wording**.
- **Freeze** prompts before first live run; store in git; run **once** after holdout-v1 passes.
- **Do not substitute** shadow for `holdout-v1` release gate — document shadow as **secondary** generalization evidence only (methodology: pre-registered shadow set + single blind run).

---

## 9. Current release blockers

| ID | Blocker | Evidence |
|---|---|---|
| RB-1 | Holdout pass rate **55.56%** < 75% | `discovery-b2-holdout.json` |
| RB-2 | Holdout discovery use **77.78%** < 90% | 4× `notCalled` (3× first_year_cs + 1× fill_credits_zh r2) |
| RB-3 | Browser acceptance **UNVERIFIED** | Phase C acceptance §11 |
| — | **Not** RB | Diagnostic false-fit flags (§3) — grader/phrasing, not unsupported fit on holdout/dev |
| — | **Not** RB | `temporarily_unavailable` conflict checks — quality/reliability follow-up |

---

## 10. Top three code/contract changes for real student experience

1. **Clarify catalog browse vs personalized discovery for year/department “what should I take” requests**  
   **Evidence:** `holdout-first_year_cs` **0/3** discovery on identical paraphrase; catalog returns correct but non-personalized 3-row list; dev `first_year_cs` same pattern. Fixing precedence addresses **22%** of holdout discovery-use gap in one generalizable rule.

2. **Stop redundant `get_course_reviews` when discovery already ran `reviewTerms` and reported zero readable text**  
   **Evidence:** 4/8 holdout failures are **`maxToolCalls` only** with good answers; holdout `easy_ge` r0 passes with 3 calls while r1/r2 fail at 4; discovery JSON shows `reviewEvidence.read: 0` before fan-out. Reduces latency and failed journeys without blocking midterm honesty (r0/r1 no_midterm replies already disclaim certainty).

3. **Act on credit-target recommendations without a department pre-question (ZH/EN)**  
   **Evidence:** `holdout-fill_credits_zh` **2/3** success with broad `scope.credits`; **1/3** zero-tool clarification repeat. Same contract line as discovery tool’s “one constraint is enough” — closes stochastic discovery-use miss and matches student “推荐三门学分” intent.

---

**Related:** [Phase C acceptance](../verification/2026-10-26-assistant-v2-3-5-b2-acceptance.md), [Before/after](../verification/2026-10-26-assistant-v2-3-5-b2-before-after.md), [B.2 forensic (pre-fix)](../audits/2026-10-26-assistant-v2-3-5-b2-forensic-failure-analysis.md), [Remediation plan](../plans/2026-10-26-assistant-v2-3-5-b2-remediation.md).
