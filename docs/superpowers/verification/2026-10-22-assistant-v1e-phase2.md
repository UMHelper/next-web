# Assistant V1-E Phase 2: low-budget reasoning and multilingual intelligence

- Branch: `feat/global-assistant-v1`; started from `0600f52`; grading freeze `e24c66fc3a72cebab5d2e006579a8a3ff8f45787`
- Prompt fingerprint `a7e7a95663e0` (unchanged); eval fingerprints: navigation/smoke `4c943288d13f`, tokens `215956d43595`
- Runs on 2026-10-22; prices from https://api-docs.deepseek.com/quick_start/pricing on 2026-10-22: input miss $0.30 peak / $0.15 off-peak, input hit $0.006 peak / $0.003 off-peak, output $1.20 peak / $0.60 off-peak per million tokens (no separate thinking-mode price on the page). Paid runs approved for smoke, probe, and arms A–D (conditional D).

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
