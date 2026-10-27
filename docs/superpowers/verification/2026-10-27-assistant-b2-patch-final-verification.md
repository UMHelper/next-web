# B.2 reliability patch — final verification and verdict

Date: 2026-10-27
Branch: `feat/assistant-v2-3-5-b2-remediation`
Worktree: `.worktrees/assistant-v2-3-5-b2`
Starting HEAD: `2e26643`
Final patch HEAD: `607c199`
Rubric: `b2-v2` (unchanged)
Frozen release gate: `holdout-v1` (questions, cases, thresholds unchanged)
Shadow set: `shadow-v1` (secondary evidence only)

Artifacts (gitignored, preserved):

- `.eval-results/assistant/discovery-b2-final-{dev,holdout,shadow}.json`
- `.eval-results/assistant/discovery-regrade-b2-b2-{final-dev,dev,holdout,diagnostic,baseline}.json`
- `.eval-results/assistant/final-{vitest,tsc,lint,build}.log`

This note reports grading changes separately from product changes and keeps the
protocol verdict separate from the semantic assessment.

## 1. What shipped

Product behavior:

| Commit | Change |
|---|---|
| `22ae76d` | `reviewEvidence` gains `status`, `reviewCount`, `truncated`; unsearched candidates are `incomplete`, failed reads `unavailable`; tool descriptions defer to discovery evidence |
| `a7bd5a2` | `incomplete` means the search finished but some text was unreadable/capped/truncated, not "unfinished" |
| `795b853` | Returned evidence and both review-tool descriptions state that `read: 0` is a reason to report uncertainty, not to repeat the same per-course search |
| `787040f` | `scope.credits` is a valid discovery anchor on its own; the credit pool was already row-capped |
| `607c199` | Candidates outside the review budget keep `truncated: true` |

Grading instrument (separate from product behavior):

| Commit | Change |
|---|---|
| `bb4b5d1` | `GEST1006 §002` / `§2` / `#002` / `Section 2` / `sec. 2` resolve as section claims with conservative numeric padding; fit claims use the nearest subject run; `with/than/versus/against/over` introduce references, not subjects |
| `607c199` | A clause break (`so`, `but`, `however`, `—`, `，但是/所以/…`) starts a new subject span, so a saved-plan code before the break cannot become the claim subject; difficulty scale matches whole-number markers, so `4.1 = easiest` is not an inversion |

Evaluation/test assets:

| Commit | Change |
|---|---|
| `5933458` | Independently written, frozen `shadow-v1` (8 turns) and suite registry |
| `0ef1a9f` | Credit-anchor fixture test uses the full scope shape |
| `22ae76d`, `8d1408b`, this note | Investigation, historical regrade, final verification |

Not changed: system prompt, model, agent loop, step budget, runtime tool-call
limits, discovery ranking/SQL, frozen holdout questions, preregistered
thresholds, historical artifacts.

## 2. Audit ambiguity verdicts

Full reasoning: [investigation note](../audits/2026-10-27-assistant-b2-patch-investigation.md).

### A. Year-one CIS question — evaluation methodology limitation

`"I'm a year-one student—what CIS intro courses are offered?"` asks what is
**offered**, not which course to take. It names no constraint to optimize and
asks for no ranking. `search_catalog` is a legitimate answer; forcing discovery
on every code-less question would teach an unnecessary call.

- **Product semantics:** ambiguous, leaning catalog listing.
- **Protocol semantics:** `holdout-v1` declares discovery required, so the
  legitimate listing scores as a routing failure.
- **Classification:** evaluation methodology limitation. The frozen question
  and threshold stay unchanged. No prompt change was made to force discovery.

### B. Tool-call count — no instrumentation defect

`countToolCalls` (`evals/assistant/discovery-grade.ts`) filters
`present_response`; the incremental record uses the same filter. Raw
`holdout-easy_ge/r2` has four non-presentation calls plus one presentation
call; the grader counts four, over a limit of three. The audit's "four counted
calls, including `present_response`" was a prose inconsistency, not a bug. The
metric was not changed. A regression test keeps raw length, counted length, and
the presentation exclusion distinct.

## 3. Static verification

| Command | Result |
|---|---|
| `npx vitest run` | 282 files / 2446 tests passed |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` | exit 0 |

Focused run before committing the last grader edit:
`tests/assistant/eval-discovery.test.ts` + `tests/assistant/discovery.test.ts`
— 121 tests passed.

## 4. Historical regrade (unchanged source traces)

Source artifacts were not modified. Only the grading instrument changed.

| Artifact | Pass before | Pass after | Discovery use (after) | False fit | Median calls |
|---|---:|---:|---:|---:|---:|
| `b2-holdout` (18) | 10 | 10 | 14/18 (77.78%) | 0 | 1.5 |
| `b2-dev` (63) | 51 | 51 | 25/27 (92.59%) | 0 | 2 |
| `b2-diagnostic` (5) | 2 | 3 | 1/1 | 0 | 5 |
| `b2-baseline` (21) | 9 | 9 | 0/9 | 0 | 18 |

Only one turn flips: diagnostic `easy_gest t4`, where a saved-plan reference was
wrongly the subject of a fit claim. Diagnostic `t3` (`GEST1006 §002`) no longer
produces a false-fit claim; it still fails its own call-budget check.

## 5. Fresh behavior after the product patch

The dev artifact was produced before the final grader edit and is reported both
as run and regraded with the final instrument. Holdout and shadow ran after the
grader edit. Grading code cannot change model behavior, so the regrade is the
corrected comparison.

### 5.1 Development — 3 repeats, `dev-v2`

| Measure | Raw | Corrected regrade | Gate |
|---|---:|---:|---|
| Pass | 48/63 (76.19%) | **49/63 (77.78%)** | ≥80% — **fail** |
| Discovery use | 24/27 (88.89%) | 24/27 (88.89%) | ≥90% — **fail** |
| Discovery args | — | 100% | — |
| Unsupported fit | 2 (`GEGA1000` ×2) | **0** | 0 — pass |
| Difficulty inversions | 1 | **0** | 0 — pass |
| No-midterm certainty | 0 | 0 | 0 — pass |
| Median counted calls | 1 | 1 | ≤2 — pass |

The two raw false-fit flags were grader false positives cleared by same-clause
attribution; one of those turns still fails its `maxToolCalls` check, the other
now passes.

Remaining dev failures (14) are routing (2× `first_year_cs`, 1× `history_ge`),
call-budget after review enrichment, and multi-turn follow-up checks. No
unsupported claim survives the corrected grader.

### 5.2 Frozen holdout — 3 repeats, `holdout-v1`

| Measure | Result | Gate |
|---|---:|---|
| Pass | **12/18 (66.67%)** | ≥75% — **fail** |
| Discovery use | **14/18 (77.78%)** | ≥90% — **fail** |
| Discovery args | 100% | — |
| Unsupported fit | 0 | 0 — pass |
| Difficulty inversions | 0 | 0 — pass |
| No-midterm certainty | 0 | 0 — pass |
| Median counted calls | 1.5 | ≤2 — pass |

Failures: `first_year_cs` ×3 (catalog browse instead of discovery — §2A),
`fill_credits_zh` r1 (clarification only, no call), `history_ge` r0 and
`no_midterm` r0 (review fan-out over the call budget).

Compared with the historical arm this is 10/18 → 12/18 (net +2): `easy_ge` r1/r2
and `no_midterm` r2 now stay within budget, while `history_ge` r0 newly exceeds
it. The review-evidence and credit-anchor changes reduced but did not eliminate
fan-out under empty review bodies.

Semantic assessment excluding the ambiguous year-one CIS turn: **12/15 (80%)
pass, 14/15 (93.3%) discovery use** — the remaining semantic challenges are
credit-only over-clarification and review fan-out.

### 5.3 Blind shadow holdout — 1 run, `shadow-v1`

Frozen before the first run; `enforceThresholds: false`; secondary evidence only.

| Measure | Result |
|---|---:|
| Pass | **5/8 (62.5%)** |
| Discovery use (required turns) | **4/6 (66.7%)** |
| Unsupported fit | 0 |
| Difficulty inversions | 0 |
| No-midterm certainty | 0 |
| Median counted calls | 2 |

| Case | Result | Observed behavior |
|---|---|---|
| `shadow-catalog_browse` | pass | 3 catalog calls; listing, no discovery — correct |
| `shadow-new_major_priorities` | **fail** | discovery + catalog + `get_course` + 2 reviews = 5 calls > 3 |
| `shadow-credit_en` | **fail** | zero calls; asked for major/elective direction first |
| `shadow-credit_zh_hans` | **fail** | zero calls; asked for a direction first |
| `shadow-credit_zh_hant` | pass | discovery with `credits: 3`, ranked 3-credit list |
| `shadow-workload_reviews` | pass | discovery + 2 targeted review reads within budget |
| `shadow-no_midterm_insufficient` | pass | discovery + 2 review reads; explicitly refused to certify no midterm |
| `shadow-multi_section_fit` | pass | `get_course` + `check_plan_conflicts`; named section 002, no mutual-fit claim |

The credit-only contract is improved but still stochastic: Traditional Chinese
acts, English and Simplified Chinese clarified. That is a generalizable
clarification issue, not a language-specific one.

### 5.4 Manual inspection

- **Compatibility claims:** no unsupported verified-fit claim in fresh dev,
  holdout, or shadow under the corrected grader. Multi-section shadow turn names
  section 002 from `check_plan_conflicts` and does not claim sections fit each
  other.
- **No-midterm honesty:** both holdout and shadow replies state that official
  assessment data is unavailable and do not convert empty reviews into a
  guarantee.
- **Redundant calls:** reduced but not eliminated. Fan-out still breaches the
  call budget on two holdout turns and one shadow turn because discovery reports
  `read: 0` with empty excerpts under the fixture's empty review bodies.
- **Latency/steps:** all runs `complete: true`, no timeout, no partial artifact,
  provider request mismatches 0.

## 6. Remaining rubric-versus-intent disagreements

1. **Year-one CIS listing vs discovery** — evaluation methodology limitation
   (§2A). Reported separately from product quality; no benchmark change.
2. **Markdown-table section notation** — a section shown as `GEST1006 | 002` is
   not recognized as `GEST1006-002`. Behavior stays conservative (a stricter
   course-level reading), so it cannot create a false pass.
3. **`preview_timetable` evidence is not indexed for fit claims** — combined
   schedule verification in a `preview_timetable` result is not used as support
   for a per-course clash-free claim. Conservative, and no such claim appeared on
   holdout or shadow.
4. **Fixture review bodies are mostly empty** — discovery legitimately reports
   `read: 0`; live production data may behave differently. This inflates the
   observed fan-out and limits how much the eval can exercise populated-evidence
   paths. Unit tests cover empty, incomplete, failed, and populated cases.
5. **`temporarily_unavailable` conflict reads** (diagnostic) — a reliability
   follow-up for parallel reads, outside this patch's scope.

## 7. Browser acceptance — `UNVERIFIED`

No dev server was listening on ports 3000–3004, the B.2 worktree has no
`.env.local`, and the assistant requires a signed-in Clerk user whose access
mode is not `off` (admin or tester). No authorized browser session was
available, so this remains a blocker rather than a pass.

Manual checklist (repeat at **380 px, 450 px, 800 px**):

1. Sign in as an authorized tester; open the assistant launcher on `/`.
2. **Browsing vs recommendation:** "List all first-year CIS courses" renders the
   catalog list; "Which CIS intro courses should I take in year one?" returns a
   ranked shortlist with fit context.
3. **Offered sections and real meeting data:** open a recommendation; section
   times, days, rooms, and instructor come from the tool result, not prose.
4. **Review-evidence uncertainty:** ask about workload or midterms where review
   text is empty; the reply cites missing/unreadable evidence and does not
   guarantee "no midterm".
5. **Timetable verification and stale badges:** with a saved plan, confirm
   verified/unknown/stale fit states render distinctly, including after a plan
   edit.
6. **Follow-up references:** ask a follow-up ("what about section 002?") and
   confirm it refers to the same course/section without re-discovery.
7. **Explicit rich UI:** catalog rows, section tables, and recommendation cards
   render without clipped columns or horizontal overflow.
8. **Activity and latency:** tool activity is visible, no retry loop, and the
   turn completes in reasonable time.
9. **Keyboard/focus:** launcher, panel, and close control are reachable and the
   panel restores focus on close.

## 8. Invariants preserved

- `holdout-v1` questions, case IDs, rubric, and thresholds unchanged; the only
  case-set registry addition is `shadow-v1`.
- `b2-v2` rubric ID, discovery-use/argument metrics, tool-choice and
  difficulty-direction buckets unchanged.
- Historical artifacts untouched; raw runs preserved next to regrades.
- Cancellation, per-turn timeout, and atomic incremental persistence unchanged.
- No new runtime tool-call limit; no step-budget increase; no model change.
- No system-prompt edit; only returned evidence and tool descriptions changed.

## 9. Verdict

- **Product quality/reliability issue remains.** The release gates are not met:
  dev pass 77.78% (<80%), holdout pass 66.67% (<75%), holdout discovery use
  77.78% (<90%), shadow 62.5%. Residual causes are catalog-vs-discovery routing,
  credit-only over-clarification, and review fan-out after empty evidence.
- **Evaluation methodology limitation.** The year-one CIS holdout turn is
  ambiguous and its required-discovery rubric penalizes a legitimate listing.
  Frozen cases and thresholds stay unchanged; the protocol metric and semantic
  assessment are reported separately above.
- **Environment/browser blocker.** Authenticated 380/450/800 px acceptance is
  `UNVERIFIED`; the checklist in §7 is the handoff.
- **Not a confirmed product correctness defect.** Under the corrected grader
  there are zero unsupported verified-fit claims, zero difficulty inversions,
  and zero unsupported no-midterm guarantees across fresh dev, holdout, and
  shadow runs.

The patch improves evidence truthfulness, removes a false over-clarification
path, fixes two real grader defects, and adds a frozen independent shadow set.
It does not pass the release gate. **Not merged; V2.3.5-C not started.**
