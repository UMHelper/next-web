# Global assistant V1-D verification

- Branch: `feat/global-assistant-v1`
- Code verified through: `0584f7e` (this record is the commit after that)
- Baseline before V1-D: `d6b28c7` — 202 test files, 1,429 tests
- Verified: 2026-10-22 (local)

## 1. What changed

| Commit | Change |
|---|---|
| `9ebbf85` | At most one opened page per student message. The limit counts `navigate` results since the latest user message whose status is `navigated`, `landed_elsewhere` or `timeout`; `not_found`/`invalid` do not use up the turn. Prompt and tool now agree (was: prompt "once", tool allowed two). Prompt only lets the model claim a page opened on `navigated`/`already_here`, and says `timeout` means "not finished opening yet". |
| `7a8a2f1` | Real CopilotKit runtime integration test (see §4). |
| `deb63e0` | Narrow-sidebar formatting: prompt rule 11 and Streamdown CSS fixes (see §3). |
| `56b1bf4` | Privacy-safe metrics: `continuation` flag on `[assistant] run`, new `[assistant] step`, `[assistant] step failed`, `[assistant] rate limited` (see §5). |
| `0584f7e` | `scripts/deploy-preview.sh` passes `--dangerouslyUseUnsupportedNextVersion`; test covers every OpenNext build command. |

Timeout handling needed no code change: `timeout` already meant "unconfirmed", the hook never retries, cancellation and unmount cleanup are unchanged, and a timeout now uses up the turn's one page so the model cannot push a second route while the first may still land.

## 2. CopilotKit 1.79.1 frontend-tool follow-ups

Installed: `@copilotkit/core`, `react-core`, `runtime` all 1.79.1. Source: `node_modules/@copilotkit/core/dist/index.mjs`.

- **Model-issued tool calls** (`processAgentResult` → `executeSpecificTool`): after the handler runs, a follow-up run starts unless the tool sets `followUp: false` or the handler returned an error (line 4138: `if (!handlerResult.error && tool?.followUp !== false) return true`). The default is therefore **on**.
- **Programmatic `copilotkit.runTool()`**: defaults to `followUp = false` (line 4241). This is where the earlier contradictory "default false" finding came from; the app does not use `runTool`.
- All tool calls from one model step run first, then **one** follow-up run (line 4010). Recursion is capped at `MAX_FOLLOW_UP_DEPTH = 100` (line 3468).
- Before the follow-up, CopilotKit awaits `waitForPendingFrameworkUpdates()` (line 4012), so the follow-up carries the page context published after navigation.

Effective behaviour in this app:

| Tool | Registration | Follow-up |
|---|---|---|
| `navigate` | `followUp: true` | yes, one extra `/run` |
| `check_plan_conflicts` | no `followUp` set | yes (default), one extra `/run` |
| server tools (5 MCP-backed) | runtime-side | no extra `/run`; run inside the same request up to `maxSteps: 5` |

Every `/run`, including follow-ups, passes Clerk auth, the access check and `consumeAgentRateLimits`. The navigation limit counts from the latest user message, and follow-ups add no user message, so they cannot reset it. No continuation quota was added: the client controls the history, so any such quota would be spoofable; the server-side rate limit is the real bound.

Residual risk: a model that keeps calling `navigate` after `limit_reached` gets one follow-up per call until it stops, the 100-depth cap, or the hourly limit. The prompt forbids calling again after `timeout`/`limit_reached`; the scripted test shows the loop ends after one refusal, real DeepSeek compliance is not measured.

## 3. Narrow-sidebar UX

Prompt rule 11: short paragraphs and bullets; tables only with ≤3 short columns; for comparisons a bold line per course/instructor plus 2–4 fact bullets (ratings keep their scale); recommendation after the facts on a line starting "Suggestion:" in the reply language; Markdown links with short text; no repeated facts.

CSS (`public/assistant/copilotkit-theme.css`), selectors checked against Streamdown and CopilotKit 1.79.1 markup:

- `overflow-wrap: anywhere` on `[data-streamdown="link"]` and `inline-code` (Streamdown's `wrap-anywhere` class is Tailwind 4 and undefined here).
- Table cells wrap (`white-space: normal`), compact padding and font size, table scrolls in its own box.
- Reply headings at body size; chat scroller `overscroll-behavior: contain`.

Measured in Chromium on the dev server, with Streamdown's exact table/link/code markup inside a 380px sidebar container (synthetic content, not a live model reply):

| Metric | Before (`7a8a2f1` theme) | After |
|---|---|---|
| 3-column comparison table width in a 347px column | 679px, needs horizontal scroll | 347px, fits |
| Header cell `white-space` | `nowrap` | `normal` |
| Long review URL / long inline identifier overflow | 0px (CopilotKit `break-words` already wrapped) | 0px |
| `h2` in a reply | 24px | 16px |
| Scroll chaining to the page | `auto` | `contain` |

Not verified: how DeepSeek actually follows rule 11, and whether two-course comparisons fit in `AI_MAX_OUTPUT_TOKENS=400` (per step) without truncation.

## 4. Integration coverage

| Level | What | Where |
|---|---|---|
| Unit | navigation limit/statuses, destination parsing, page description, prompt rules, CSS rules, metrics wrapper, rate-limit windows | `tests/assistant/*` |
| React component | `useNavigateTool` (push, pathname confirmation, timeout, cancel, unmount, limit), panel mount, desktop gate (≥1024px mount/unmount, conversation kept through close/reopen/navigation, sign-out), launcher (account switch, sign-out) | `tests/components/use-navigate-tool.test.tsx`, `desktop-assistant-gate.test.tsx`, `assistant-launcher.test.tsx`, `assistant-panel.test.tsx` |
| Real CopilotKit runtime | real `AssistantPanel` + `CopilotKitProvider` → `/api/copilotkit` route → `CopilotRuntime` → `BuiltInAgent`; only Clerk, access, rate-limit store, catalog and the model are replaced (model is scripted) | `tests/components/assistant-runtime.integration.test.tsx` |
| Real DeepSeek + browser | not run by the agent (no signed-in session in the agent browser); user's own session observed in dev-server log, §6 | — |

Runtime integration scenarios (all pass): the critical CISC2001 → CISC3014 → "what about this course" → "compare it with CISC2001" conversation (page context on turn 1, updated context in the navigate follow-up, history on later turns); follow-up after `check_plan_conflicts`; unknown course; timeout with a late landing and a refused second page; recovery after 429 and after a model failure. Mutation checks: restoring the two-page limit and freezing page context both fail these tests.

The scripted model proves what the model is given and how many runs a turn costs, not that DeepSeek resolves "it" to the right course.

## 5. Usage, performance and rate limits

New log lines (no prompt/reply text, tool arguments or user IDs):

```
[assistant] run          {"turns","continuation","messages","bytes"}
[assistant] step         {"ms","firstChunkMs","inputTokens","cachedInputTokens","outputTokens","finish","tools":[names]}
[assistant] step failed  {"ms","error":<error name>}
[assistant] rate limited {"window":"hour"|"day","turns"}
```

Workers Observability already gives per-invocation status, wall time and CPU time. Production samples 10% (`head_sampling_rate: 0.1`), preview 100%; scale production counts accordingly.

Requests per student turn (asserted in the real-runtime test; each costs one rate-limit unit):

| Turn | `/run` requests |
|---|---|
| Question answered with server tools only | 1 |
| Open a page (`navigate`), incl. "open X and tell me about it" | 2 |
| Clash check (`check_plan_conflicts`) | 2 |
| Unknown course via `navigate` | 2 |
| Timeout, then the model tries a second page | 3 |

Configured limits (source `lib/assistant/config.ts`, `wrangler.jsonc` preview vars): 30 runs/hour, 80 runs/day per user, 30 turns per conversation, 8 history turns. With a mix of 60% plain questions, 25% navigation and 15% clash checks (≈1.4 runs per turn), that is about 21 turns/hour and 57 turns/day. A student checking ten sections for clashes in one sitting uses 20 of the 30 hourly runs. No change recommended until the new logs show the real `continuation` share; the daily limit is the likely first constraint for heavy planners. Limits were not loosened.

Measured latency (user's own session, local dev server, real DeepSeek, before the step metrics existed; from the dev-server log): course question 3.6 s; navigate run 1.4 s + follow-up 1.2 s; follow-up questions 3.4 s and 4.0 s. Token usage: not yet measured; available from `[assistant] step` once deployed. CPU: only the 2026-10-18 spike data exists (41–249 ms per assistant request, median about 100 ms, Free plan with the 10 ms limit not enforced at the time; `2026-10-18-assistant-v1-workers-spike.md`).

Log noise: each run prints an AI SDK warning about system messages in the prompt (from how `BuiltInAgent` passes context). Harmless, but it doubles log volume per run.

## 6. Automated checks

Commands run separately at `0584f7e`.

| Command | Result |
|---|---|
| `npm run lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm test -- --run` | exit 0 — 205 files, 1,463 tests (baseline 202 / 1,429) |
| `npm run build` | exit 0 (pre-existing CopilotKit `channel-manager` critical-dependency warning) |
| `npm run build:pages` | exit 0, `OpenNext build complete` (same warning; unsupported-Next warning, continued by flag) |

No E2E tooling (Playwright/Cypress) in the repo.

Browser: the Cursor browser on `localhost:3000` has no Clerk session, so the assistant does not mount and no real chat was run by the agent. The only real-model evidence is the user's earlier session in the dev-server log: CISC2001 question (1 run), navigate to CISC3014 (2 runs, page `/course/CISC3014` loaded between them), then two more turns (1 run each). This matches the counts in §5 but was not inspected for answer quality.

## 7. Deployment state (read-only checks, 2026-10-22)

| Item | Observed | Kind |
|---|---|---|
| Production code | `main` does not contain the assistant (`8c1d023` not an ancestor). Latest production version `9300b8bc` (2026-10-21 14:49 UTC) lacks `COPILOTKIT_TELEMETRY_DISABLED`, which this branch's `wrangler.jsonc` sets | prerequisite: merge + deploy |
| Production secrets | `AI_API_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_SECRET_KEY` present as secrets (`wrangler secret list --name next-web`) | ok |
| Production `AI_*` / `AGENT_*` vars | none set; code defaults apply (deepseek-flash, 400 tokens, 30 s, 30/h, 80/day) | ok |
| Production DB migration `20261018_assistant_access.sql` | **not checked** (read-only query was out of scope for the agent) | prerequisite |
| Preview Worker `next-web-preview` | exists, latest version `0bb7c180` (2026-10-21 14:51 UTC) | ok |
| Preview credentials | **stored as plain-text environment variables, not secrets**: `AI_API_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL`, `TELEGRAM_BOT_TOKEN`, `UM_IOS_API_SECRET`, `IMGUR_CLIENT_SECRET`, `BLOB_READ_WRITE_TOKEN`. `wrangler secret list --env preview` is empty. Values show in `wrangler versions view` and the dashboard | **security, operational** |
| `build:preview` reference | gone; `deploy:preview` → `scripts/deploy-preview.sh` | ok |
| `deploy-preview.sh` Next-version gate | fixed in `0584f7e` (script not executed: deploy not authorized) | app defect, fixed |
| Assistant access default | `off` after migration until an admin changes it | by design |
| Cloudflare plan / CPU | Free plan per spike; assistant CPU ≫ 10 ms | decision |

## 8. Operational checklist (not executed)

1. Preview credentials: in the dashboard (Workers → `next-web-preview` → Settings → Variables), delete each plain-text credential, then `npx wrangler secret put <NAME> --env preview` for it. Rotate the DeepSeek key first (its full value was printed during this check), then the others. `SUPABASE_SECRET_KEY` and `SUPABASE_DB_URL` reach the production database. Verify with `npx wrangler secret list --env preview` and `npx wrangler versions view <id> --name next-web-preview` (no credential under "Environment Variable").
2. Preview deploy: `npm run deploy:preview`, then sign in on the preview URL at ≥1024px and run the §9 browser checklist; read `[assistant] step` lines and `cpuTime` in Workers Observability (`next-web-preview`, filter path `/api/copilotkit/agent/default/run`).
3. Production DB (Supabase SQL editor, read-only):
   `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'app_config' and column_name = 'ai_assistant_access';`
   `select to_regclass('public.assistant_testers');`
   If either is empty, apply `supabase/migrations/20261018_assistant_access.sql` (authorized change).
4. CPU/plan decision: with assistant requests at roughly 100 ms CPU, decide on Workers Paid before enabling for more than testers.
5. Merge `feat/global-assistant-v1` to `main` and `npm run deploy` (authorized). Confirm with `npx wrangler versions view <id> --name next-web` that `COPILOTKIT_TELEMETRY_DISABLED` is bound.
6. Production smoke: `/api/copilotkit/info` signed out → 401; signed in without access → 403.
7. Enable `testers` in the admin UI, add tester emails, repeat the §9 checks on production, watch `[assistant] rate limited` and `step failed` for a few days before `everyone`.

## 9. Browser checklist (still to run, signed in, ≥1024px)

1. On `/course/CISC2001`: "tell me about this course" → answers about CISC2001.
2. "Open CISC3014" → page changes, reply says it opened; dev log shows `continuation:false` then `continuation:true`.
3. "What about this course?" → CISC3014.
4. "Compare it with CISC2001" → per-course sections, numbers with scale, "Suggestion:" line, no wide table, no truncation.
5. Same in Traditional Chinese and English; check wrapping of review links.
6. "Open ZZZZ9999" → not found, page unchanged.
7. Clash check for one section on `/timetable`.
8. Resize below 1024px → assistant unmounts; back above → fresh, closed assistant (by design).
9. Sign out / switch account → conversation cleared.

## 10. Excluded from commits

`app/layout.tsx` (`darkreader-lock` meta), untracked `docs/superpowers/plans/2026-10-22-global-assistant-v1{b,c}.md`, `stash@{0}` — all untouched.
