# V2.3.5-B.3 final efficiency verification and implementation acceptance

Date: 2026-10-27
Worktree: `.worktrees/assistant-v2-3-5-b2`
Branch: `feat/assistant-v2-3-5-b2-remediation`
Verified HEAD: `33d487d` (code) plus this documentation commit
Protocol: `b2-v2` / frozen `holdout-v1`
Semantic rubric: `b2-semantic-v1` (proposed separate gate)
Efficiency diagnostic: frozen `efficiency-v1`

This report keeps four questions separate:

1. Does the code pass deterministic correctness gates?
2. Did the historical protocol pass, with its original cases and threshold?
3. Did the semantic product rubric pass?
4. Is the capability efficient and ready for student-facing deployment?

A semantic pass is not evidence that the historical protocol passed, and a
protocol pass is not evidence that the browser experience is ready.

## 1. Repository state

- Canonical worktree: `/Users/thomaswu/Workspace/next-web/.worktrees/assistant-v2-3-5-b2`
- Branch: `feat/assistant-v2-3-5-b2-remediation`
- Starting HEAD: `f052052`
- B.3 commits:
  - `e5eb130` — frozen `efficiency-v1` diagnostic paraphrases.
  - `e5f8ffa` — conclusive empty-discovery and combined-preview evidence.
  - `33d487d` — in-plan and no-section zero-match reasons; fingerprint includes the schema.
- No upstream is configured for this branch; no push or merge was performed.
- Recovery backups and reviewed B.2 commits are untouched.
- Single-writer workflow preserved; no parallel writer entered the worktree.

## 2. Minimal changes

| Area | Change | Why |
|---|---|---|
| Discovery no-match | Complete zero-match and bounded zero-match notes; discovery description says a complete empty result should not be re-searched or enumerated | Stop the 19-call re-verification loop |
| Catalog browse | `search_catalog` explains `courseType` vs faculty/department, no time filter, one scoped call with `totalCount`; `count_courses` is not for re-confirming a result | Prevent wrong `faculty: GECOURSE` searches and repeated counts |
| Combined check | `preview_timetable` resolves sections itself, includes saved-plan and mutual conflicts; individual checks are not mutual proof; `check_plan_conflicts` loads sections itself | Remove section pre-fetch and individual-check preflight |
| Time parsing | `startAfter` example: “no class before 10:00” → `10:00` | Prevent a hard-constraint miss |
| Measurement | Discovery eval fingerprint now includes the model-facing tool and result files, including `discovery/schema.ts` | Tool-description changes no longer look like identical runs; the B.3 baseline pairing predates this fingerprint change, so traces—not `settings.eval`—are the comparison evidence there |

No new tool, router, orchestration framework, database, embedding, persistence,
runtime call cap, or larger runtime budget. System-prompt size is unchanged.

## 3. Deterministic gates

Final run on `e5f8ffa` plus tests:

| Gate | Result |
|---|---|
| Focused discovery/timetable/integration | 19 files, 259 tests passed |
| Full Vitest | **282 files / 2454 tests passed** |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0, no warnings |
| `npm run build` | exit 0 |

Logs: `.eval-results/assistant/b3-final3-{vitest,tsc,lint,build}.log`.

## 4. Historical protocol — unchanged

The frozen protocol and its original results are preserved. B.3 does not change
the cases, grading rules, or threshold.

Final fresh `holdout-v1` run, 3 repeats:

| Measure | Result | Gate | Verdict |
|---|---:|---:|---|
| Pass | **14/18 (77.8%)** | ≥ 75% | **PASS** |
| Discovery use | **15/18 (83.3%)** | ≥ 90% | **FAIL** |
| Discovery args | 100% | reported | — |
| Unsupported fit claims | 0 automated | 0 | PASS |
| Difficulty inversions | 0 | 0 | PASS |
| No-midterm certainty | 0 | 0 | PASS |
| Median counted calls | 1 | ≤ 2 | PASS |

The discovery-use failure is the documented year-one CIS listing conflict. Three
of the 18 required-discovery turns are repeats of a question asking what CIS
intro courses are **offered**. All three used `search_catalog`; a catalog
listing answers that question. If all three legitimately browse, the maximum
possible discovery-use score is 15/18 (83.3%). Reaching 90% would require at
least two of the three listing turns to make an unnecessary discovery call. The
protocol stays FAIL on record; it is not retroactively reinterpreted.

## 5. Development regression

Final fresh `dev-v2`, 3 repeats (72 turns; the set includes three B.2 credit-only
cases added earlier):

| Measure | Result | Gate |
|---|---:|---:|
| Pass | **65/72 (90.3%)** | ≥ 80% PASS |
| Discovery use | **36/36 (100%)** | ≥ 90% PASS |
| Discovery args | 35/36 (97.2%) | reported |
| Automated false-fit flags | 4 | reported |
| Difficulty inversions | 0 | PASS |
| No-midterm certainty | 0 | PASS |
| Median counted calls | 1 | PASS |

The four automated false-fit flags were reviewed against their traces:

- `easy_gest` r0 t4/t5: section-level evidence correctly distinguishes
  `GEST1006-002` (`verified_no_clash`) from `001` (`confirmed_clash`); the
  course-level flag is a mixed-section attribution error, and t5 reuses the
  immediately preceding turn’s evidence.
- `fill_credits` r0 t2: `preview_timetable` returned `conflicts: []`; the reply
  correctly reported no clashes. The grader does not index preview facts as
  fit support, so the flag is a grader limitation.

No unsupported clash-free claim was found on manual review. The automated
false-positive count is reported, not hidden.

## 6. Efficiency before / after

Frozen `efficiency-v1` (new paraphrases, not holdout wording):

| Measure | Baseline (1 repeat) | Final (2 repeats) |
|---|---:|---:|
| Turns / passed | 9 / 6 (66.7%) | 18 / 14 (77.8%) |
| Median non-presentation calls | 2 | 1 |
| Discovery use | 4/5 (80%) | 8/10 (80%) |
| Catalog browse | 6 calls | 1 non-presentation call |
| Combined check | 7 calls, no preview | 3 calls, preview |
| No-match evening | 2 calls | 1 call |
| CIS advice (non-present) | 5 calls | 1 and 6 calls |
| Detail follow-up | 3 calls | 1 and 8 calls |

Targeted rechecks:

- Dev `no_candidates` after the no-match evidence change: **1, 1, 2 calls**
  (`discovery-b3-no-candidates-check.json`). The 19-call loop is a B.2
  intermediate trace (`discovery-b2-patch2-dev.json`), not a B.3 baseline; one
  intermediate B.3 run hit 18 calls before the note landed. The improvement is
  trace-backed but not a clean same-run before/after.
- Dev `easy_gest` t4 after the section-loading guidance: **2–3 calls** in most
  repeats, with 4–12 when `check_plan_conflicts` returns
  `temporarily_unavailable` and the model retries.
- Shadow-v2 post-change: **7/8**, discovery use 5/5, median 1; only CIS advice
  exceeded its call budget.

## 7. Semantic product acceptance

`b2-semantic-v1` stays a proposed separate gate. Post-B.3 evidence:

| Dimension | Result |
|---|---|
| Holdout truthfulness | Semantic review of the 18 holdout turns found 0 T1–T6 violations; the four failures were routing or call-budget only |
| Holdout semantic intent | 18/18 (three ambiguous listings scored on truth/answer) |
| Shadow-v2 semantic | 8/8 |
| Combined verification | Post-change combined turn used `preview_timetable`; no mutual claim from individual checks |
| Review uncertainty | No unsupported no-midterm guarantee; missing review text stated |
| Language | CJK replies matched the requested script in sampled holdout turns |
| S5 efficiency | Holdout 16/18 within budget (88.9%); shadow-v2 7/8 |

S1–S4 are manual per-turn readings, not machine checks. The automated
`falseFitClaims` field is noisy for mixed-section and preview evidence, as shown
in §5.

## 8. Browser acceptance — UNVERIFIED

No authenticated browser session was available:

- no dev server was listening on 3000–3005;
- the worktree has `.env.local`, but no test-account credentials;
- no Playwright/Puppeteer or browser automation binary is installed;
- the assistant requires a signed-in Clerk user whose access mode is not `off`.

This is a **deployment blocker**, not a pass. The reproducible manual checklist
is the one in the B.2 final verification, and must be run at **380 px, 450 px,
800 px**:

1. Sign in as an authorized tester; open the assistant on `/`.
2. Catalog: “Show me the GEST courses offered this semester.” One listing, no
   personalized ranking, no result flood.
3. Recommendation: “Recommend easy GEST courses with no morning classes.”
   Relevant sections, truthful evidence, useful shortlist.
4. Refinement: “Prefer something without Friday classes.” Continuity, no
   restart.
5. Detail: “Tell me more about the second recommendation and its instructor.”
   Correct referent, grounded facts.
6. Timetable: “Which one fits my existing timetable?” Section-level
   deterministic evidence, correct badge.
7. Combined: “Can I take these three sections together?” Combined preview, no
   inferred mutual compatibility.
8. Planner change: modify a test plan and recheck. Stale compatibility is not
   shown as current.
9. Empty: restrictive constraints produce a concise no-match and a useful
   alternative, with no repeated searches.
10. Verify rich UI only on deliberate presentation, loading/streaming, honest
    errors, scrolling at all three widths, and that no real plan was modified.

Capture screenshots and the exact viewport for each scenario.

## 9. Remaining defects and release blockers

1. **Browser acceptance is UNVERIFIED** for all scenarios A–H and all three
   widths. This blocks student-facing deployment.
2. **Efficiency variance remains.** `cis_advice` ranged from 1 to 6
   non-present calls in the final run (an intermediate run reached 10);
   detail follow-ups ranged from 1 to 8; transient `temporarily_unavailable`
   responses still cause `check_plan_conflicts` retries.
3. **Referent-binding defect.** A follow-up naming “the second option” can make
   `get_course` return `needs_clarification` for an explicit course code. The
   model recovers through search, but the intended visible referent path is
   unreliable.
4. **Grader limitations.** `falseFitClaims` does not index `preview_timetable`
   facts and mis-attributes mixed-section course-level claims. This produces
   false positives on truthful replies; it is an instrument issue, not a new
   product claim.
5. **Case-design limitation.** `efficiency-v1` marks an existence query about
   marine-biology GEST courses as discovery-required; `search_catalog` answers
   it truthfully. The case stays frozen and is not used as a release gate.
6. **No-match routing is stochastic.** The complete no-match evidence stops the
   enumeration loop once discovery is called, but a schedule question can still
   start with catalog search. The search contract now states it has no time
   filter; this needs live regression, not a global force.
7. **B.2 protocol FAIL remains.** 15/18 discovery use is the semantic ceiling
   for the ambiguous listing, not a product regression.

## 10. Acceptance matrix

| Gate | Result | Evidence | Blocking? |
|---|---|---|---|
| Deterministic correctness | **PASS** | 2454/2454 Vitest, tsc, lint, build | No |
| Semantic product acceptance | **PASS with limitations** | Holdout 18/18 manual; shadow-v2 8/8; 0 confirmed unsupported claims | No, if `b2-semantic-v1` adopted |
| Historical protocol | **FAIL** | Holdout discovery use 15/18 (83.3%) < 90%; pass 14/18 ≥ 75% | Yes under the existing gate |
| Tool efficiency | **PARTIAL** | Targeted fixes pass; variance and retries remain | Yes for broad rollout |
| Live generalization | **PARTIAL** | Dev 65/72, holdout 14/18, efficiency 14/18, shadow-v2 7/8 | No for controlled pilot |
| Browser acceptance | **UNVERIFIED** | No authenticated browser | **Yes for deployment** |
| Operational readiness | **PARTIAL** | Complete artifacts, no timeouts, no request mismatches; retry loops remain | Yes for broad rollout |

## 11. Proposed release-owner decision

- Adopt `b2-semantic-v1` as a **separate** product gate, with S1–S4 hard and S5
  reported. Keep the historical protocol FAIL exactly as measured.
- Do not treat the semantic pass as retroactive proof that the protocol passed.
- Accept the implementation for controlled internal/pilot use only after the
  browser checklist in §8 is executed and the referent-binding defect in §9.3 is
  fixed or explicitly waived.
- Before broad rollout, fix the `temporarily_unavailable` retry loop and reduce
  the `cis_advice`/follow-up variance.

## 12. Independent review

A separate read-only reviewer assessed the four dimensions in the mission.

Scope limitation: the reviewer reported the launch HEAD as `718afd8` and could
not inspect the committed range; it reviewed the HEAD file contents, the two
documents, and the named artifacts. No files were modified.

Findings and resolutions:

| Severity | Finding | Resolution |
|---|---|---|
| P1 | The 19-call no-match comparison came from a stale B.2 intermediate run, not a B.3 baseline. | Provenance corrected in both documents; the intermediate 18-call B.3 run is disclosed. |
| P2 | The eval fingerprint omitted `discovery/schema.ts`, and the baseline pairing predates the fingerprint change. | `schema.ts` added; the documents now say traces, not the fingerprint, are the baseline comparison evidence. |
| P2 | A zero-candidate result caused only by all matching courses being in the saved plan was labelled a complete no-match. | Added in-plan and no-listed-sections notes; regression tests added. |
| P2 | The CIS-advice baseline was stated as 6 calls when the artifact has 5 non-present calls. | Corrected to 5; the 11-raw/10-non-present intermediate run is labelled. |
| P2 | The review section was a placeholder. | Replaced with this record. |

The reviewer's dimensions:

- **Academic correctness:** no finding beyond the P2 note; hard rules stay hard,
  ranking/offering semantics unchanged, uncertainty hedging preserved.
- **Semantic behavior:** no finding; over-selection and referent-binding
  residuals are disclosed.
- **Operational reliability:** no code finding; retries and call-budget variance
  are declared; all final artifacts are complete with no timeouts.
- **Student-facing UX:** no finding; browser stays UNVERIFIED with the checklist
  and is flagged as a deployment blocker.

Merge verdict from the reviewer: **OK with notes**, conditional on the
provenance and note-firing corrections, which are applied.
