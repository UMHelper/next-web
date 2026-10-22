# Assistant V1-E Phase 2: output-token budget experiment

## Question

Does raising the per-step output budget from 400 to 800 or 1,200 tokens remove `finish: length` truncation on long Traditional Chinese comparisons and explanations, and what does it cost in latency, tokens and reply length?

## Arms

| Arm | `ASSISTANT_EVAL_MAX_OUTPUT_TOKENS` |
|---|---|
| A (control, production default) | 400 |
| B | 800 |
| C | 1200 |

## Held constant

The prompt (same `settings.prompt`), tools and schemas, fixture catalog and suite (same `settings.eval`), model `deepseek-flash`, thinking off, `maxSteps` 5, history shaping, repeats, case order, and the eval harness commit. `compare.eval.ts` refuses files that differ in any of these. Not in this experiment: raising `maxSteps`, switching models, enabling thinking mode, changing the prompt.

## Suite

`ASSISTANT_EVAL_SUITE=tokens` (`evals/assistant/token-cases.ts`):

| Case | Page | Student message | Why |
|---|---|---|---|
| info-compare-zh-hant | `/course/CISC2001` | CISC2001 和 CISC3014 哪門比較輕鬆？ | The only Phase 1 truncation (400 tokens after four lookups). |
| tokens-compare-instructors-zh-hant | `/course/CISC2001` | 這門課的 WONG KA KI 和 LI MEI 哪位比較適合我？請比較評分、給分、出席和學生評價。 | Instructor comparison on two reviews lookups. |
| tokens-explain-course-zh-hant | `/` | 請詳細介紹 CISC3014：課程內容、學分、授課老師、學生評價和上課時間。 | Long explanation over three lookups. |
| tokens-explain-course-en | `/` | Give me a detailed overview of CISC3014: ... | English control: separates language from length. |

## Procedure

1. Ask the user to approve the budget: 4 turns × 5 repeats = 20 turns per arm. These cases use 2 or 3 steps per turn, so about 50–70 steps per arm, capped at 120 per invocation. That is about 150–210 steps for the three arms, at most 360.
2. Run the three arms one after another in the same session, in the order A, B, C, from the same commit:
   `ASSISTANT_EVAL=1 ASSISTANT_EVAL_SUITE=tokens ASSISTANT_EVAL_REPEATS=5 ASSISTANT_EVAL_MAX_STEPS=120 ASSISTANT_EVAL_MAX_OUTPUT_TOKENS=<400|800|1200> ASSISTANT_EVAL_LABEL=tokens-<400|800|1200> npm run eval:assistant -- evals/assistant/navigation.eval.ts`
   Each must exit 0 with `complete: true`. An incomplete arm voids the comparison: do not compare partial arms.
3. Take the three prices from the provider's price page on the day of the runs and record the URL and date. Run `compare.eval.ts` on the three files.
4. Read every reply of the longest case per arm by hand, using the rubric below.

## Metrics

From `compare.eval.ts`, per arm and per case:
- Completion: turns passed (task completion) and the reply rubric.
- Truncation: `lengthSteps` and `truncatedTurns`.
- Output tokens: total, and answer-step p50, p90 and max.
- Latency: turn p50 and p90.
- Cost: `costUsd` for the arm, and the same divided by turns.
- Reply length: `replyChars` p50 and p90.

Reply rubric, scored by hand for each reply as yes or no: covers every fact the student asked for; ends cleanly (not cut mid-sentence or mid-list); follows rule 11's sidebar format (bold line per item, two to four bullets, "Suggestion:" line); has no facts that are not in the tool results.

## Decision rule

Pick the smallest arm that:
1. has no `finish: length` on answer steps across its 20 turns, and
2. does not drop any case by 2 or more passes out of 5 compared with arm A, and
3. keeps reply-length p90 for each case within 1.5× arm A's, unless the extra length is the content that A cut off.

If no arm meets the rule, recommend none and report which condition failed. If B and C both meet it, pick B. Report the latency and cost difference against A as a trade-off for the user to decide. Do not choose an arm on latency or cost alone.

## After the decision

Changing the production `AI_MAX_OUTPUT_TOKENS` default is a separate change that needs the user's approval. Before it, run the full navigation suite (`ASSISTANT_EVAL_SUITE=navigation`, 3 repeats) at the chosen budget and confirm task completion, unsolicited navigation and language correctness have not got worse than the closure run.

## Noise and limits

Five repeats per case at the provider's default temperature means a difference of one pass is noise. Arms run in sequence, so latency can drift with provider load; compare latency within a session only. The fixture catalog is small, so real catalog replies may be longer.
