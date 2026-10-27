# B.2 reliability patch — historical regrade comparison

Date: 2026-10-27
Source artifacts (unchanged): `.eval-results/assistant/discovery-b2-{holdout,dev,diagnostic,baseline}.json`
Command: `ASSISTANT_REGRADE=<sources> npm run eval:assistant -- evals/assistant/regrade-discovery.eval.ts`
Outputs: `.eval-results/assistant/discovery-regrade-b2-b2-*.json`

The grader revision is separate from the product patch. `CASE_SET_VERSION` stays
`b2-v2`, the frozen `holdout-v1` questions and thresholds are unchanged, and no
source trace was modified. The eval fingerprint changes, so new live runs are not
directly comparable with the historical arms; these regrades are the comparison.

## What the grader revision changes

1. Clauses split on `;` and `；`, so a saved-plan reference in one clause is not
   the subject of a fit claim in the next.
2. `GEST1006 §002`, `GEST1006 §2`, `GEST1006 #002`, `GEST1006 Section 2`,
   `GEST1006 sec. 2`, and `GEST1006-2` are read as section-level claims, with
   numeric zero-padding matched conservatively (an ambiguous numeric match still
   fails).
3. An individual fit claim takes the nearest contiguous subject run. Mutual
   compatibility claims keep the existing list behavior. Codes introduced by
   `with`/`than`/`versus`/`against`/`over` are treated as references, not subjects.
4. Saved-plan codes are still never exempted; only support in the trace counts.

## Before and after

| Artifact | Before (saved) | After regrade | Discovery use (after) | False-fit claims (after) |
|---|---|---|---|---|
| `b2-holdout` (18 turns) | 10 pass / 8 fail | 10 pass / 8 fail | 14/18 | 0 |
| `b2-dev` (63 turns) | 51 pass / 12 fail | 51 pass / 12 fail | 25/27 | 0 |
| `b2-diagnostic` (5 turns) | 2 pass / 3 fail | 3 pass / 2 fail | 1/1 | 0 |
| `b2-baseline` (21 turns) | 9 pass / 12 fail | 9 pass / 12 fail | 0/9 | 0 |

Only one turn changed: diagnostic `easy_gest r0 t4` (`GEGA1000` reference) moved
from fail to pass. Diagnostic `easy_gest r0 t3` no longer produces a false-fit
claim (`GEST1006 §002` now resolves to the verified section); that turn still
fails its own `maxToolCalls` check for four `check_plan_conflicts` calls, which is
a behavior finding, not a grading one.

The frozen holdout score does not move under the corrected grader. Its remaining
failures are routing, clarification, review fan-out, and call-budget behavior.
