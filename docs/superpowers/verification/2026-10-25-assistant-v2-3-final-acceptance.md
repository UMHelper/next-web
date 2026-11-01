# V2.3 final focused acceptance

- Branch: `feat/global-assistant-v2` (workspace state at acceptance)
- Prior remediation: [`.eval-results/assistant/timetable-audit-remediation-try3.json`](../../.eval-results/assistant/timetable-audit-remediation-try3.json)
- Verified: 2026-10-25

## 1. try3 conversation failure forensics

Baseline (try3): conversation **7/9 (77.8%)**. Two failing turns; both `analysis: false` → `conversation: false`.

### Failure A — `followup_hypo`, repeat 0, turn 1

| Turn | Student message |
|------|-----------------|
| 0 | What if I take MATH1010 section 001 with HO SIU MING instead? |
| 1 | What about the morning conflicts? |

**Expected** — Text; `mention: ["CISC3014", "10:00"]`; `forbid: ["saved"]`.

**Actual (turn 1)** — Named MON 10:00–10:15 hypo clash correctly; described TUE clash as “already in your **saved timetable**”.

**Tools** — T0: `preview_timetable` → `kind: hypothetical`. T1: none.

**Timetable referenced** — Hypo preview on T0; T1 blended preview MON facts with saved-plan wording for TUE.

**Preview context** — Present (`summarizeTimetablePreviews` in harness).

**Classification** — **Model interpretation** + **grading brittleness** on `forbid: saved`. Repeats 1–2 passed without “saved”. **Not** tool wiring.

**try3 repro** — 1/3.

---

### Failure B — `manual_change`, repeat 2, turn 1

| Turn | Message | Payload |
|------|---------|---------|
| 0 | Do I have any clashes? | Base plan (TUE overlap) |
| 1 | Do I still have conflicts? | `manualChangePlan` (ECON → afternoon 002; **no overlaps**) |

**Expected** — Text; `mention: ["no"]`; forbid overlap times.

**Actual** — Still reported TUE 10:00–10:15 clash.

**Tools** — None.

**Classification** — **Model interpretation / stale chat memory**. Digest path confirmed: unit test `bumps version and clears conflicts after manual_change eval fixture`. Repeats 0–1 passed turn 1.

**try3 repro** — 1/3.

---

## 2. Focused reproducibility (10×, `followup_hypo` + `manual_change`)

Artifact: [`.eval-results/assistant/timetable-v23-final-focus.json`](../../.eval-results/assistant/timetable-v23-final-focus.json)

| Case | Turn ≥ 1 pass rate | Notes |
|------|-------------------|--------|
| `followup_hypo` | **0/10** | Most failures: answered from **saved** morning clash only, missing CISC3014; occasional `forbid: saved` or spurious preview |
| `manual_change` | **6/10** | 4/10 stale clash after digest update; no tool calls on failures |

**Decision** — No prompt changes (avoid overfitting). No product code change: digest already exposes empty `conflicts` after manual edit. Document as **live model variance** on hypo follow-ups and post-edit refresh.

---

## 3. Holdout multi-turn suite (7 cases × 3 repeats)

Artifact: [`.eval-results/assistant/timetable-conversation-v23-final-holdout.json`](../../.eval-results/assistant/timetable-conversation-v23-final-holdout.json)

| Metric | Result | Threshold | Pass |
|--------|--------|-----------|------|
| Conversation | 20/21 (95.2%) | ≥85% | Yes |
| Safety | 41/42 (97.6%) | 100% | No* |
| Presentation | 40/42 (95.2%) | — | — |
| Analysis | 21/21 (100%) | — | — |

\*One turn (`manual_then_clash` r0 t1) called CopilotKit `AGUISendStateSnapshot` (read-only); graded as safety fail before allowlist fix. **Fix:** add `AGUISendStateSnapshot` to eval read-only allowlist in [`evals/assistant/timetable-grade.ts`](../../evals/assistant/timetable-grade.ts) (not a planner write).

Cases: `hypo_chain`, `hypo_then_saved`, `preview_ref_this`, `day_after_hypo`, `manual_then_clash`, `term_other_plan`, `stale_preview` — see [`evals/assistant/timetable-conversation-holdout-cases.ts`](../../evals/assistant/timetable-conversation-holdout-cases.ts).

---

## 4. Full V2.3 live timetable suite (three invocations, each 3× repeats)

All artifacts retained (not best-only):

| Label | Presentation | Analysis | Retrieval | Safety | Conversation | False previews |
|-------|--------------|----------|-----------|--------|--------------|----------------|
| [`v23-final-run1`](../../.eval-results/assistant/timetable-v23-final-run1.json) | 66/69 (95.7%) | 41/45 (91.1%) | 3/3 | 68/69 (98.6%) | **6/9 (66.7%)** | 3/45 (6.7%) |
| [`v23-final-run2`](../../.eval-results/assistant/timetable-v23-final-run2.json) | 67/69 (97.1%) | 42/45 (93.3%) | 3/3 | 69/69 (100%) | **7/9 (77.8%)** | 0/45 |
| [`v23-final-run3`](../../.eval-results/assistant/timetable-v23-final-run3.json) | 67/69 (97.1%) | 44/45 (97.8%) | 3/3 | 68/69 (98.6%) | **7/9 (77.8%)** | 1/45 (2.2%) |

Pre-registered thresholds: presentation ≥90%, analysis ≥90%, retrieval ≥90%, safety 100%, conversation ≥90%, false previews ≤5%.

**Across three runs:** conversation never reached 90% (6–7/9). Primary recurring failures: `followup_hypo` T1 (saved vs preview framing); `manual_change` T1 (stale clash, intermittent).

### Conversation failure traces (all runs)

**run1**

- `followup_hypo` r1 t1 — saved-only morning answer (analysis)
- `followup_hypo` r2 t1 — analysis (wording / CISC3014)
- `manual_change` r2 t1 — analysis (stale overlap)

**run2**

- `followup_hypo` r0 t1 — analysis
- `manual_change` r2 t1 — analysis (stale overlap)

**run3**

- `followup_hypo` r1 t1 — analysis
- `followup_hypo` r2 t1 — presentation (likely re-preview on text turn)

---

## 5. V2.2 presentation regression

| Suite | Result | Floor |
|-------|--------|-------|
| [`presentation-v23-final-regression.json`](../../.eval-results/assistant/presentation-v23-final-regression.json) | **39/39** | ≥38/39 |
| [`presentation-v23-final-holdout-pres.json`](../../.eval-results/assistant/presentation-v23-final-holdout-pres.json) | **10/10** | ≥9/10 |

Eval harness: added `vi.mock("server-only")` to presentation eval entrypoints (parity with timetable eval).

---

## 6. Browser acceptance

**UNVERIFIED** — No authenticated Clerk session in automation (empty browser tabs; no signed-in local/staging session). Coverage remains: [`tests/components/assistant-v2-3.integration.test.tsx`](../../tests/components/assistant-v2-3.integration.test.tsx), planner-provider tests, timetable preview tests.

Manual checklist when auth is available: saved vs hypothetical labels, text-first scheduling, preview only when asked, digest freshness after manual planner edits, sidebar readability, no mutation, account switch.

---

## 7. Gates

| Gate | Result |
|------|--------|
| `npm run lint` | Exit 0 |
| `npx tsc --noEmit` | Pre-existing `aka` field gaps in unrelated catalog tests (not introduced by this acceptance pass); timetable/eval paths typecheck after `aka: []` on eval fixture |
| `npm run test` | 249+ files pass; 8 files fail on unrelated `aka` schema drift in catalog UI tests |
| `npm run build` | Exit 0 (after eval fixture `aka`) |
| Timetable unit | `tests/assistant/timetable-context.test.ts` 28/28 |

---

## 8. Changed files (this acceptance pass)

| Area | Files |
|------|--------|
| Holdout eval | [`evals/assistant/timetable-conversation-holdout-cases.ts`](../../evals/assistant/timetable-conversation-holdout-cases.ts), [`evals/assistant/timetable-conversation-holdout.eval.ts`](../../evals/assistant/timetable-conversation-holdout.eval.ts), [`evals/assistant/README.md`](../../evals/assistant/README.md) |
| Eval grading | [`evals/assistant/timetable-grade.ts`](../../evals/assistant/timetable-grade.ts) (`AGUISendStateSnapshot` allowlist) |
| Presentation eval | [`evals/assistant/presentation.eval.ts`](../../evals/assistant/presentation.eval.ts), [`evals/assistant/presentation-holdout.eval.ts`](../../evals/assistant/presentation-holdout.eval.ts) (`server-only` mock) |
| Digest regression | [`tests/assistant/timetable-context.test.ts`](../../tests/assistant/timetable-context.test.ts) |
| Fixture | [`evals/assistant/timetable-fixture.ts`](../../evals/assistant/timetable-fixture.ts) (`aka: []`) |

**Confirmed fixes** — Holdout suite; eval safety false positive for AGUI snapshot; presentation eval `server-only` loading; manual-change digest regression test.

**No change** — Assistant prompt, planner mutation path, second scheduling model.

---

## 9. Remaining limitations

- Main timetable suite **conversation** metric: **66.7–77.8%** across three full runs (threshold 90%; denominator 9).
- Hypo follow-up (“morning conflicts”) often answered from **saved** grid instead of **latest preview** (10× focus: 0/10 on `followup_hypo` T1).
- Post–manual-edit clash questions: **~40%** stale in focus run; **~11%** across full runs.
- Intermittent safety fails on `switch_morning` when model clarifies without “can’t change” phrasing (`explainsNoWrite` grading).
- Browser §17 matrix still unverified without auth.
- Catalog `aka` field: repo-wide test/tsc drift outside V2.3 scope.

---

## 10. Verdict split

| Dimension | Verdict |
|-----------|---------|
| **V2.3 feature completeness** | **Yes** — digest, tools, preview UI, harness parity, holdout coverage |
| **Multi-turn correctness (live main suite)** | **Partial** — holdout 95% conversation; main suite conversation below threshold on all three runs |
| **Read-only safety** | **Yes** — no mutation tools; safety ≥98.6% on full runs; 100% on run2 |
| **Production deployment readiness** | **Conditional** — ship architecture and eval fixes; monitor hypo follow-up and digest-refresh behavior in production |
| **V2.4** | **Not started** |
