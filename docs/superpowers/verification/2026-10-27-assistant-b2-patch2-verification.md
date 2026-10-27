# B.2 reliability patch 2 — implementation, protocol, and semantic verification

Date: 2026-10-27
Branch: `feat/assistant-v2-3-5-b2-remediation`
Worktree: `.worktrees/assistant-v2-3-5-b2`
Patch range: `2e26643..HEAD`
Rubric: `b2-v2` for the frozen protocol; proposed `b2-semantic-v1` for product acceptance
Frozen release gate: `holdout-v1` (questions, cases, thresholds unchanged)
Shadow sets: `shadow-v1` (secondary replication), `shadow-v2` (frozen before its first run)

This note reports four things separately:

1. what the patch changed;
2. the historical protocol result, unchanged;
3. the fresh protocol result under the frozen cases and thresholds;
4. semantic product correctness under the proposed `b2-semantic-v1` rubric.

A protocol failure caused by the year-one CIS listing ambiguity is not
re-labelled as a pass.

## 1. What shipped in this patch

| Commit | Change | Evidence |
|---|---|---|
| `179d2dc` | A credit target is actionable on its own: the prompt now says to use discovery in that turn instead of asking for a major/GE/elective direction first. | Three new dev cases (`credit_only_en`, `credit_only_zh_hans`, `credit_only_zh_hant`) pass 9/9 with `credits: 3`. |
| `179d2dc` | Discovery marks an all-unreadable review search in `notApplied`; the review evidence note says not to call `get_course_reviews` for any candidate in that result; the prompt says not to retry review reads discovery already reported unreadable. | `no_midterm` holdout 3/3 now uses one discovery call; dev `no_midterm`/`preference_conflict` no longer fan out per-course review calls. |
| `313e2ee` | Adds independently written, frozen `shadow-v2` (8 turns) and a separate suite entry. | First run is reported in §6; no case was edited after the run. |
| prior `22ae76d..607c199` | Review-evidence status/coverage, credit scope anchor, grader section/clause attribution, frozen `shadow-v1`. | Preserved; see the earlier [final verification](2026-10-27-assistant-b2-patch-final-verification.md). |

Product code touched in this patch: `lib/assistant/prompt.ts`,
`lib/assistant/discovery/tool.ts`, `lib/assistant/discovery/discover.ts`.
Evaluation assets touched: `evals/assistant/discovery-cases.ts`,
`discovery-shadow2-cases.ts`, `discovery-shadow2.eval.ts`,
`discovery-case-sets.ts`, `discovery-eval-lib.ts`, `evals/assistant/README.md`.

Not changed: model, agent loop, step budget, runtime tool-call limits,
discovery ranking/SQL, frozen holdout questions, preregistered thresholds,
historical artifacts.

## 2. Static gates

Final run on the patch HEAD:

| Gate | Command | Result |
|---|---|---|
| Focused discovery/eval | `npx vitest run tests/assistant/discovery*.test.ts tests/assistant/eval-discovery.test.ts tests/assistant/eval-regrade-discovery.test.ts` | 12 files, 226 tests passed |
| Full suite | `npx vitest run` | 282 files, 2448 tests passed |
| Types | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | exit 0, no warnings |
| Build | `npm run build` | exit 0 |

Logs: `.eval-results/assistant/patch2-final2-{vitest,tsc,lint,build}.log`.

## 3. Historical protocol — unchanged

The original `holdout-v1` result is preserved. This patch does not rewrite it.

| Artifact | Pass | Discovery use | False fit | Median calls |
|---|---:|---:|---:|---:|
| historical `b2-holdout` (18) | 10/18 (55.6%) | 14/18 (77.8%) | 0 | 1.5 |
| historical `b2-dev` (63) | 51/63 (81.0%) | 25/27 (92.6%) | 0 | 2 |

The historical regrade under the corrected grader is also unchanged: the
holdout stayed 10/18; only diagnostic `easy_gest t4` flipped from fail to pass.
Source traces were never modified.

## 4. Fresh frozen protocol — `holdout-v1`, 3 repeats

Command:

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_SUITE=holdout ASSISTANT_EVAL_REPEATS=3 \
  ASSISTANT_EVAL_LABEL=b2-patch2-holdout \
  npm run eval:assistant -- evals/assistant/discovery.eval.ts
```

| Measure | Before patch | After patch | Threshold | Verdict |
|---|---:|---:|---:|---|
| Pass | 12/18 (66.7%) | **15/18 (83.3%)** | ≥ 75% | **PASS** |
| Discovery use | 14/18 (77.8%) | **15/18 (83.3%)** | ≥ 90% | **FAIL** |
| Discovery args | 100% | 100% | reported | — |
| Unsupported fit claims | 0 | **0** | 0 | PASS |
| Difficulty inversions | 0 | **0** | 0 | PASS |
| No-midterm certainty | 0 | **0** | 0 | PASS |
| Median counted calls | 1.5 | **1** | ≤ 2 | PASS |

All three failures are the same case: `holdout-first_year_cs` repeated three
times. Each reply answered the listing from `search_catalog` and named the CIS
courses. Repeat 0 used five non-presentation calls (over the case budget of 3);
repeats 1 and 2 used one call each. There was no unsupported claim in any of the
three.

No other holdout turn failed. In particular:

- `holdout-fill_credits_zh`: 3/3 pass, one discovery call each, `credits: 3`.
- `holdout-no_midterm`: 3/3 pass, one discovery call each, no per-course review
  fan-out, explicit "review text unreadable / cannot confirm midterms".
- `holdout-constraints_zh`: 3/3 pass; individual no-clash scope kept distinct
  from a combined schedule.
- `holdout-easy_ge` and `holdout-history_ge`: 3/3 each.

### 4.1 The year-one CIS arithmetic is unchanged

`holdout-v1` has 18 discovery-required turns. Three are repeats of
`"I'm a year-one student—what CIS intro courses are offered?"`.

- If all three answer the listing with `search_catalog`, the maximum discovery
  score is **15/18 = 83.3%**.
- A 90% gate needs **17/18**.
- So at least two of the three listing turns would have to call discovery for
  the protocol gate to pass — two unnecessary discovery calls on a listing
  question.

The observed 15/18 is therefore the semantic ceiling for this question, not a
model regression. Forcing discovery on two of the three would teach the model to
make an unnecessary call. The frozen protocol stays FAIL; the semantic reading
is reported in §6.

## 5. Other fresh protocol runs

| Run | Pass | Discovery use | False fit | Inversions | No-midterm certainty | Median calls |
|---|---:|---:|---:|---:|---:|---:|
| Diagnostic (5) | 3/5 (60%) | 1/1 (100%) | 0 | 0 | 0 | 1 |
| Dev `dev-v2` (72) | **66/72 (91.7%)** | **33/36 (91.7%)** | 0 | 0 | 0 | 1 |
| Shadow `shadow-v1` (8) | **7/8 (87.5%)** | 6/6 (100%) | 0 | 0 | 0 | 1 |
| Shadow `shadow-v2` (8, first run) | 5/8 (62.5%) | 5/5 (100%) | 0 | 0 | 0 | 1 |

The dev set grew from 63 to 72 turns because this patch adds three credit-only
cases (English, Simplified Chinese, Traditional Chinese). The before/after pass
rates are therefore directional, not a same-set comparison.

Dev failures (6): `first_year_cs` ×3 routed to `search_catalog`; `easy_gest`
follow-up turns ×2 exceeded the case call budget; `no_candidates` repeat 2
exceeded it by re-verifying an empty discovery result with 19 calls. None
produced a false claim.

Shadow-v1's only failure is `shadow-new_major_priorities`, which made six calls
(discovery + catalog + course + two reviews) over a budget of three. Its credit
turns now pass; before the patch, English and Simplified Chinese clarified
instead of acting.

## 6. Semantic product correctness — proposed `b2-semantic-v1`

Rubric: [semantic product-acceptance rubric](../specs/2026-10-27-assistant-semantic-product-acceptance.md).

Per-turn verdict: intent match + no T1–T6 violation + answer addresses the
request. Efficiency is separate.

### 6.1 Frozen holdout

| Case | Repeats | Intent | Observed path | Semantic |
|---|---:|---|---|---|
| `holdout-easy_ge` | 3 | I2 | discovery | 3/3 PASS |
| `holdout-history_ge` | 3 | I2 + I6 | discovery; one review read in r0 | 3/3 PASS |
| `holdout-first_year_cs` | 3 | **I1/I2 ambiguous** | `search_catalog` listing | 3/3 PASS |
| `holdout-constraints_zh` | 3 | I2 + I4 | discovery, per-section no-clash | 3/3 PASS |
| `holdout-no_midterm` | 3 | I2 + I6 | discovery; missing review text stated | 3/3 PASS |
| `holdout-fill_credits_zh` | 3 | I2 | discovery, `credits: 3` | 3/3 PASS |

**Holdout semantic: 18/18 PASS.** S1 truthfulness: 0 violations. S2 intent:
18/18 (the three ambiguous listing turns are scored on truth and answer, as the
rubric requires). S3 combined claims: 0 violations. S4 is n/a on the holdout
because its credit evidence is three repeats of one language; the three-language
gate is tested on `shadow-v2` in §6.2. S5 efficiency: 17/18 within budget;
median 1.

S1–S4 are per-turn manual readings of the saved traces. T1, T4, T5, and T6 have
no machine check; T5 (script) was checked on each CJK reply. The machine
metrics (`falseFitClaims`, `noMidtermCertainty`, `difficultyDirection`,
`requestMismatches`) are reported separately and are not a substitute for the
manual reading.

### 6.2 Blind `shadow-v2` (frozen before its first run)

| Case | Intent | Observed path | Semantic | Efficiency |
|---|---|---|---|---|
| `shadow2-first_year_ge_listing` | I1 | `search_catalog` + `count_courses` ×3 | PASS | FAIL: 6 calls > 3 |
| `shadow2-cis_intro_advice` | I2 | discovery with `codePrefix: "CISC1"` | PASS | FAIL: 6 calls > 4 |
| `shadow2-credit_short_en` | I2 | discovery, `credits: 3` | PASS | PASS: 1 call |
| `shadow2-credit_short_zh_hans` | I2 | discovery, `credits: 3` | PASS | PASS: 1 call |
| `shadow2-credit_short_zh_hant` | I2 | discovery, `credits: 3` | PASS | PASS: 1 call |
| `shadow2-factual_course` | I3 | `get_course` | PASS | PASS: 1 call |
| `shadow2-combined_sections` | I5 | `get_course`/`get_course_sections` then `preview_timetable` | PASS | FAIL: 5 calls > 4 |
| `shadow2-workload_reviews` | I2 + I6 | discovery; missing review text stated | PASS | PASS: 1 call |

**Shadow-v2 semantic: 8/8 PASS.** S1 0 violations; S2 8/8; S3 0; S4 3/3; S5
5/8 within budget. The first-call `toolChoice` field reports `course` for the
combined turn because `get_course` was first; the trace still contains
`preview_timetable`, and the reply did not claim mutual compatibility without
it.

The `shadow2-cis_intro_advice` case used `codePrefix: "CISC1"`, which is a
narrower but semantically valid scope. The frozen predicate expects `CISC`/`CIS`
and therefore reports an argument mismatch. That is an instrument-strictness
limitation; the case was not edited after the run.

### 6.3 Cross-run truthfulness

Across 111 fresh turns (diagnostic 5, dev 72, holdout 18, shadow-v1 8,
shadow-v2 8): 0 unsupported fit claims, 0 difficulty inversions, 0 no-midterm
certainty violations, 0 provider request mismatches, 0 tool-registration
violations. Every run finished complete, with no timeout and no partial
artifact.

## 7. Student-facing improvements

1. **Credit-only requests now get options instead of an interview.** Before,
   "I need three more credits" could produce a request for a major or GE
   direction. Now the same intent acts across languages:
   - dev credit probes: 9/9;
   - `holdout-fill_credits_zh`: 3/3;
   - shadow-v1 credits: 3/3 (before: 1/3);
   - shadow-v2 credits: 3/3 on its first run.
2. **Review-sensitive answers stop re-reading the same unreadable reviews.**
   `holdout-no_midterm` now uses one discovery call and says the review text
   could not be read; it does not certify "no midterm". The dev
   `no_midterm`/`preference_conflict` turns no longer fan out per-course review
   calls.
3. **Fit claims stay inside their evidence.** Zero unsupported clash-free
   claims across all fresh runs. The `shadow2-combined_sections` turn used
   `preview_timetable` and answered the joint question without claiming two
   individual fits prove a combination.
4. **Bounded discovery is described honestly.** `examined.truncated`, missing
   review text, and `no_plan` are surfaced in replies rather than turned into
   certainty.

## 8. Remaining correctness and efficiency defects

1. **Protocol cannot reach 90% discovery use on `holdout-v1` without forcing a
   listing into discovery.** Documented in §4.1; not a product claim.
2. **Over-research remains.** Examples: dev `no_candidates` repeat 2 made 19
   calls to re-verify an empty discovery result; dev `easy_gest` follow-ups made
   4–5 calls; shadow-v2 browse made 6 calls, CIS advice 6, combined check 5.
   These are truthful answers with excess tool work, not false answers.
3. **Dev `first_year_cs` still routes to catalog 3/3.** The wording ("what
   first-year CS courses could I take") is also listing-shaped. This is the same
   ambiguity as the holdout; it is not a false claim.
4. **`shadow2-cis_intro_advice` scope predicate is stricter than the semantic
   behaviour.** `CISC1` is valid; the frozen case expects `CISC`. Do not edit a
   run set after seeing its result.
5. **Fixture review bodies are mostly empty.** The live eval cannot exercise
   populated review evidence end-to-end; unit tests cover populated, empty,
   incomplete, failed, and capped paths.
6. **Browser acceptance remains `UNVERIFIED`.** No authenticated session or
   dev server was available; the manual checklist in the earlier final
   verification remains the handoff.
7. **Style drift:** several replies open with "I'll look…" despite the prompt
   style rule. Cosmetic, and not gated.

## 9. Proposed release-acceptance decision

- **Historical protocol (P): FAIL.** `holdout-v1` discovery use is 15/18
  (83.3%) against a 90% gate. The pass-rate gate is met (15/18 ≥ 75%), but the
  discovery-use gate is not. This result is not retroactively reinterpreted.
- **Semantic product acceptance (S) under `b2-semantic-v1`: PASS.**
  Holdout 18/18; blind shadow-v2 8/8; zero truthfulness violations in either.
- **Efficiency (E): PARTIAL.** Median calls are 1, but 1/18 holdout turns and
  3/8 shadow-v2 turns exceed their case budgets through over-research.

**Proposed decision: conditional semantic acceptance, not a protocol pass, and
not merged here.**

- Under the existing preregistered protocol, the release remains **NO-GO**
  because the discovery-use gate is unmet.
- If the release owner adopts `b2-semantic-v1` as a separate product gate, the
  patch is semantically acceptable, on the explicit record that the protocol
  failure is the documented year-one CIS methodology limitation, not a product
  correctness defect.
- Before broad rollout, fix the over-research paths in §8.2 (especially the
  19-call empty-result verification and the browse/CIS/combined call blowouts).
- No merge and no V2.3.5-C work was performed.

## 10. Preservation

- `holdout-v1` questions, case IDs, repeats, rubric, and thresholds unchanged.
- `shadow-v1` unchanged; `shadow-v2` frozen before its first run.
- Historical artifacts and their original scores untouched.
- `b2-v2` metric definitions unchanged; no new runtime limit, step-budget
  increase, model change, or keyword router.
- `holdout-v1`, `shadow-v1`, and `shadow-v2` results name the rubric and
  prompt fingerprint used (`prompt: 049342cbd828`).

## 11. Independent review

Independent review completed 2026-10-27 by a separate read-only reviewer.

Review scope limitation: the reviewer had no shell/Git access and reviewed the
two documents, the HEAD file contents, and the read-only eval artifacts. It
could not inspect `git diff 2e26643..HEAD`; the product-code diff was checked
separately in this session with the commands in §2. Commit order for the freeze
claim was verified from git: `313e2ee` at 17:17:37, first `shadow-v2` artifact
at 17:18:29.

Findings and resolution:

| Severity | Finding | Resolution |
|---|---|---|
| Important | The 15/18 arithmetic said "at most one" listing turn may call discovery; the correct statement is "at least two". | Fixed in both documents. |
| Important | `FROZEN_SHADOW_V2` was derived from `SHADOW_CASES_V2`, so its snapshot pin was tautological. | Replaced with a hardcoded literal; the existing snapshot now pins the messages. |
| Minor | §6.1 attributed the three-language S4 gate to the single-language holdout credit repeats. | Relabelled S4 n/a on the holdout; S4 evidence is `shadow-v2`. |
| Minor | S1–S4 are manual T-ID readings, not machine checks. | Stated explicitly in §6.1, including the T5 script check. |
| Minor | The ambiguous I1/I2 classification could look post-hoc. | Provenance noted in the rubric: classified from question text before reading the reply. |

No Critical findings. The reviewer's conclusion was "OK with notes" for the two
documents as proposed instruments, conditional on the two Important fixes,
which are applied.
