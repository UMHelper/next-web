# V2.3.5-B.2 — Before / After (Comparison A vs B)

**Date:** 2026-10-27  
**Branch:** `feat/assistant-v2-3-5-b2-remediation` @ `b3a8e7c`  
**Rubric:** `b2-v2` (`evals/assistant/discovery-case-sets.ts`)  
**Prompt fingerprint (B runs):** `1d0be6222930`

## Case-set relationship (v1 → v2)

| Arm | Historical (v1) artifact | Fresh (v2) artifact | Notes |
|---|---|---|---|
| Development | `discovery-b-dev-audit.json` (54 turns, `dev-v1` cases) | `discovery-b2-dev.json` (63 turns, `dev-v2`) | v2 adds `factual_lookup`, `catalog_browse`, and revised expectations; turn counts are **not** directly comparable as identical journeys. |
| Holdout | `discovery-b-holdout-audit-full.json` (18 turns, frozen paraphrases) | `discovery-b2-holdout.json` (18 turns, `holdout-v1`) | Same six holdout identities; comparable suite size. |
| Diagnostic | `discovery-b-diagnostic.json` | `discovery-b2-diagnostic.json` | Both exercise `easy_gest` (5 turns); labels differ. |
| Baseline | `discovery-b-baseline-audit-r1.json` (18 turns, 1 repeat) | `discovery-b2-baseline.json` (21 turns, 1 repeat) | Baseline arm has no discovery tool; v2 baseline uses full `dev-v2` (21 turns). Pass rate vs discovery arm is **not** comparable. |

Historical source files live under `/Users/thomaswu/workspace/next-web/.eval-results/assistant/` (read-only). Regrade outputs: `.worktrees/assistant-v2-3-5-b2/.eval-results/assistant/discovery-regrade-b2-*.json`.

## Comparison A — Same traces, v2 rubric (measurement correction)

Regrade command:

```bash
ASSISTANT_REGRADE="/Users/thomaswu/workspace/next-web/.eval-results/assistant/discovery-b-dev-audit.json,/Users/thomaswu/workspace/next-web/.eval-results/assistant/discovery-b-holdout-audit-full.json,/Users/thomaswu/workspace/next-web/.eval-results/assistant/discovery-b-diagnostic.json,/Users/thomaswu/workspace/next-web/.eval-results/assistant/discovery-b-baseline-audit-r1.json" \
  npm run eval:assistant -- evals/assistant/regrade-discovery.eval.ts
```

| Metric | Dev (v1 traces) | Holdout (v1 traces) | Threshold |
|---|---:|---:|---|
| Turn pass rate | 68.5% (37/54) | 27.8% (5/18) | dev ≥80%, holdout ≥75% |
| Discovery use (required turns) | 87.5% (21/24) | 61.1% (11/18) | ≥90% |
| Discovery args (when called) | 100% | 81.8% | — |
| Confirmed false-fit claims (aggregate) | 0 | 0 | 0 |
| Difficulty direction inverted | 0 | 0 | 0 |
| Median non-`present_response` tool calls | 1.0 | 1.0 | ≤2 |

**Interpretation:** These numbers reflect **corrected grading on frozen model responses**, not improved product behaviour. They show how much of the prior audit failure budget was measurement vs behaviour.

## Comparison B — Fresh live runs (product + rubric)

Live runs use fixture-backed discovery data, production model settings, prompt `1d0be6222930`, and incremental artifacts.

| Metric | `b2-dev` (3×) | `b2-holdout` (3×) | Threshold |
|---|---:|---:|---|
| Turn pass rate | **80.95%** (51/63) | **55.56%** (10/18) | dev ≥80%, holdout ≥75% |
| Discovery use | **92.59%** (25/27) | **77.78%** (14/18) | ≥90% |
| Discovery args (when called) | 96% | 100% | — |
| Discovery selection: succeeded + args OK | 24 | 14 | — |
| Discovery selection: args mismatch | 1 | 0 | — |
| Discovery selection: not called (required) | 2 | 4 | — |
| Confirmed false-fit claims (aggregate) | **0** | **0** | 0 |
| Difficulty direction inverted | 0 | 0 | 0 |
| No-midterm certainty violations | 0 | 0 | 0 |
| Median non-`present_response` tool calls | **2.0** | 1.5 | ≤2 |
| Complete run | yes | yes | — |
| Provider request mismatches | 0 | 0 | — |
| Discovery tool registration violations | 0 | 0 | — |

### Attribution (A vs B)

| Observation | Visible in A only | Visible in B only | Likely cause |
|---|---|---|---|
| Dev pass rate ↑ vs raw v1 audit | Yes (68.5% regrade vs ~59% raw) | Yes (81.0% live) | Rubric fixes (A) + topic/tool/compaction fixes (B) |
| Holdout pass rate | Low in A (27.8%) | Still low in B (55.6%) but higher | Mixed: some measurement (A), live reliability still weak (B) |
| Holdout discovery use | 61.1% in A | 77.8% in B | Behaviour improved but **still below 90%** gate |
| False-fit aggregate | 0 in A | 0 in B | Grader correction; live model did not accumulate confirmed false fits in full suites |
| `history_ge` turn 1 | v1 traces: zero-result topic filter failures | B: discovery returns `GEGA1000`–`GEGA1002` | **Product fix (tiered topic matching)** |

## Baseline arm (no discovery tool)

| Run | Turns | Pass rate | Median tool calls | Discovery attempts | Notes |
|---|---:|---:|---:|---:|---|
| `b2-baseline-diag` (3 cases, 1×) | 9 | 33.3% | 16 | 0 | Smoke partition |
| `b2-baseline` (full dev-v2, 1×) | 21 | 42.9% | 18 | 0 | Complete single repeat |
| v1 `b-baseline-audit-r1` regrade | 18 | 44.4% (regrade) | 13.5 | 0 | Historical |

Baseline pass rates are **not** compared to discovery journey thresholds (cases still expect discovery where required). Compare tool volume, latency, and task-quality metrics instead.

## Deterministic correctness (unit / integration evidence)

Covered by Phase C.1 full Vitest (2420 tests), including:

- `tests/assistant/discovery-topic-match.test.ts` — Macau/Macao, tiers, fallback
- `tests/assistant/discovery.test.ts` — compaction + fit downgrade
- `tests/assistant/discovery-contract.test.ts` — tool surface + prompt contract
- `tests/assistant/eval-discovery.test.ts` — grader + regrade + timeout handling
- `tests/components/assistant-v2-3-5-b.integration.test.tsx` — catalog browse vs discovery shortlist (J6)

## Raw artifacts (worktree)

| Label | Path |
|---|---|
| Live dev | `.eval-results/assistant/discovery-b2-dev.json` |
| Live holdout | `.eval-results/assistant/discovery-b2-holdout.json` |
| Live diagnostic | `.eval-results/assistant/discovery-b2-diagnostic.json` |
| Live baseline | `.eval-results/assistant/discovery-b2-baseline.json` |
| Regrade A | `.eval-results/assistant/discovery-regrade-b2-b-*.json` |
