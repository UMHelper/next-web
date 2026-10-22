# Assistant V1-E Phase 1 closure: evaluation quality

- Branch: `feat/global-assistant-v1`
- Grading freeze commit: `c54eaa9`; eval fingerprint `c006b0c1ecb4`
- Prompt fingerprints: baseline `e4f5f5b5a758`, Phase 1 revised `3352ad96465d`, closure `a7e7a95663e0`
- Model settings (production defaults): `deepseek-flash`, thinking off, 400 output tokens per step, `maxSteps` 5

## 1. What changed in grading

- Navigation has three separate layers. Tool selection is judged on the first `navigate` call: missed, invalid arguments, wrong page, or correct. Simulated navigation needs a call to the expected page that returned `navigated` or `already_here`, and the turn has to end on that page's path. Task completion is judged on the end state, the required lookups, and the reply. Calling `navigate` no longer counts as completing the task.
- The reply-language check ignores exact official course titles from the fixture catalog (`EVAL_CATALOG_FACTS.officialTitles`). Any other Han text in an English reply is still a failure. A Simplified rendering or a fragment of a title is not exempt.
- "Show me CISC3014" now requires navigation (section 2). New case `info-about-course-en` ("What is CISC3014 about?") forbids it.
- Regression tests for `not_found`, `invalid_destination`, `timeout`, `landed_elsewhere`, a wrong final path, a missing result, and a retry that lands: `tests/assistant/eval-grade.test.ts`.

## 2. Product rule: being shown a page versus asking about it

When the student asks to be shown, or to see, a specific course, instructor or their reviews that the assistant can identify, the assistant opens that page with `navigate`, even if the message does not contain the word "page". When the student asks what a course or instructor is, what it covers, or any other question about it, the assistant answers with lookups and links and does not navigate. When the assistant cannot tell which of the two the student wants, it answers and includes the link. The rule lives in the prompt; there is no keyword routing in code and `toolChoice` stays unset.

Prompt change: one sentence in the "To be on a page" bullet (commit `fa3ede9`). Decision from Task 4 Step 14: **kept**, with pooled counts — `ambiguous-show-me-en` landed **4/8** (closure 0/3, targeted 4/5; keep rule needed ≥6/8; the four misses called `get_course` only and did not navigate); `info-about-course-en` **0** unsolicited navigations in **8** turns (all 8 passed); closure `summary.unsolicited.navigated` **0**. The 4/8 shortfall is a genuine agent failure; prompt wording was not changed.

## 3. Results

Regraded columns are the Phase 1 traces graded again under the frozen rules, with no new model calls. Live columns are new DeepSeek runs from 2026-10-22. The regraded runs have 42 turns because `info-about-course-en` did not exist then (`missing: info-about-course-en#1: 0/3`); the closure run has 45.

| Metric | Regraded: baseline (prompt e4f5f5b5a758, eval c006b0c1ecb4) | Regraded: revised (prompt 3352ad96465d, eval c006b0c1ecb4) | Live: closure (prompt a7e7a95663e0, eval c006b0c1ecb4) |
|---|---|---|---|
| Task completion (turns passed) | 29/42 | 38/42 | 40/45 |
| Tool selection: required navigate correct | 24/30 | 27/30 | 26/30 |
| Tool selection: missed (omissions) / invalid arguments / wrong page | 3 (3) / 3 / 0 | 3 (3) / 0 / 0 | 3 (3) / 0 / 1 |
| Unsolicited navigation | 0/12 | 0/12 | 0/15 |
| Simulated navigation landed (required turns) | 24/30 | 27/30 | 26/30 |
| First navigate status (required turns) | invalid_destination: 3, navigated: 24, no_call: 3 | navigated: 27, no_call: 3 | navigated: 27, no_call: 3 |
| Academic tools correct | 15/15 | 15/15 | 18/18 |
| Compound requests complete | 3/3 | 3/3 | 3/3 |
| Language correct | 36/42 | 42/42 | 44/45 |
| Replies without problems | 35/42 | 41/42 | 44/45 |
| Truncated turns (finish: length) | 1/42 | 1/42 | 0/45 |
| Finish reasons (steps) | length: 1, stop: 41, tool-calls: 46 | length: 1, stop: 41, tool-calls: 52 | stop: 45, tool-calls: 50 |
| Model requests: steps graded / steps used | 88 / 88 | 94 / 94 | 95 / 95 |
| Agent runs: total (mean / max per turn) | 69 (1.64 / 2) | 69 (1.64 / 2) | 72 (1.60 / 2) |
| Most steps in one run / maxSteps hits | 3 / 0 | 3 / 0 | 2 / 0 |
| Latency p50 / p90 | 2328 ms / 3143 ms | 2227 ms / 3067 ms | 3558 ms / 5223 ms |
| Input tokens (cached) / output tokens | 249912 (217469) / 6278 | 293280 (251370) / 7350 | 295830 (260327) / 6659 |
| Most output tokens in one step | 400 | 400 | 286 |

Targeted show-versus-ask run (live, 5 repeats):

| Metric | Live: closure-show-me (prompt a7e7a95663e0, eval c006b0c1ecb4) |
|---|---|
| Task completion (turns passed) | 9/10 |
| Tool selection: required navigate correct | 4/5 |
| Tool selection: missed (omissions) / invalid arguments / wrong page | 1 (1) / 0 / 0 |
| Unsolicited navigation | 0/5 |
| Simulated navigation landed (required turns) | 4/5 |
| First navigate status (required turns) | navigated: 4, no_call: 1 |
| Academic tools correct | 5/5 |
| Compound requests complete | 0/0 |
| Language correct | 10/10 |
| Replies without problems | 10/10 |
| Truncated turns (finish: length) | 0/10 |
| Finish reasons (steps) | stop: 10, tool-calls: 11 |
| Model requests: steps graded / steps used | 21 / 21 |
| Agent runs: total (mean / max per turn) | 14 (1.40 / 2) |
| Most steps in one run / maxSteps hits | 2 / 0 |
| Latency p50 / p90 | 4116 ms / 5190 ms |
| Input tokens (cached) / output tokens | 64960 (61304) / 1673 |
| Most output tokens in one step | 176 |

## 4. How the regrade moved the Phase 1 numbers

Phase 1 record ([2026-10-22-assistant-v1e-phase1.md](2026-10-22-assistant-v1e-phase1.md) section 5): baseline **26/42**, revised **36/42** under the Phase 1 grader. Regrades under frozen closure rules: baseline **29/42** (+3), revised **38/42** (+2).

**Baseline (+3):** Only three turns changed from fail to pass — `compound-find-then-open-en` repeats 0, 1, and 2. In the saved traces the model already called `search_catalog` then `navigate` to course CISC3014 and the turn ended on `/course/CISC3014`. The Phase 1 grader marked those turns failed for `reply contains Chinese` (catalog titles embedded in English). The closure grader exempts exact official titles from the language check, so `responseProblems` cleared. The closure grader also requires simulated navigation to land (`landed: true`); these turns satisfy that. No other baseline turn flipped pass state: `nav-show-reviews-page-en` stays 0/3 (reviews without instructor is `invalid_arguments`, not a pass under either grader); `ambiguous-show-me-en` stays 0/3 — under closure rules it is a **show-me expectation** failure (`selection missed`, `get_course` only) whereas Phase 1 treated navigation as optional and failed the same repeats mainly on language.

**Revised (+2):** Two turns changed — `compound-find-then-open-en` repeats 0 and 2 (repeat 1 was already pass in Phase 1). Same mechanism as baseline: title exemption removed `reply contains Chinese` on traces that already navigated and landed. All other per-turn pass counts match Phase 1 section 5, including `ambiguous-show-me-en` 0/3 (closure **show-me expectation** now fails missed `navigate` where Phase 1 optional allowed lookup-only turns that failed only on language) and `nav-show-reviews-page-en` 3/3 on revised.

Metric layers shift without changing pass count on some turns: baseline regrade reports three `invalid_destination` / `invalid_arguments` on `nav-show-reviews-page-en` instead of Phase 1 “wrong destination” counts; regraded `simulatedNavigation.landed` and tool-selection buckets reflect the three-layer grader even when pass count is unchanged.

## 5. Step budget and completeness

From `evals/assistant/README.md`: `ASSISTANT_EVAL_MAX_STEPS` is one budget shared by every case and repeat. It is checked before each agent run; a run may consume up to `ASSISTANT_MAX_STEPS` (5) steps afterward, so `stepsUsed` can exceed the budget by up to four. When the budget is exhausted, the in-progress case is abandoned (turns discarded), biasing partial summaries toward earlier cases. Incomplete runs write `complete: false` and a `-INCOMPLETE.json` name; the live test fails.

| Run | `stepBudget` | `stepsUsed` | `complete` | Graded turns |
|---|---:|---:|---|---:|
| closure | 200 | 95 | true | 45 |
| closure-show-me | 60 | 21 | true | 10 |
| closure-smoke | 6 | 3 | true | 1 |

All three live runs finished with `complete: true` and no `stoppedEarly`.

## 6. Remaining genuine agent failures

One line per failing live turn from `failures` in `.eval-results/assistant/2026-10-22T13-21-34-233Z-closure.json` and `.eval-results/assistant/2026-10-22T13-24-45-361Z-closure-show-me.json`.

**Missed or wrong navigation** (repeats across repeats on `ambiguous-show-me-en`; one-off on `nav-show-reviews-page-en`)

- ambiguous-show-me-en repeat 0 turn 1: get_course {"code":"CISC3014"}; reply "I'll look that up. **CISC3014 – Database Systems (資料庫系統)** - 3 credits, FST / CIS, undergraduate, taught in English - Co"; selection missed, status none, landed false; problems: none
- ambiguous-show-me-en repeat 1 turn 1: get_course {"code":"CISC3014"}; reply "Here is CISC3014 on the site. **CISC3014 — Database Systems (資料庫系統)** - 3 credits, FST / CIS, undergraduate, taught in E"; selection missed, status none, landed false; problems: none
- ambiguous-show-me-en repeat 2 turn 1: get_course {"code":"CISC3014"}; reply "I'll look that up. **CISC3014: Database Systems (資料庫系統)** - 3 credits, FST / CIS, undergraduate, taught in English - Des"; selection missed, status none, landed false; problems: none
- ambiguous-show-me-en repeat 2 turn 1: get_course {"code":"CISC3014"}; reply "I'll look up that course for you. **CISC3014 – Database Systems 資料庫系統** - 3 credits, FST / CIS, undergraduate, taught in"; selection missed, status none, landed false; problems: none
- nav-show-reviews-page-en repeat 1 turn 1: navigate {"destination":"course","code":"CISC3014"}; reply "I've taken you to the CISC3014 course page, where you can pick an instructor to see their reviews."; selection wrong_destination, status navigated, landed false; problems: none

**Navigation that did not land**

- No failing turns listed separately; the five lines above already record `landed false` where navigation did not reach the expected page.

**Chinese prose in English replies** (appears once)

- nav-open-en repeat 0 turn 1: navigate {"destination":"course","code":"CISC3014"}; reply "已打开 CISC3014 的课程页面。"; selection correct, status navigated, landed true; problems: reply contains Chinese

**Simplified versus Traditional script** (read by hand: the grader does not check script)

- No failing turns in these runs.

**`finish: length`**

- No failing turns in these runs.

**Missing lookups**

- No failing turns in these runs.

## 7. Phase 2 recommendation

Run **arm A only** of the token suite first (`ASSISTANT_EVAL_SUITE=tokens`, `ASSISTANT_EVAL_MAX_OUTPUT_TOKENS=400`, 5 repeats); run arms B (800) and C (1,200) only if arm A shows `finish: length` on answer steps. Do not run all three arms up front: the 2026-10-22 live closure run had no truncation, while regraded Phase 1 traces still show the historical hit on the comparison case.

Evidence (from Task 4 JSON, not edited):

| Run | `truncatedTurns` | `finishCounts.length` | `maxStepOutputTokens` | Truncation detail |
|---|---:|---:|---:|---|
| Regraded baseline (`2026-10-22T13-18-26-419Z-regrade-baseline.json`) | 1/42 | 1 | 400 | `info-compare-zh-hant` repeat 2 (`grades[].limits.truncated`) |
| Regraded revised (`2026-10-22T13-18-26-422Z-regrade-revised.json`) | 1/42 | 1 | 400 | same case and repeat |
| Live closure (`2026-10-22T13-21-34-233Z-closure.json`) | 0/45 | 0 | 286 | none |

The three live verification runs also had no `finish: length`: `2026-10-22T13-21-20-859Z-closure-smoke.json` (`truncatedTurns` 0, finishCounts `tool-calls`/`stop` only, `maxStepOutputTokens` 147), `2026-10-22T13-21-34-233Z-closure.json` (above), and `2026-10-22T13-24-45-361Z-closure-show-me.json` (`truncatedTurns` 0/10, finishCounts `tool-calls`/`stop` only, `maxStepOutputTokens` 176).

Required-navigation misses (`toolSelection.omissions` 3 on closure, 1 on closure-show-me) did not coincide with `maxStepsHit` or truncation: all live runs had `maxStepsHits` 0 and no graded turn with both `toolSelection.missed` and `limits.truncated`.

Keep production `maxSteps` at 5 for Phase 2; no run hit the step cap.

Full experiment design: [Phase 2 design](../specs/2026-10-22-assistant-v1e-phase2-token-budget-design.md).

## 8. Automated checks

Written in Task 6.
