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
| `ASSISTANT_EVAL_MAX_OUTPUT_TOKENS` | production default (400) | Output budget per step. Only for the Phase 2 comparison. |

`AI_API_KEY` and `AI_BASE_URL` come from the environment or `.env.local`. Model, thinking mode and `maxSteps` are always the production defaults.

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

`settings.eval` is a fingerprint of `grade.ts`, `catalog.ts` and the suite's cases. Results are comparable only when it matches.

## Regrade and report

```bash
ASSISTANT_REGRADE=.eval-results/assistant/A.json,.eval-results/assistant/B.json npm run eval:assistant -- evals/assistant/regrade.eval.ts
ASSISTANT_REPORT=.eval-results/assistant/<regrade>.json,.eval-results/assistant/<live>.json npm run eval:assistant -- evals/assistant/report.eval.ts
```

Regrading reads the saved traces and grades them under the current rules without calling the model. It writes a `kind: "regraded"` file that keeps the source's settings and lists turns the source never ran (`missing`). Report columns are titled `Regraded:` or `Live:`.
