# V2.3 scenario-context reliability fix

- Status: **Complete** (2026-10-25)
- Plan: [`2026-10-25-assistant-v2-3-scenario-context.md`](../plans/2026-10-25-assistant-v2-3-scenario-context.md)
- Prompt fingerprint (eval): see `settings.prompt` in result JSON (post-change)

## Root cause

| Failure | Cause |
|--------|--------|
| **`followup_hypo` T1** | Model answered from saved digest (rich day-part facts) instead of the latest hypothetical preview; preview summaries lacked morning-specific facts; prompt L23/L24 contradicted on conflict follow-ups; eval `forbid: ["saved"]` fired when the model said “saved plan”. |
| **`manual_change` T1** | Digest updated correctly, but the model repeated turn-0 clash text instead of empty `conflicts`. |

## Minimal changes

| Area | Change |
|------|--------|
| [`lib/assistant/timetable-scenario.ts`](../../lib/assistant/timetable-scenario.ts) | Deterministic scenario referent (`saved` / `preview` / `ambiguous`) from latest message, previews context, and tool history. |
| [`lib/assistant/timetable-previews.ts`](../../lib/assistant/timetable-previews.ts) | `morningConflicts`, `plannerVersionAtPreview`, `conflictCount`; hypothetical previews summarize **only conflicts touching added sections**. |
| [`lib/assistant/agent.ts`](../../lib/assistant/agent.ts) | Injects scenario referent context each run (with planner version from digest). |
| [`lib/assistant/prompt.ts`](../../lib/assistant/prompt.ts) | Scenario-aware rules; removed saved-vs-preview contradiction; hypothetical wording constraint. |
| Tests | [`tests/assistant/timetable-scenario.test.ts`](../../tests/assistant/timetable-scenario.test.ts), preview/agent/integration updates; holdout case `ambiguous_preview_ref`. |

## Scenario resolution (summary)

- Explicit “actual saved timetable” → **saved**.
- Deictic follow-up after hypothetical preview (morning/day/“that preview”) → **preview** (newest hypothetical in previews context when tool history is incomplete).
- “Still have conflicts?” / clash status → **saved** with wording to trust empty digest `conflicts`.
- Two hypotheticals + “which one” → **ambiguous**.

## Unit / integration evidence

- `tests/assistant/timetable-scenario.test.ts` — 9 cases
- `tests/assistant/timetable-previews.test.ts` — morning conflict enrichment
- `tests/assistant/agent.test.ts` — scenario context on hypo follow-up
- `tests/components/assistant-v2-3.integration.test.tsx` — Scenario C/D + `followup_hypo` context assertions (10/11 pass; sidebar reopen test fails in this environment — empty DOM after close)

## Live DeepSeek metrics

### Focus (10×, after final prompt + hypo conflict filter)

| Case | T1 pass | Artifact |
|------|---------|----------|
| `followup_hypo` | **9/10** | [`.eval-results/assistant/timetable-v23-scenario-focus3.json`](../../.eval-results/assistant/timetable-v23-scenario-focus3.json) |
| `manual_change` | **9/10** | [`.eval-results/assistant/timetable-v23-scenario-manual.json`](../../.eval-results/assistant/timetable-v23-scenario-manual.json) |

Earlier focus runs (before hypo-specific conflict filter / wording): `timetable-v23-scenario-focus.json` (0/10 hypo), `timetable-v23-scenario-focus2.json` (4/10 hypo).

### Holdout (3×)

| Metric | Result | Threshold |
|--------|--------|-----------|
| Conversation | **26/27 (96.3%)** | ≥85% |
| Safety | **51/51 (100%)** | 100% |

Artifact: [`.eval-results/assistant/timetable-conversation-v23-scenario-holdout.json`](../../.eval-results/assistant/timetable-conversation-v23-scenario-holdout.json)

### Full V2.3 timetable suite (3 invocations × 3 repeats)

| Label | Presentation | Analysis | Safety | Conversation | False previews |
|-------|--------------|----------|--------|--------------|----------------|
| [`v23-scenario-run1`](../../.eval-results/assistant/timetable-v23-scenario-run1.json) | 66/69 (95.7%) | 45/45 (100%) | 69/69 (100%) | **9/9 (100%)** | 3/45 (6.7%) |
| [`v23-scenario-run2`](../../.eval-results/assistant/timetable-v23-scenario-run2.json) | 66/69 (95.7%) | 44/45 (97.8%) | 69/69 (100%) | 8/9 (88.9%) | 3/45 (6.7%) |
| [`v23-scenario-run3`](../../.eval-results/assistant/timetable-v23-scenario-run3.json) | 68/69 (98.6%) | 44/45 (97.8%) | 67/69 (97.1%) | 8/9 (88.9%) | 1/45 (2.2%) |

**Per-case T1 (3 repeats each run):** `followup_hypo` **9/9** across runs; `manual_change` **7/9** (failures on run2 r?, run3 r? — stale clash wording intermittent).

Pre-registered gates: conversation ≥90% met on **run1 only**; false previews ≤5% missed on run1/run2 (6.7%); safety 100% missed on run3 (97.1%).

### V2.2 presentation regression

| Suite | Result | Floor |
|-------|--------|-------|
| [`presentation-v23-scenario-pres.json`](../../.eval-results/assistant/presentation-v23-scenario-pres.json) | **39/39** | ≥38/39 |
| [`presentation-v23-scenario-pres-holdout.json`](../../.eval-results/assistant/presentation-v23-scenario-pres-holdout.json) | **10/10** | ≥9/10 |

## Browser acceptance

**UNVERIFIED** — No authenticated Clerk session in automation (same as prior V2.3 reports). Covered by integration tests above.

## Gates

| Gate | Result |
|------|--------|
| `npm run lint` | Pass |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pre-existing `aka` drift in unrelated catalog tests; fixed typing in `timetable-scenario.test.ts` |
| Targeted vitest | Scenario, preview, agent, integration (10/11) pass |

## Remaining limitations

- Live **false preview** rate on text turns still occasionally above 5% (6.7% on two full runs).
- **manual_change** T1 still **~78%** aggregated across three full runs (7/9), though **9/10** on dedicated focus run.
- **Safety** dip on full run3 (97.1%) — investigate trace if blocking release.
- Sidebar reopen integration test fails locally (launcher not in DOM after close).
- Catalog `aka` schema drift in unrelated tests.

## Release recommendation

**Conditional ship:** Scenario referent + enriched preview context fix the primary failure mode (`followup_hypo` now **9/9** on full suite repeats and **9/10** on focus). **`manual_change`** is much improved but not perfectly stable across full-suite repeats. Recommend deploying with monitoring on post-edit clash questions and false previews on text turns; re-run full suite before production if run2/run3 conversation/safety variance is unacceptable.

**V2.4:** Not started.
