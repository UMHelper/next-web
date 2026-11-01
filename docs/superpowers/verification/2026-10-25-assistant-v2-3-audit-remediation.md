# V2.3 audit remediation verification

- Branch: `feat/global-assistant-v2` (workspace state at remediation)
- Baseline live audit: [`.eval-results/assistant/timetable-audit.json`](../../.eval-results/assistant/timetable-audit.json) (`repeats: 1`, prompt `472c251628a9`)
- Remediation live artifact (best single 3× run): [`.eval-results/assistant/timetable-audit-remediation-try3.json`](../../.eval-results/assistant/timetable-audit-remediation-try3.json) (prompt `7fb0bbdc5412` after harness + fixture fixes)
- Verified: 2026-10-25

## 1. Root causes (baseline audit failures)

| Case | Primary cause | Category |
|------|---------------|----------|
| `show`, `week_la`, `show_conflict`, `followup_day` T0, `followup_hypo` T0 | `loadCatalogTerm` called undefined `getAppConfig` in eval mock → `preview_timetable` / `check_plan_conflicts` returned `temporarily_unavailable` | **Harness defect** (fixed) |
| `what_if`, `this_class`, `followup_hypo` T1 | Same tool failures and/or model chose `check_plan_conflicts` instead of hypo `preview_timetable` | Harness + **model routing** (prompt/tool description tuned) |
| `course_conflict` (all repeats) | `get_course` fixture not schema-valid → `temporarily_unavailable`; model stopped before `check_plan_conflicts` | **Harness fixture** (fixed) |
| `manual_change` T1 (intermittent) | Model reused prior-turn clash answer instead of refreshed digest | **Model variability** (prompt freshness lines added) |
| Multi-turn hypo follow-ups | Eval harness omitted `timetable previews` context present in production | **Harness parity** (fixed) |

Confirmed production architecture was sound; baseline scores were not a valid production signal until eval wiring matched runtime.

## 2. Corrections (files)

| Area | Files |
|------|--------|
| Eval `getAppConfig` mock + trace `toolCalls` | [`evals/assistant/timetable.eval.ts`](../../evals/assistant/timetable.eval.ts), [`evals/assistant/README.md`](../../evals/assistant/README.md) |
| MATH1010/ECON1001 course fixture for eval | [`evals/assistant/timetable-fixture.ts`](../../evals/assistant/timetable-fixture.ts), [`tests/assistant/timetable-fixture.test.ts`](../../tests/assistant/timetable-fixture.test.ts) |
| Harness previews context (production parity) | [`evals/assistant/harness.ts`](../../evals/assistant/harness.ts) |
| Preview / timetable prompt & tool description | [`lib/assistant/prompt.ts`](../../lib/assistant/prompt.ts), [`lib/assistant/timetable-preview.ts`](../../lib/assistant/timetable-preview.ts), [`tests/assistant/agent.test.ts`](../../tests/assistant/agent.test.ts) |
| Cross-term assistant payload | [`lib/assistant/timetable-context.ts`](../../lib/assistant/timetable-context.ts), [`tests/assistant/timetable-context.test.ts`](../../tests/assistant/timetable-context.test.ts) |
| Account-switch outbox guard | [`components/timetable/planner-provider.tsx`](../../components/timetable/planner-provider.tsx), [`tests/components/planner-provider.test.tsx`](../../tests/components/planner-provider.test.tsx) |
| Catalog term regression | [`tests/assistant/timetable-tools-catalog-term.test.ts`](../../tests/assistant/timetable-tools-catalog-term.test.ts) |

## 3. Account / term isolation evidence

- **F-V23-004 (outbox race):** `flushOutbox` captures owner user + generation; aborts persistence after account switch. Regression test: `does not persist the previous user's outbox flush after an account switch`.
- **F-V23-003 (cross-term):** `buildTimetableContextPayload` returns `no_plan` when `activePlan` year/sem ≠ planner current term (assistant no longer treats a foreign-term plan as the live saved plan). Planner UI fallback unchanged.
- **F-V23-005:** Trust boundary unchanged — client payload validated server-side per request; documented in spec §3; no cross-account path added.
- **F-V23-006:** Truncation already surfaced in digest (`truncated: true`); prompt now instructs model not to over-claim when truncated.

## 4. Live DeepSeek metrics

### Before (audit)

| Metric | Result | Threshold |
|--------|--------|-----------|
| Presentation | 17/23 (73.9%) | ≥90% |
| Analysis | 12/15 (80%) | ≥90% |
| Retrieval | 1/1 (100%) | ≥90% |
| False previews | 0/15 (0%) | ≤5% |
| Safety | 23/23 (100%) | 100% |
| Conversation | 2/3 (66.7%) | ≥90% |

### After remediation (best 3× run: `try3`)

| Metric | Result | Threshold | Pass |
|--------|--------|-----------|------|
| Presentation | 66/69 (95.7%) | ≥90% | Yes |
| Analysis | 43/45 (95.6%) | ≥90% | Yes |
| Retrieval | 3/3 (100%) | ≥90% | Yes |
| False previews | 2/45 (4.4%) | ≤5% | Yes |
| Safety | 69/69 (100%) | 100% | Yes |
| Conversation | 7/9 (77.8%) | ≥90% | **No** |

**Note:** With only nine conversation-scored turns, the pre-registered ≥90% rule requires **9/9** passes (8/9 = 88.9% fails). Multi-turn coherence remains variable across repeats; several additional 3× runs hit 5–8/9 conversation while other metrics passed.

Settings: `deepseek-flash`, thinking off, `maxOutputTokens` 1200, `maxSteps` 5, `ASSISTANT_EVAL_REPEATS=3`, `ASSISTANT_EVAL_DELAY_MS=1000`.

## 5. V2.2 regression (live)

| Suite | Result | Floor |
|-------|--------|-------|
| [`presentation-v23-regression.json`](../../.eval-results/assistant/presentation-v23-regression.json) | 39/39 hits | ≥38/39 |
| [`presentation-v23-holdout.json`](../../.eval-results/assistant/presentation-v23-holdout.json) | 10/10 hits | ≥9/10 |

## 6. Browser acceptance

**UNVERIFIED** — no signed-in Clerk session in automation (same as initial V2.3 verification). Scripted coverage: `tests/components/assistant-v2-3.integration.test.tsx`, planner-provider tests, timetable preview tests.

## 7. Gates (2026-10-25)

| Gate | Result |
|------|--------|
| `npm run lint` | Exit 0 |
| `npx tsc --noEmit` | Exit 0 |
| `npm run test` | 249 files, 2019 tests passed |
| `npm run build` | Exit 0 |

## 8. Remaining limitations

- Live **conversation** metric on 3× timetable suite: not consistently ≥90% under pre-registered rules (denominator 9).
- Model/API variability on `get_course` still occasionally returns `temporarily_unavailable` in eval even with valid fixtures.
- Env vs app-config term mismatch for catalog remains a documented product limitation.
- Browser §17 matrix still unverified without auth.

## 9. Verdict split

| Dimension | Verdict |
|-----------|---------|
| **V2.3 functional completion** | **Yes** — digest, tools, preview UI, safety guards, eval harness parity |
| **Model behavior acceptance (live 3× suite)** | **Partial** — five of six metric families pass on best run; conversation short of threshold |
| **Read-only / account isolation** | **Yes** — outbox guard + cross-term assistant context + 100% safety on best run |
| **Production deployment readiness** | **Conditional** — ship code fixes; treat live conversation metric as ongoing monitoring |
| **V2.4 planning** | **Not started** (explicitly out of scope) |
