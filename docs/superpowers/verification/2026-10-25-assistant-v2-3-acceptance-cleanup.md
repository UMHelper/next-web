# V2.3 final acceptance cleanup

- Status: **Engineering checkpoint** (2026-10-25) — not final production acceptance
- Prior: [scenario-context verification](./2026-10-25-assistant-v2-3-scenario-context.md)
- Grading: [grading semantics](./2026-10-25-assistant-v2-3-grading-semantics.md)

## 1. Sidebar reopen integration test

**Root cause:** Test harness mounted on `/` and clicked `AI Course Helper` after close. [`assistant-panel.tsx`](../../components/assistant/assistant-panel.tsx) intentionally hides `AssistantBubble` on `/` (home reopen uses Ask AI / `openToken`, covered elsewhere).

**Fix:** [`tests/components/assistant-v2-3.integration.test.tsx`](../../tests/components/assistant-v2-3.integration.test.tsx) navigates to `/timetable`, asserts digest `ready`, then close → bubble → reopen → digest still `ready`. Same pattern applied to [`assistant-v2-1.integration.test.tsx`](../../tests/components/assistant-v2-1.integration.test.tsx) close/reopen segment (regression suite).

**Result:** **11/11** V2.3 integration tests pass.

## 2. Semantic scenario audit

| Area | Change |
|------|--------|
| [`lib/assistant/timetable-previews.ts`](../../lib/assistant/timetable-previews.ts) | `conflicts` / `conflictCount` = full hypothetical week; `changeConflicts` / `changeConflictCount` = clashes touching added sections; `morningConflicts` from change-scoped set on hypothetical previews |
| [`lib/assistant/timetable-scenario.ts`](../../lib/assistant/timetable-scenario.ts) | Scoped preview wording (morning / all conflicts / default); allows clarifying preview is not saved |
| [`lib/assistant/prompt.ts`](../../lib/assistant/prompt.ts) | Removed blanket ban on the word “saved”; documents field usage |
| [`evals/assistant/timetable-cases.ts`](../../evals/assistant/timetable-cases.ts) | Narrower `followup_hypo` T1 forbid (saved-plan attribution only) |

No change to pre-registered eval thresholds in `timetable.eval.ts`.

## 3. Live model investigation (DeepSeek, post-cleanup)

Artifacts under [`.eval-results/assistant/`](../../.eval-results/assistant/).

### Focus 10× (`followup_hypo`, `manual_change`)

| Case | Turn ≥1 pass | Artifact |
|------|----------------|----------|
| `followup_hypo` | **4/10** | `timetable-v23-acceptance-focus.json` |
| `manual_change` | **9/10** | same |

**Classification**

- **`followup_hypo`:** Mix of correct preview answers, saved-plan attribution (correctly fails new forbid, e.g. “already in your saved plan”), and occasional wrong scenario (answers saved only). **Model variance + semantic grading**; no further prompt change (avoid overfitting).
- **`manual_change`:** One stale-clash repeat; others use empty digest correctly. **Intermittent model memory**, not harness (integration Scenario C passes).

### Full V2.3 suite (1×, 3 repeats)

| Metric | Result | Gate |
|--------|--------|------|
| Presentation | 68/69 (98.6%) | ≥90% |
| Analysis | 42/45 (93.3%) | ≥90% |
| Safety | 69/69 (100%) | 100% |
| Conversation | 6/9 (66.7%) | ≥90% |
| False previews | 1/45 (2.2%) | ≤5% |

Artifact: `timetable-v23-acceptance-full.json`

Conversation misses: `followup_hypo` T1 (saved-plan framing / missing mention), `manual_change` T1 (stale overlap or “can’t re-check” without digest), `manual_change` r1 T1 spurious `preview_timetable` (presentation fail).

### Holdout conversation

| Metric | Result | Gate |
|--------|--------|------|
| Conversation | 26/27 (96.3%) | ≥85% |
| Safety | 51/51 (100%) | 100% |

Artifact: `timetable-conversation-v23-acceptance-holdout.json`

### V2.2 presentation regression

| Suite | Result | Floor |
|-------|--------|-------|
| `presentation-v23-acceptance-pres.json` | **13/13** | ≥38/39 style suite |
| Holdout (10 cases) | **9/10** (90%) | ≥9/10 |

## 4. Automated regression

| Gate | Result |
|------|--------|
| `npm run lint` | Pass |
| `npm run build` | Pass |
| `npx tsc --noEmit` | Pre-existing `aka` drift in unrelated catalog tests |
| Targeted unit + V2.3 integration | Pass (11/11) |
| V2.2 + runtime integration | Pass |
| Read-only guard | Pass after adding `count_courses` to eval read-only allowlist (tool is read-only; list was stale) |

## 5. Browser acceptance

**OUTSTANDING** — No authenticated Clerk session or open browser tab in automation. Manual checklist: hypo vs saved labels, planner edit → clash answer, new chat, sidebar close/reopen on `/timetable` (bubble) and home (Ask AI).

## 6. Unresolved: hypothetical follow-up reliability

**Do not close V2.3 on tuned-suite conversation alone.** After this checkpoint, `followup_hypo` remains **4/10** on focused 10× runs and contributes to **6/9** conversation on the full tuned suite (3 repeats). No further grader or prompt tuning was applied to chase benchmarks.

**Preserved failing traces (local only; `.eval-results/` is gitignored):**

| Artifact | Use |
|----------|-----|
| `.eval-results/assistant/timetable-v23-acceptance-focus.json` | 10× `followup_hypo` + `manual_change`; inspect `traces[]` where `caseId === "followup_hypo"` and `turn === 1` |
| `.eval-results/assistant/timetable-v23-acceptance-full.json` | Full suite; same turn filter plus `manual_change` T1 stale replies |

**Observed failure modes (verify against injected scenario referent + preview summaries, not forbid regex alone):**

1. **Wrong scenario:** Turn 1 answers from saved digest only (“no morning conflicts in your saved plan”) despite prior hypothetical `preview_timetable`.
2. **Blended framing:** Correct MON/CISC3014 facts but attributes TUE overlap to “already in your saved plan” instead of `changeConflicts` / preview scope (may fail attribution forbid correctly).
3. **Digest denial:** `manual_change` T1 claims no fresh timetable data while eval harness supplies updated plan (model ignores empty `conflicts` list).

**Next acceptance work (before production signoff):**

- For each failing trace, confirm middleware injected `timetable scenario referent` (`kind: preview`, `previewId`, wording) and preview JSON (`changeConflicts`, `morningConflicts`, full `conflicts`).
- Complete **authenticated browser** checklist (hypo vs saved UI, planner edit → clash answer, new chat, reopen on `/timetable` and home Ask AI).
- **V2.4:** Not started.

## 7. Checkpoint summary

- **Land-ready:** Scenario resolver, preview field split, lifecycle integration tests, holdout conversation (96.3%), presentation regression, read-only allowlist sync.
- **Open:** Hypo follow-up live reliability; browser signoff; occasional `manual_change` stale replies.
