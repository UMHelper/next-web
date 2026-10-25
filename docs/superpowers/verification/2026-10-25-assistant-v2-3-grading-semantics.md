# V2.3 timetable eval grading semantics

- Status: **Accepted for `followup_hypo` T1** (2026-10-25 acceptance cleanup)
- Pre-registered suite thresholds in [`evals/assistant/timetable.eval.ts`](../../evals/assistant/timetable.eval.ts) are **unchanged**; this documents a **narrower proxy** for one turn only.

## Problem

`followup_hypo` turn 1 used `forbid: ["saved"]` as a stand-in for “answered from the saved digest instead of the hypothetical preview.” That substring also fails accurate replies such as “the preview is **not saved**” or “not your actual plan,” which are desirable.

Primary semantic gate remains `mention: ["CISC3014", "10:00"]` (facts from the hypo preview morning clash).

## Change

In [`evals/assistant/timetable-cases.ts`](../../evals/assistant/timetable-cases.ts), `followup_hypo` T1 `forbid` now targets **saved-plan attribution** only:

```text
\bsaved\s+(plan|timetable|schedule)\b
|\byour\s+saved\s+(plan|timetable)\b
|\balready\s+in\s+your\s+(saved\s+)?timetable\b
```

Bare substring `saved` and generic `actual plan` (e.g. “not your actual plan”) are no longer auto-fail.

## Historical re-score (`followup_hypo` T1 only)

Re-scored replies in existing artifacts with old vs new forbid (mentions unchanged):

| Artifact | Old `forbid: saved` | New attribution regex |
|----------|---------------------|------------------------|
| `timetable-v23-scenario-run1.json` | 3/3 | 3/3 |
| `timetable-v23-scenario-run2.json` | 3/3 | 3/3 |
| `timetable-v23-scenario-run3.json` | 3/3 | 3/3 |

(Intermediate draft used `(saved|actual)\s+plan`, which failed one historical reply containing “not your **actual plan**”; `actual` was dropped from the pattern.)

**Comparability:** Suite-level conversation/analysis rates on archived runs are unchanged for these artifacts on `followup_hypo` T1. Future runs use the new regex; compare using `mention` hits and scenario-context traces, not raw `saved` counts.

## Product alignment

Hypothetical preview summaries now expose:

- `conflicts` / `conflictCount` — full hypothetical week
- `changeConflicts` / `changeConflictCount` — clashes involving added sections
- `morningConflicts` — morning overlaps from `changeConflicts` on hypothetical previews

Scenario referent wording steers scoped follow-ups to `morningConflicts` / `changeConflicts` without banning accurate “not saved” explanations.
