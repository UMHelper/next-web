# B.2 reliability patch — investigation of two audit ambiguities

Date: 2026-10-27
Branch: `feat/assistant-v2-3-5-b2-remediation`
Worktree: `.worktrees/assistant-v2-3-5-b2`
Starting HEAD: `2e26643`

This note resolves the two ambiguities that had to be settled before any code
change. It is separate from the product patch and from the historical regrade.

## A. Year-one CIS holdout question

Question (frozen `holdout-v1`): `"I'm a year-one student—what CIS intro courses are offered?"`

### What the repo already distinguishes

The dev registry separates the two intents that the holdout sentence blurs:

| Case | Wording | Expected tool |
|---|---|---|
| `dev-v2/catalog_browse` | `"List all first-year CIS courses."` | `discover_course_candidates` **optional** (`maxToolCalls: 3`) |
| `dev-v2/first_year_cs` | `"What first-year CS courses could I take this term?"` | discovery **required**, with a `department: CIS` / `codePrefix: CISC` + `maxSuggestedYear: 1` predicate |

The tool contracts carry the same line: `search_catalog` remains first in the
surface and is described as the browse/list tool; `discover_course_candidates`
is for "which should I take" recommendations, shortlists, and constraint-shaped
questions. The holdout sentence asks what is **offered**, with year context.
It does not ask which course the student should take, does not state a
constraint to optimize, and does not ask for a ranking. Read literally, it is a
catalog listing, which `search_catalog` answers correctly. The earlier forensic
audit reached the same reading ("reads equally well as a catalog browse").

### Verdict

- **Product semantics:** the turn is **ambiguous, leaning listing**. Calling
  `search_catalog` is a legitimate product answer; forcing discovery here would
  teach the model to make an unnecessary call.
- **Protocol semantics:** `holdout-v1` declares discovery required. The rubric
  therefore scores a legitimate listing as a routing failure.
- **Classification:** **evaluation methodology limitation**, not a confirmed
  product-correctness defect. The frozen question and threshold stay unchanged.
  This is reported separately from the semantic product-quality assessment, and
  it is not used to justify a prompt change that forces discovery on every
  code-less question.

No change is made to `holdout-v1`, its rubric, or the discovery-use threshold.

## B. Tool-call count consistency

The reliability audit said `holdout-easy_ge/r2` had "four counted calls,
including `present_response`", while also saying presentation calls are
excluded. Raw trace and grader were checked.

### Counted calls in code

- `evals/assistant/discovery-grade.ts:180` —
  `countToolCalls` filters `call.name !== "present_response"`.
- `evals/assistant/discovery-eval-lib.ts` — the incremental case record uses the
  same filter.

### Raw artifacts

| Trace | Raw calls | `present_response` | Graded count | Limit | Grade |
|---|---|---|---|---|---|
| `holdout-easy_ge/r1` | 4 (discover + 3 reviews) | 0 | 4 | 3 | fail |
| `holdout-easy_ge/r2` | 5 (discover + 3 reviews + present) | 1 | 4 | 3 | fail |
| `holdout-no_midterm/r0` | 5 (discover + 4 reviews) | 0 | 5 | 4 | fail |
| `holdout-no_midterm/r1` | 5 (discover + 3 reviews + present) | 1 | 4 | 4 | pass |
| `holdout-no_midterm/r2` | 8 (discover + 4 reviews + 2 count + present) | 1 | 7 | 4 | fail |

The graded counts match the code. The audit's phrase "four counted calls,
including `present_response`" is a prose inconsistency: the *raw* trace has
four non-presentation calls plus a presentation call, and the grader counts
four. There is no instrumentation defect, and the metric is not changed.

A regression test is added so raw-trace length, counted length, and the
presentation exclusion stay distinct.

## What this means for the patch

1. The review-fan-out failures are real product behavior, not a counting bug:
   discovery returned `reviewEvidence.read: 0` for every top candidate, the
   model retried reviews one course at a time, and the retries blew the call
   budget on `easy_ge` and `no_midterm`.
2. The year-one CIS failure is a rubric/intent disagreement. The product change
   targets truthfulness of evidence and unnecessary clarification, not the
   frozen holdout score.
