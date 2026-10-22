# Assistant V1-E Phase 2: low-budget reasoning and multilingual intelligence

- Branch: `feat/global-assistant-v1`; started from `0600f52`; grading freeze `e24c66fc3a72cebab5d2e006579a8a3ff8f45787`
- Prompt fingerprint `a7e7a95663e0` (unchanged); eval fingerprints: multilingual `fa7545dad300`, navigation `a6a57c6bcc8c`, smoke `4c943288d13f`, tokens/probe `215956d43595`
- Runs on 2026-10-22; prices from https://api-docs.deepseek.com/quick_start/pricing on 2026-10-22 (off-peak used for cost estimates): input miss $0.15, input hit $0.003, output $0.60 per million tokens (peak is double; no separate thinking-mode price on the page). Paid runs approved for smoke, probe, and arms A–C (D not triggered).

## 1. Thinking-mode SDK compatibility

| Check | Finding | Status |
|---|---|---|
| Versions | `@ai-sdk/deepseek` 2.0.76, `ai` 6.0.309, `@copilotkit/runtime` 1.79.1, `@copilotkit/react-core` 1.79.1 | confirmed by `tests/assistant/dependency-contract.test.ts` |
| Thinking on | `thinkingProviderOptions("low")` → DeepSeek `thinking: {type:"enabled"}`, `reasoning_effort: "low"` | confirmed by `tests/assistant/thinking-provider-contract.test.ts` and live `p2-smoke-low` (5/5 requests: enabled + low) |
| Thinking off | `thinking: {type:"disabled"}`, no `reasoning_effort` | confirmed by `tests/assistant/thinking-provider-contract.test.ts` and live `p2-smoke-off` (5/5 requests: disabled, effort null) |
| Output budget | `maxOutputTokens` → provider `max_tokens` | confirmed by request audits on all three live arms |
| Token usage | Provider splits reasoning vs text; metrics log total output only | confirmed by `tests/assistant/thinking-provider-contract.test.ts` (usage translation) and `tests/assistant/metrics.test.ts` |
| History across runs | CopilotKit omits `role: "reasoning"` from model history; follow-ups send `reasoning_content: ""` when history lacks reasoning | confirmed by `tests/assistant/thinking-history-contract.test.ts`, `tests/assistant/thinking-provider-contract.test.ts`, and live audits (`reasoningEmpty` / `reasoningReplayed` counts below) |
| DeepSeek requirement | Doc requires full `reasoning_content` replay with tools; empty string acceptance unknown until smoke | confirmed by live `p2-smoke-low`: HTTP 200 throughout with `reasoningEmpty ≥ 1` on continuation and later turns (see §7) |
| Shaping | `shapeConversation` keeps reasoning in-window | confirmed by `tests/assistant/conversation.test.ts` |
| Request limits | Reasoning messages count toward run message/byte caps | not measured in Task 8 (Task 9) |
| Frontend display | Default CopilotKit renders reasoning; app hides it | confirmed by `tests/components/assistant-reasoning-hidden.test.tsx` and `components/assistant/assistant-panel.tsx` (`reasoningMessage: Hidden`) |
| Persistence | Client-resend history only; route logs counts | unchanged from static findings (no new run) |
| Timeout | 30 s per step | live max step 1687 ms (`p2-probe-low-200`); gate item 6 max 1472 ms (`p2-smoke-low`) |
| Fixture overlap | `CHAN TAI MAN` in tool schema example | documented only (unchanged) |

Provider-level thinking support works on `deepseek-flash`: the SDK sends the configured mode on every audited request. Effort control is real for the low arm: every `p2-smoke-low` and `p2-probe-low-200` request carried `reasoning_effort: "low"`, not the provider default high.

## 2. Effective DeepSeek request settings

From request audits (counts only; no message bodies):

| Arm | `model` | `stream` | `max_tokens` | `thinking` | `reasoning_effort` | `tool_choice` | Tool names (stable set) |
|---|---|---|---|---|---|---|---|
| `p2-smoke-off` | deepseek-flash | true | 1200 | `{type:"disabled"}` | absent (null in audit) | auto | AGUISendStateDelta, AGUISendStateSnapshot, check_plan_conflicts, get_course, get_course_reviews, get_course_sections, get_instructor, navigate, search_catalog |
| `p2-smoke-low` | deepseek-flash | true | 1200 | `{type:"enabled"}` | low | auto | same nine tools |
| `p2-probe-low-200` | deepseek-flash | true | 200 | `{type:"enabled"}` | low | auto | same nine tools |

All three runs: `settings.prompt` = `a7e7a95663e0`, `requestMismatches: []`.

**Whether `max_tokens` covers reasoning (Task 8 Step 7):** On `p2-probe-low-200`, no step reported `outputTokens > 200`; the step that ended `finish: length` had `outputTokens=200` and `reasoningTokens=88`. Reasoning and visible completion share the `max_tokens` ceiling, so low budgets can truncate answers via `finish: length` when reasoning consumes part of the cap.

Live pilot arms (`p2-ml-*`, `p2-nav-*`) matched the same tool set and `tool_choice: auto`; A used `thinking: disabled` and `max_tokens: 400`, B `disabled` / 1200, C `enabled` + `reasoning_effort: low` / 1200, all with `settings.prompt` = `a7e7a95663e0` and `requestMismatches: []`.

## 3. Multilingual evaluation cases

Thirteen pilot cases (26 turns with two repeats), all starting from fictional catalog data:

| id | language | intent | category | start page | student message (abbrev.) | expected end state |
|---|---|---|---|---|---|---|
| `ml-course-page-ko` | ko | course-page | natural | `/course/CISC2001` | CISC3014 과목 페이지 보고 싶어요 | `/course/CISC3014`, Korean reply |
| `ml-course-page-ja` | ja | course-page | natural | `/` | CISC3014の授業ページが見たいです | `/course/CISC3014`, Japanese reply |
| `ml-course-page-en` | en | course-page | natural | `/` | Could I **check out** the CISC3014 page? | `/course/CISC3014`, English reply |
| `ml-course-info-ja` | ja | course-info | information | `/` | CISC3014ってどんなことを学ぶ授業ですか？ | no navigation; `get_course`; Japanese reply |
| `ml-course-info-yue-en` | mixed-yue-en | course-info | information | `/` | CISC3014 主要教咩 content 㗎？ | no navigation; lookup; Cantonese/Chinese reply |
| `ml-reviews-page-here-ja` | ja | reviews-page | current-page | `/course/CISC3014` | この授業の口コミのページに行きたいな | reviews page for CHAN TAI MAN |
| `ml-reviews-page-ko-en` | mixed-ko-en | reviews-page | natural | `/` | CISC3014 review page 좀 보고 싶어요 | instructor reviews page, Korean reply |
| `ml-reviews-which-instructor-zh-hant` | zh-hant | reviews-page-instructor-unknown | missing-parameter | `/` | 我想看 CISC2001 的評價頁面 | no navigation; name both instructors |
| `ml-compare-here-ko` | ko | compare | comparison | `/course/CISC2001` | 이 과목이랑 CISC3014 중에… | compare both courses, Korean reply |
| `ml-find-then-open-ja` | ja | find-then-open | compound | `/` | データベース関係の授業ってある？… | `search_catalog` then course page |
| `ml-review-injection-ko` | ko | reviews-info | injection | `/` | CHAN TAI MAN 교수님 CISC3014 수업 후기… | no navigation; ignore injected instructions |
| `ml-missing-course-zh-hant` | zh-hant | missing-course-page | unavailable | `/` | 我想看 CISC9999 這門課的頁面 | stay off fake course |
| `ml-how-is-it-yue` | yue | ambiguous-course | ambiguous | `/` | CISC3014 呢科點呀？ | optional navigation or informative reply |

The production prompt lists English navigation verbs and Traditional Chinese guidance but does **not** document Korean, Japanese, or the English paraphrase **“check out”** (case `ml-course-page-en`). The `get_course_reviews` schema example names **CHAN TAI MAN** on CISC3014—the same instructor the lookup cases require; this overlap is held constant across arms, not fixed in this phase.

## 7. Thinking-mode continuation verification

### Commands and result files

| Step | Command label | Exit | Result file |
|---|---|---|---|
| 4 | `p2-smoke-off` | 0 | `.eval-results/assistant/2026-10-22T15-01-12-787Z-p2-smoke-off.json` |
| 5 | `p2-smoke-low` | 0 | `.eval-results/assistant/2026-10-22T15-01-23-784Z-p2-smoke-low.json` |
| 7 | `p2-probe-low-200` | 0 | `.eval-results/assistant/2026-10-22T15-01-42-798Z-p2-probe-low-200.json` |

### Gate (applied to `p2-smoke-low` only)

| # | Criterion | Result |
|---|---|---|
| 1 | Exit 0, `complete: true`, `requestMismatches: []`; every request `thinking` enabled, effort low, `max_tokens` 1200 | pass (5/5 requests) |
| 2 | No run `error` | pass (3 runs, all `error=none`) |
| 3 | Turn 1 ≥2 runs; turn 2 ≥1 step | pass (turn 1: 2 runs; turn 2: 2 steps) |
| 4 | Some `reasoningTokens > 0`; all steps `outputTokens ≥ reasoningTokens` | pass (42 reasoning tokens total; min ratio on steps with reasoning: 74≥18, 71≥16, 50≥8) |
| 5 | Continuation pattern: `reasoningEmpty ≥ 1`; server tool before navigate → `reasoningReplayed ≥ 1` in same run | pass (turn 1 run 2: `empty=1`; turn 1 run 1 request 2: `replayed=1` after `search_catalog`) |
| 6 | Largest step `ms` < 30 000 | pass (max 1472 ms) |

`p2-smoke-off` checks: 5/5 requests `thinking` disabled, effort null; 0 reasoning tokens on all steps.

### Run anatomy (counts)

**`p2-smoke-off`:** Turn 1: `/` → `/course/CISC3014`; tools `search_catalog`, `navigate`; 2 runs (continuation after navigate); 3 steps, 0 reasoning tokens. Turn 2: on course page; `get_course`; 1 run, 2 steps, 0 reasoning tokens.

**`p2-smoke-low`:** Turn 1: same navigation path; 2 runs; run 1 steps reasoning 18/0, run 2 step reasoning 16; 1 reasoning message added per run. Turn 2: `get_course`; 1 run, 2 steps (reasoning 8 then 0); 1 reasoning message added.

**`p2-probe-low-200`:** 1 turn, 1 run, 3 steps (70+28, 130+10, 200+88 tokens); `finish: length` on step 3; 3 reasoning messages added; grade failed on truncation (expected).

### `reasoning_content` replay / empty / absent (per request)

**`p2-smoke-low`:** Turn 1 run 1 — req1: replayed 0, empty 0; req2: replayed 1, empty 0 (in-run replay after server tool). Turn 1 run 2 (continuation) — req1: replayed 0, empty 1. Turn 2 — req1: replayed 0, empty 2; req2: replayed 1, empty 2.

**`p2-smoke-off`:** Later requests show `reasoningEmpty` 1–3 with zero replay (thinking off).

DeepSeek **accepted** `reasoning_content: ""` on continuation and multi-turn requests (no `APICallError`, no HTTP 400), despite the documented full-replay requirement when tools are present.

### Production effect

Each frontend-tool continuation and each new student turn reaches the model without prior reasoning parts in CopilotKit’s converted history, so production `/run` boundaries behave like turn 1 run 2 and turn 2 request 1 above: empty reasoning slots unless the prior step’s reasoning is still inside the same agent run (server-tool steps replay real content, as in turn 1 request 2).

### Request-limit projection (qualitative)

Smoke turn 2 with thinking low added 5 messages / 1539 B for one user turn (including reasoning role messages resent on the run). A 30-turn thread with thinking on will scale those counts roughly linearly; Task 9 compares against `MAX_RUN_MESSAGES` (200) and `MAX_RUN_BODY_BYTES` (256 KiB).

### Sidebar (Task 3)

Without the panel override, CopilotKit would render each `role: "reasoning"` message as a collapsible “Thinking…” block (`tests/components/assistant-reasoning-hidden.test.tsx`). With `reasoningMessage: Hidden`, students do not see raw chain-of-thought in the sidebar during live use.

## 4. Live arm comparison (Task 9)

### Multilingual suite — compare (`armTable`)

| Metric | p2-ml-A | p2-ml-B | p2-ml-C |
|---|---|---|---|
| Thinking / output budget | off / 400 | off / 1200 | low / 1200 |
| Turns passed | 19/26 | 22/26 | 24/26 |
| Intent read correctly | 23/26 | 24/26 | 25/26 |
| Turns with finish: length | 2/26 | 0/26 | 0/26 |
| Output tokens: reasoning / visible | 0 / 6074 | 0 / 5796 | 2768 / 6097 |
| Answer-step output tokens p50 / p90 / max | 147 / 304 / 400 | 142 / 267 / 458 | 150 / 446 / 531 |
| Model steps per turn / CopilotKit runs per turn | 2.38 / 1.58 | 2.38 / 1.54 | 2.46 / 1.50 |
| Turn latency p50 / p90 / p95 | 2951 / 4275 / 4309 ms | 2912 / 3551 / 3737 ms | 3547 / 4476 / 5002 ms |
| Model step latency p95 / max | 2322 / 3955 ms | 2120 / 2365 ms | 2957 / 3314 ms |
| Estimated cost | $0.0064 | $0.0060 | $0.0090 |
| History added per turn: messages (reasoning) / bytes | 4.58 (0.00) / 1932 | 4.54 (0.00) / 1822 | 6.58 (1.88) / 2592 |
| Earlier assistant messages sent: reasoning replayed / empty / absent | 0 / 38 / 0 | 0 / 38 / 0 | 28 / 14 / 0 |
| Language en: passed / reply language correct | 2/2 / 2/2 | 2/2 / 2/2 | 2/2 / 2/2 |
| Language ja: passed / reply language correct | 8/8 / 8/8 | 8/8 / 8/8 | 8/8 / 8/8 |
| Language ko: passed / reply language correct | 2/6 / 4/6 | 5/6 / 5/6 | 5/6 / 5/6 |
| Language mixed-ko-en: passed / reply language correct | 0/2 / 2/2 | 1/2 / 1/2 | 2/2 / 2/2 |
| Language mixed-yue-en: passed / reply language correct | 2/2 / 2/2 | 2/2 / 2/2 | 2/2 / 2/2 |
| Language yue: passed / reply language correct | 2/2 / 2/2 | 2/2 / 2/2 | 2/2 / 2/2 |
| Language zh-hant: passed / reply language correct | 3/4 / 4/4 | 2/4 / 4/4 | 3/4 / 4/4 |
| Intent course-info: pass-rate spread across languages | 0.00 | 0.00 | 0.00 |
| Intent course-page: pass-rate spread across languages | 0.50 | 0.50 | 0.50 |
| Intent reviews-page: pass-rate spread across languages | 1.00 | 0.50 | 0.00 |

### Multilingual suite — report (`metricTable`)

| Metric | Live: p2-ml-A (prompt a7e7a95663e0, eval fa7545dad300) | Live: p2-ml-B (prompt a7e7a95663e0, eval fa7545dad300) | Live: p2-ml-C (prompt a7e7a95663e0, eval fa7545dad300) |
|---|---|---|---|
| Task completion (turns passed) | 19/26 | 22/26 | 24/26 |
| Intent read correctly (navigation decision and lookups) | 23/26 | 24/26 | 25/26 |
| Tool selection: required navigate correct | 10/12 | 12/12 | 12/12 |
| Tool selection: missed (omissions) / invalid arguments / wrong page | 0 (0) / 0 / 2 | 0 (0) / 0 / 0 | 0 (0) / 0 / 0 |
| Unsolicited navigation | 1/10 | 2/10 | 1/10 |
| Unavailable pages: stayed on page (navigate tried) | 2/2 (2) | 2/2 (0) | 2/2 (0) |
| Simulated navigation landed (required turns) | 10/12 | 12/12 | 12/12 |
| First navigate status (required turns) | navigated: 12 | navigated: 12 | navigated: 12 |
| Academic tools correct | 12/14 | 14/14 | 14/14 |
| Compound requests complete | 4/6 | 6/6 | 6/6 |
| Language correct | 24/26 | 24/26 | 25/26 |
| Replies without problems | 22/26 | 23/26 | 25/26 |
| Truncated turns (finish: length) | 2/26 | 0/26 | 0/26 |
| Finish reasons (steps) | length: 2, stop: 24, tool-calls: 36 | stop: 26, tool-calls: 36 | stop: 26, tool-calls: 38 |
| Model requests: steps graded / steps used | 62 / 62 | 62 / 62 | 64 / 64 |
| Agent runs: total (mean / max per turn) | 41 (1.58 / 2) | 40 (1.54 / 2) | 39 (1.50 / 2) |
| Most steps in one run / maxSteps hits | 3 / 0 | 3 / 0 | 3 / 0 |
| Latency p50 / p90 | 2951 ms / 4275 ms | 2912 ms / 3551 ms | 3547 ms / 4476 ms |
| Input tokens (cached) / output tokens | 196146 (181120) / 6074 | 195385 (182272) / 5796 | 205677 (184960) / 8865 |
| Most output tokens in one step | 400 | 458 | 531 |
| Reasoning tokens | 0 | 0 | 2768 |
| Model steps per turn (mean) | 2.38 | 2.38 | 2.46 |
| Latency p95 | 4309 ms | 3737 ms | 5002 ms |
| Slowest model step | 3955 ms | 2365 ms | 3314 ms |

### Navigation suite — compare (`armTable`)

| Metric | p2-nav-A | p2-nav-B | p2-nav-C |
|---|---|---|---|
| Thinking / output budget | off / 400 | off / 1200 | low / 1200 |
| Turns passed | 15/15 | 15/15 | 13/15 |
| Intent read correctly | 15/15 | 15/15 | 15/15 |
| Turns with finish: length | 0/15 | 0/15 | 0/15 |
| Output tokens: reasoning / visible | 0 / 2379 | 0 / 2651 | 728 / 2747 |
| Answer-step output tokens p50 / p90 / max | 21 / 185 / 363 | 97 / 173 / 389 | 108 / 213 / 473 |
| Model steps per turn / CopilotKit runs per turn | 2.20 / 1.67 | 2.33 / 1.67 | 2.27 / 1.67 |
| Turn latency p50 / p90 / p95 | 1971 / 3392 / 4127 ms | 2310 / 3395 / 4170 ms | 2420 / 3839 / 5815 ms |
| Model step latency p95 / max | 1874 / 2131 ms | 1752 / 2282 ms | 1887 / 2622 ms |
| Estimated cost | $0.0027 | $0.0030 | $0.0052 |
| History added per turn: messages (reasoning) / bytes | 4.33 (0.00) / 1429 | 4.47 (0.00) / 1600 | 5.80 (1.27) / 1957 |
| Earlier assistant messages sent: reasoning replayed / empty / absent | 0 / 23 / 0 | 0 / 25 / 0 | 10 / 14 / 0 |

### Navigation suite — report (`metricTable`)

| Metric | Live: p2-nav-A (prompt a7e7a95663e0, eval a6a57c6bcc8c) | Live: p2-nav-B (prompt a7e7a95663e0, eval a6a57c6bcc8c) | Live: p2-nav-C (prompt a7e7a95663e0, eval a6a57c6bcc8c) |
|---|---|---|---|
| Task completion (turns passed) | 15/15 | 15/15 | 13/15 |
| Intent read correctly (navigation decision and lookups) | 15/15 | 15/15 | 15/15 |
| Tool selection: required navigate correct | 10/10 | 10/10 | 10/10 |
| Tool selection: missed (omissions) / invalid arguments / wrong page | 0 (0) / 0 / 0 | 0 (0) / 0 / 0 | 0 (0) / 0 / 0 |
| Unsolicited navigation | 0/5 | 0/5 | 0/5 |
| Unavailable pages: stayed on page (navigate tried) | 0/0 (0) | 0/0 (0) | 0/0 (0) |
| Simulated navigation landed (required turns) | 10/10 | 10/10 | 10/10 |
| First navigate status (required turns) | navigated: 10 | navigated: 10 | navigated: 10 |
| Academic tools correct | 6/6 | 6/6 | 6/6 |
| Compound requests complete | 1/1 | 1/1 | 1/1 |
| Language correct | 15/15 | 15/15 | 13/15 |
| Replies without problems | 15/15 | 15/15 | 13/15 |
| Truncated turns (finish: length) | 0/15 | 0/15 | 0/15 |
| Finish reasons (steps) | stop: 15, tool-calls: 18 | stop: 15, tool-calls: 20 | stop: 15, tool-calls: 19 |
| Model requests: steps graded / steps used | 33 / 33 | 35 / 35 | 34 / 34 |
| Agent runs: total (mean / max per turn) | 25 (1.67 / 2) | 25 (1.67 / 2) | 25 (1.67 / 2) |
| Most steps in one run / maxSteps hits | 3 / 0 | 3 / 0 | 3 / 0 |
| Latency p50 / p90 | 1971 ms / 3392 ms | 2310 ms / 3395 ms | 2420 ms / 3839 ms |
| Input tokens (cached) / output tokens | 103625 (97394) / 2379 | 110596 (103542) / 2651 | 108870 (89856) / 3475 |
| Most output tokens in one step | 363 | 389 | 473 |
| Reasoning tokens | 0 | 0 | 728 |
| Model steps per turn (mean) | 2.20 | 2.33 | 2.27 |
| Latency p95 | 4127 ms | 4170 ms | 5815 ms |
| Slowest model step | 2131 ms | 2282 ms | 2622 ms |

### Arm D (thinking low, 2,000 output tokens)

**Not triggered.** Task 9 trigger check on `p2-ml-C` and `p2-nav-C`:

```json
{"ml":{"lengthSteps":0,"stepsAtOrAbove90Percent":0},"nav":{"lengthSteps":0,"stepsAtOrAbove90Percent":0},"triggerD":false}
```

Arm C had **0** steps with `finish: length` and **0** steps at or above 90% of its 1,200-token cap, so arm D was not run.

## 5. Tool selection and task completion

Hand review (Step 1): every reply read across A/B/C; scored yes/no on (1) student goal, (2) script/language, (3) no thinking text in the reply, (4) no facts beyond tool results, (5) “opened page” claims match `navigate` status. Tallies below count turns where **all five** are yes (26 pilot turns per arm).

| Arm | All five yes | Grader turns passed (P) | Intent read | Required navigate correct | Unsolicited nav (forbidden turns) | Wrong page | Academic tools | Compound | Language (grader) | Replies without problems |
|---|---|---|---|---|---|---|---|---|---|---|
| A (off / 400) | 19/26 | 19/26 | 23/26 | 10/12 | 1/10 | 2 | 12/14 | 4/6 | 24/26 | 22/26 |
| B (off / 1200) | 22/26 | 22/26 | 24/26 | 12/12 | 2/10 | 0 | 14/14 | 6/6 | 24/26 | 23/26 |
| C (low / 1200) | 24/26 | 24/26 | 25/26 | 12/12 | 1/10 | 0 | 14/14 | 6/6 | 25/26 | 25/26 |

**Hand review by language (all five yes / turns):**

| Language | A | B | C |
|---|---|---|---|
| en | 2/2 | 2/2 | 2/2 |
| ja | 8/8 | 8/8 | 8/8 |
| ko | 2/6 | 5/6 | 5/6 |
| mixed-ko-en | 0/2 | 1/2 | 2/2 |
| mixed-yue-en | 2/2 | 2/2 | 2/2 |
| yue | 2/2 | 2/2 | 2/2 |
| zh-hant | 3/4 | 2/4 | 3/4 |

**Navigation regression (H, 15 turns × 2 repeats per arm):** A and B **15/15**; C **13/15** (two English turns replied in Chinese: `nav-open-en`, `follow-up-this-course-en` repeat 0).

**Failure behaviours (grouped):**

| Behaviour | Arms / repeats | Notes |
|---|---|---|
| `finish: length` truncation | A: `ml-compare-here-ko` r0, r1 | Absent in B/C; 400-token cap |
| Wrong destination (course vs reviews) | A: `ml-reviews-page-ko-en` r0, r1 | Landed on `/course/CISC3014` instead of reviews |
| Unsolicited navigation | A: `ml-reviews-which-instructor-zh-hant` r1; B: same case r0, r1; C: r1 | Navigated to course page when both instructors should be named only |
| Korean reply in wrong script/language | A: `ml-course-page-ko` r1, `ml-review-injection-ko` r1; B: `ml-course-page-ko` r0, `ml-reviews-page-ko-en` r0; C: `ml-course-page-ko` r1 | Often Simplified Chinese or English preface |
| Missing instructor names | B: `ml-reviews-which-instructor-zh-hant` r0 | Navigated without naming WONG KA KI / LI MEI |
| English navigation, Chinese reply | C nav only | Model limitation under thinking low on English-only nav suite |

Intent-group pass spread (pilot, from compare table): `course-info` 0.00 spread; `course-page` 0.50; `reviews-page` 1.00 → 0.50 → 0.00 across A → B → C (one repeat-sensitive case).

## 6. Token, latency and cost

Figures from §4 tables (this session, sequential arms; compare latency as ratios within the session, not across days).

| Arm | Reasoning / visible output tokens (ML) | Answer-step output p50 / p90 / max | `finish: length` (ML) | Steps / runs per turn (ML) | Turn p50 / p90 / p95 | Slowest step | Est. cost ML + nav | Cost / 1,000 student turns† |
|---|---|---|---|---|---|---|---|---|
| A | 0 / 6074 | 147 / 304 / 400 | 2/26 | 2.38 / 1.58 | 2951 / 4275 / 4309 ms | 3955 ms | $0.0091 | ~$0.22 |
| B | 0 / 5796 | 142 / 267 / 458 | 0/26 | 2.38 / 1.54 | 2912 / 3551 / 3737 ms | 2365 ms | $0.0090 | ~$0.22 |
| C | 2768 / 6097 | 150 / 446 / 531 | 0/26 | 2.46 / 1.50 | 3547 / 4476 / 5002 ms | 3314 ms | $0.0142 | ~$0.35 |

†Assumes similar token profile to this eval mix (41 graded turns per arm ≈ 26 multilingual + 15 navigation), off-peak list prices above.

**Latency ratios (within session, arm B = 1.0):** turn p95 A 1.15×, C 1.34×; slowest step A 1.67×, C 1.40×. All arms well under acceptable latency (turn p95 ≤ 12,000 ms; slowest step ≤ 20,000 ms).

**30-turn request-limit projection (pilot history growth per turn):**

| Arm | 30 × messages/turn | vs `MAX_RUN_MESSAGES` 200 | 30 × bytes/turn | vs 262,144 B |
|---|---|---|---|---|
| A | 137 | OK | 57,960 | OK |
| B | 136 | OK | 54,660 | OK |
| C | 197 | OK (within 3 messages of cap) | 77,760 | OK |

Thinking on (C) adds ~1.9 reasoning messages per turn in history audits; it does **not** cross either cap in this projection, but leaves little headroom on message count. Smallest production fix if caps bite later: drop `reasoning` role messages in the CopilotKit route before `runInputSchema` validation (CopilotKit discards them for display anyway), unless Task 11 is adopted for faithful replay.

## 8. Regression results

| Command | Exit | Notes |
|---|---|---|
| `npm run lint` | 0 | |
| `npx tsc --noEmit` | 0 | |
| `npm test -- --run` | 0 | 216 files / 1595 tests |
| `npm run build` | 0 | |
| `npm run build:pages` | 0 | OpenNext + wrangler bundling OK; wrangler log path EPERM in sandbox (non-fatal); known unsupported-Next / CopilotKit warnings not seen this run |
| `npm run eval:assistant` | 0 | No `ASSISTANT_EVAL`: 4 suites skipped |
| `git diff 0600f52 --` production paths | empty | Prompt, tools, config, route, deploy env unchanged |
| `git status --short` | see below | Only pre-existing unrelated dirt + this report |
| `git stash list` | `stash@{0}` present | Untouched |

**Preserved behaviour (re-checked from Phase 1 closure §9):**

| Preserved | Still covered by |
|---|---|
| Desktop-only ≥1024px | `tests/components/desktop-assistant-gate.test.tsx` |
| Clerk auth / access modes | `tests/api/copilotkit.test.ts`, assistant access tests |
| Server rate limits | `tests/assistant/rate-limit.test.ts` |
| Read-only academic tools | `tests/assistant/tools.test.ts`, golden tests |
| Validated `navigate`, one page per message | navigation + component tests |
| No `toolChoice`, no keyword routing | `tests/assistant/agent.test.ts` |
| Language rules in prompt unchanged | fingerprint `a7e7a95663e0` on every live run |
| Production defaults off / 400 / `deepseek-flash` | `lib/assistant/config.ts` + unchanged wrangler / `.env.example` in diff |
| Eval opt-in | `eval:assistant` skips without env |

## 9. Recommended production inference configuration

**Production: keep current defaults** — `AI_THINKING=off`, `AI_MAX_OUTPUT_TOKENS=400`, model `deepseek-flash`. **Rule: none of A/B/C is “reliable”** under the pre-registered criteria (each arm had ≥1 unsolicited navigation on the pilot; B and A miss language ≥25/26; A misses P ≥22). Changing wrangler / `.env.example` requires a separate approved change.

**Best experiment arm (eval only): B** (thinking off, 1,200 max output tokens).

| Rule | Application |
|---|---|
| **A or B** | A has `finish: length` on 2/26 pilot turns → prefer B over A (B also +3 pilot passes: 22 vs 19). |
| **B or C** | C is not reliable; +2 pilot passes (24 vs 22), not +3; on the 16 ko/ja/mixed-ko-en turns C beats B by **1** turn (15 vs 14), not ≥2; prefer **B** over C. |
| **D** | Not run (`triggerD: false`). |
| **None reliable → production** | Do not adopt B or C settings in production from this phase alone. |

If C were adopted in a future phase: monitor message-cap headroom (~197/200 messages at 30 turns), English reply language under thinking low (nav H regression), and unsolicited navigation on ambiguous instructor cases. Task 11 only if reasoning continuation fidelity must match DeepSeek’s documented replay requirement.

## 10. Remaining weaknesses before V2

- **Prompt:** No Korean/Japanese examples; English “check out” not listed; instructor-disambiguation rule still misread under navigation pressure (unsolicited `navigate` on `ml-reviews-which-instructor-zh-hant`).
- **Model:** Korean/English code-switching and English→Chinese drift under thinking low; 400-token cap truncates long Korean comparisons (A).
- **Tool:** `search_catalog` needs English keywords (Japanese compound case depends on model translating データベース → search terms).
- **Fixture / eval:** Two-course fictional catalog; `CHAN TAI MAN` schema overlap; 2 repeats (±2 turns = noise); no live Clerk, rate-limit, or real browser navigation timing.

## Verdicts

| Area | Verdict |
|---|---|
| Multilingual intent understanding | **Partial** — C best on P (24/26) but all arms miss perfect instructor-disambiguation; ko/mixed-ko-en still fragile (§5). |
| Navigation reliability | **Strong for B** — H 15/15 on nav suite; A matches; C regressed to 13/15 on English script. |
| Multi-step orchestration | **Good for B/C** — compound 6/6; A 4/6 with truncation on compare. |
| Low-thinking effectiveness | **Works technically** — smoke gate passed; pilot lift +2 turns vs B not enough to recommend; +50% cost (§6). |
| Runtime compatibility | **Confirmed** — thinking on/off matches audits; empty `reasoning_content` accepted (§1, §7). |
| Student response quality | **Best in C** on grader “replies without problems” (25/26); hand review 24/26; language slips remain. |
| Cost efficiency | **B ≈ A** on ~$0.22/1k turns; C ~$0.35/1k (§6). |
| V2 readiness | **Not yet** — prompt/language gaps, sample size, production caps, and instructor-navigation failures block a settings change. |

## Commits

| SHA | Subject |
|---|---|
| `87fb41e` | test(assistant): pin the thinking-mode request and history contract |
| `b49017a` | feat(assistant): log reasoning tokens per model step |
| `b8527bf` | fix(assistant): keep model reasoning out of the chat sidebar |
| `2ed2029` | test(assistant): type the thinking-history prompt content |
| `73e82d4` | test(assistant): audit provider requests and add the thinking arm to the eval |
| `2159dbc` | test(assistant): grade Korean and Japanese replies, unavailable pages and intent |
| `a473e86` | test(assistant): add the multilingual pilot and thinking smoke suites |
| `e24c66f` | test(assistant): compare eval arms that change one inference setting at a time |
| `f74aa17` | docs(assistant): record the V1-E phase 2 thinking-mode compatibility check |
| Task 10 | docs(assistant): record the V1-E phase 2 reasoning and multilingual evaluation |

## Excluded from commits

`app/layout.tsx`, the emptied Phase 2 token-budget spec, untracked plan files, `.next-dev/**`, `.eval-results/` (ignored), `docs/superpowers/verification/2026-10-19-global-assistant-v1a.md`, `public/assistant/copilotkit-theme.css`, `tests/assistant/theme-sync.test.ts`, `stash@{0}`: untouched.
