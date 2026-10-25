# Assistant eval

Real-model checks of the assistant's tool use. Opt-in only: nothing here runs in `npm test`, and the live entry does nothing unless `ASSISTANT_EVAL=1`. Server tools read the fictional catalog in `catalog.ts`; `navigate` and `check_plan_conflicts` are simulated the way CopilotKit 1.79.1 runs frontend tools.

## Live run

```bash
ASSISTANT_EVAL=1 ASSISTANT_EVAL_LABEL=closure npm run eval:assistant -- evals/assistant/navigation.eval.ts
```

| Variable | Default | Meaning |
|---|---|---|
| `ASSISTANT_EVAL` | unset | Must be `1` to call the model. |
| `ASSISTANT_EVAL_LABEL` | `run` | Suffix of the result file name. |
| `ASSISTANT_EVAL_REPEATS` | `3` | Times each case runs. Must be a positive integer. |
| `ASSISTANT_EVAL_CASES` | all | Comma-separated case ids. An unknown id fails the run before any model call. |
| `ASSISTANT_EVAL_MAX_STEPS` | `200` | Global model-step budget for the whole invocation. |
| `ASSISTANT_EVAL_DELAY_MS` | `500` | Pause between cases. |
| `ASSISTANT_EVAL_MAX_OUTPUT_TOKENS` | production default (1200) | Output budget per step. A positive integer, or the run fails before any model call. |
| `ASSISTANT_EVAL_THINKING` | `off` | `off` or `low`. Anything else fails the run before any model call. |

`AI_API_KEY` and `AI_BASE_URL` come from the environment or `.env.local`. Model and `maxSteps` are always the production defaults.

Every provider request is audited (`runs[].requests` in the result file): model, `max_tokens`, `thinking`, `reasoning_effort`, tool names, and how many earlier assistant messages carried their `reasoning_content`, carried `""`, or had none. No prompt, reply or reasoning text is stored. A live run fails if any request differs from its settings (`requestMismatches`).

## Step budget and incomplete runs

- `ASSISTANT_EVAL_MAX_STEPS` is one budget shared by every case and repeat in the invocation, not a per-case limit.
- It is checked before each agent run. A run can then take up to `ASSISTANT_MAX_STEPS` (5) model steps, so `stepsUsed` can end up to 4 above the budget. A run that throws before reporting a step counts as 1.
- When the budget runs out, the case in progress is abandoned and its turns are discarded. Repeats are the outer loop, so the missing turns are always the last cases of the last repeat, and the partial summary is biased toward earlier cases.
- An incomplete run is still written, with `complete: false`, `stoppedEarly` and a file name ending in `-INCOMPLETE.json`, and the test then fails so the command exits non-zero. `report.eval.ts` refuses to print it.
- `stepsUsed` counts every model step spent, including discarded turns. `summary.limits.steps` counts only steps in graded turns.

## Counts

- Model requests: `summary.limits.steps`, one provider API call per step.
- Agent runs: `summary.limits.runs`, one CopilotKit run each (one `/api/copilotkit` request in production). A turn that calls a frontend tool takes one follow-up run per tool batch.

## Grading

`grade.ts` reports three navigation layers separately:

1. Tool selection, from the first `navigate` call: `correct`, `missed`, `invalid_arguments`, `wrong_destination` (or `unsolicited` on question turns).
2. Simulated navigation: a call to the expected page returned `navigated` or `already_here` and the turn ended on that page's path.
3. Task completion (`pass`): the end state. The page landed when one was needed, the lookups ran (before the landing call for compound requests), and the reply has no problems.

Reply language ignores exact official course titles from the fixture catalog. Any other Han text in an English reply counts as Chinese prose.

Semantic-action fields, reported alongside the three layers:

- `clarify` turns: the student wants a page but a value it needs has several valid answers (for example a reviews page for a course with two instructors). Any `navigate` call is `premature` and fails the turn. The turn passes only if the listed lookup ran, the reply names every option, names no other catalog instructor, and asks a question (`?` or `？`).
- `premature`: on clarify turns, any `navigate` call; on required turns with lookups, a first `navigate` call made before every lookup ran (reported, does not change completion).
- `substituted`: a `navigate` call to a different page type than the student asked for (`requestedPage`); fails the turn.
- `strayed`: the turn ended on a different page from where it started and not on the requested page ("Ended on a page not asked for").

Cases without `requestedPage` or `clarify` grade exactly as before.

`settings.eval` is a fingerprint of `grade.ts`, `catalog.ts` and the suite's cases. Results are comparable only when it matches.

## Regrade and report

```bash
ASSISTANT_REGRADE=.eval-results/assistant/A.json,.eval-results/assistant/B.json npm run eval:assistant -- evals/assistant/regrade.eval.ts
ASSISTANT_REPORT=.eval-results/assistant/<regrade>.json,.eval-results/assistant/<live>.json npm run eval:assistant -- evals/assistant/report.eval.ts
```

Regrading reads the saved traces and grades them under the current rules without calling the model. It writes a `kind: "regraded"` file that keeps the source's settings and lists turns the source never ran (`missing`). Report columns are titled `Regraded:` or `Live:`.

## Suites

| `ASSISTANT_EVAL_SUITE` | File | Purpose |
|---|---|---|
| `navigation` (default) | `cases.ts` | Phase 1 regression cases. |
| `tokens` | `token-cases.ts` | Long Traditional Chinese answers, output-budget pressure. |
| `multilingual` | `multilingual-cases.ts` | Phase 2 pilot: the same goals in English, Traditional Chinese, Cantonese, Korean, Japanese and mixed languages. |
| `smoke` | `smoke-cases.ts` | One thinking-mode continuation check: server tool, navigate follow-up run, later turn. |
| `semantic` | `semantic-cases.ts` | Holdout: eight student goals (information, open a page, reviews with a named instructor, with one instructor, with several, find then open, "this course" then a choice, a page the site cannot open) in English, Traditional Chinese, Cantonese, Korean, Japanese and a mixed-language variant. Never used to tune the prompt. |

Each suite has its own `settings.eval` fingerprint.

## Arm comparison

```bash
ASSISTANT_COMPARE=.eval-results/assistant/A.json,.eval-results/assistant/B.json,.eval-results/assistant/C.json \
ASSISTANT_EVAL_PRICE_INPUT_MISS=<usd> ASSISTANT_EVAL_PRICE_INPUT_HIT=<usd> ASSISTANT_EVAL_PRICE_OUTPUT=<usd> \
npm run eval:assistant -- evals/assistant/compare.eval.ts
```

List the files in arm order. With `ASSISTANT_COMPARE_VARY=inference` (default) each file must change exactly one of thinking mode and `maxOutputTokens` from the file before it (for example 400/off → 1200/off → 1200/low → 2000/low). With `ASSISTANT_COMPARE_VARY=prompt` each file must change only the prompt fingerprint, for before/after comparisons of a prompt change. Every file must be a complete live run of the same suite, cases, repeats, model, `maxSteps` and eval fingerprint. It also prints one intent × language pass table per arm. Prices are optional, in USD per million tokens; reasoning tokens are priced as output. It prints the JSON and a markdown table.

## Thinking mode (experimental)

Production and the preview worker run with `AI_THINKING=off`. `ASSISTANT_EVAL_THINKING=low` exists only to measure thinking in eval arms. Thinking mode is not supported for students:

- CopilotKit 1.79.1 drops `reasoning` messages from model history, so every frontend-tool follow-up run and every new turn sends `reasoning_content: ""` for earlier assistant messages. DeepSeek accepted this in the V1-E Phase 2 runs, but its documentation asks for full replay when tools are present. There is no replay code, on purpose.
- Phase 2 found no lift from low-effort thinking large enough to justify about 50% more cost, and English replies drifted into Chinese under it.
- Reconsider thinking, and only then build reasoning replay, if a controlled comparison on the semantic and multilingual suites shows thinking beating thinking-off by a margin fixed before the runs.

Safeguards that stay in place while thinking is off: the sidebar hides reasoning messages (`reasoningMessage` slot in `components/assistant/assistant-panel.tsx`, `tests/components/assistant-reasoning-hidden.test.tsx`), reasoning tokens are logged per step (`lib/assistant/metrics.ts`), and the provider and history contracts are pinned (`tests/assistant/thinking-provider-contract.test.ts`, `tests/assistant/thinking-history-contract.test.ts`).
