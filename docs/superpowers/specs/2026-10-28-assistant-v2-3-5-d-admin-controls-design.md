# What2Reg AI — V2.3.5-D Admin Configuration & Usage Controls

**Date:** 2026-10-28
**Branch:** `feat/assistant-v2-3-5-d-admin-controls` (from `feat/global-assistant-v2` @ `51e726f`)
**Status:** Approved direction; implementation follows this spec.

---

## 1. Scope and decisions

V2.3.5-D adds a bounded administration and usage-control layer to the existing V2 assistant. It does **not** add conversation persistence (V2.3.5-C remains deferred), timetable mutation, provider migration, or a general-purpose configuration platform.

Four product/security choices were required. The brief prescribes the direction for each; the chosen defaults are recorded here and the alternatives are in §12.

| Decision | Choice |
|---|---|
| Charging unit | One charge per **logical user turn**. Follow-up runs after a client tool and same-turn retries reuse the charge for 5 minutes. New turns always charge. |
| Failed-run policy | **Charged at acceptance, never refunded.** This preserves the existing policy and is stated explicitly in the UI/admin documentation. |
| Admin permissions | Access mode and testers remain editable by any admin. **Numeric quotas and execution limits require a platform admin.** |
| Retention enforcement | **Opportunistic prune**: usage events 90 days, turn-charge ledger 30 days, stale rate-limit rows 7 days. Runs at most every 6 hours per isolate via an RPC, and can be run manually. Audit-log retention is documented as deferred. |

The D layer must remain independent of persistent conversations. No transcript, prompt, or model response is stored.

---

## 2. Existing-system audit

### 2.1 Runtime and request flow

- The CopilotKit runtime is a cached singleton built on first request: `app/api/copilotkit/[[...slug]]/route.ts:34-51`.
- A per-request `BuiltInAgent` is created by the runtime's agents factory: `lib/assistant/agent.ts:32-44`.
- The runner is `InMemoryAgentRunner` with 16 threads, 8 runs per thread, and 2 MB per run. Conversation history travels with each request; nothing is persisted server-side.
- The route classifies `GET /info`, `POST /run`, `POST /connect`, and `POST /stop/<threadId>` itself (`route.ts:53-71`). Only `/run` executes the agent.

### 2.2 Authentication and access

- Clerk `auth()` runs before any other work (`route.ts:149`). Signed-out requests return 401.
- `canUseAssistant` (`lib/assistant/access.ts:71`) reads `app_config.ai_assistant_access` (`off` / `testers` / `everyone`), cached for 5 minutes (`access.ts:48`). Admins always pass; testers match a verified Clerk email.
- Admin authorization is centralized in `lib/admin-auth.ts:45-110`; setting changes are audited through `lib/admin-audit.ts:23`.

### 2.3 Quota storage and current charging

- The existing limiter is `request_rate_limits` plus the atomic single-window `consume_rate_limit` RPC (`supabase/migrations/20260918_rate_limit.sql`).
- Agent quota uses hashed hour and day keys (`lib/assistant/rate-limit.ts:15-38`), with a SHA-256 user hash (`lib/mcp/rate-limit.ts`).
- Only `/run` consumes quota. `connect`, `info`, and `stop` do not.
- Quota storage failures throw and the route fails closed with 503 (`route.ts:92-107`).

### 2.4 Defects and gaps found

1. **Every HTTP run is charged**, including follow-up runs after a frontend tool. The route computes `continuation` at `route.ts:127-128` but does not use it for accounting.
2. **No idempotency.** Client retries and duplicate deliveries charge again. `runId` is forwarded but never used for accounting.
3. **Hour/day are two separate RPCs** (`rate-limit.ts:21-38`). A day-window denial leaves the hour counter incremented.
4. **Prepared-payload rejection happens after charging.** The 256 KB check at `route.ts:109-124` follows the quota call, so an oversized request is charged but never executed.
5. **Limits are environment-only.** `maxSteps` is hardcoded to 8 (`agent.ts:30`); output tokens, timeout, turn cap, and history come from env (`lib/assistant/config.ts:23-38`).
6. **No persisted usage.** `withStepMetrics` logs latency, token usage, finish reason, and tool names to the console only (`lib/assistant/metrics.ts:14-60`). Provider errors are logged without prompt text but not retained.
7. **No retention.** `request_rate_limits` rows are never pruned; `admin_audit_log` has no retention policy; conversations are in-memory only.
8. **Student error mapping is incomplete.** `describeAssistantError` (`lib/assistant/error-message.ts:1`) has no distinct messages for quota exhaustion, provider balance exhaustion, or execution limits.
9. **Already sufficient:** Clerk auth, access modes, admin roles, audit logging, single-row `app_config`, fail-closed quota errors, server-only provider configuration (`overridableProperties: []`), step-level token instrumentation, and the SQL snapshot/static migration test pattern.

An independent V2 reality audit reached the same operational-visibility conclusion; every claim above was re-verified against the source.

---

## 3. Quota-accounting contract

| Request | Charge | Notes |
|---|---|---|
| `POST /connect` | No | Returns an empty SSE stream (`route.ts:160`). |
| `GET /info`, `POST /stop` | No | Forwarded to the runtime; no model execution. |
| First `/run` for a user turn | Yes, one unit | Claimed atomically against both hour and day windows. |
| Follow-up `/run` ending in a tool result | No, reuses the turn charge | Represents a client frontend-tool continuation (`navigate`, `filter_catalog_results`). |
| Same-turn retry within 5 minutes | No, reuses the turn charge | Covers network retries and duplicate delivery; the provider is still called and usage is recorded with `charged=false`. |
| Same turn replayed after 5 minutes | Yes | The replay window is bounded to limit free regeneration abuse. |
| Internal server tools / multiple model steps | No extra charge | They execute inside one accepted run; steps are recorded for usage only. |
| Provider failure | Charged | Policy preserved; classified as `provider_error` in usage. |
| User-cancelled / interrupted stream | Charged | Classified as `client_aborted`. |
| Quota denial | No | 429 with `Retry-After`; no runtime call; denial is recorded. |
| Conversation-limit or prepared-payload rejection | No | 409/413 before the quota claim; rejection is recorded. |
| Quota backend unavailable | No | 503; **never** bypasses the check or executes the agent. |
| Concurrent requests | Atomic | A per-user advisory transaction lock serializes the check-and-consume. |

### 3.1 Turn identity

The server derives, per run:

```
userHash  = sha256(clerkUserId).slice(0, 32)
threadHash = sha256(threadId).slice(0, 32)
turnKey   = sha256(userHash + "\0" + threadId + "\0" + turnMessageKey).slice(0, 32)
```

`turnMessageKey` is the latest user message's `id`, or a hash of its content when the client omits an id, or `"no-user"` when the run has no user message. The raw Clerk id, thread id, and prompt are never stored.

`isContinuation` is `messages.at(-1)?.role === "tool"`. It is recorded for usage but is **not** trusted for charging; the turn key is authoritative.

### 3.2 Idempotency and atomicity

A dedicated `assistant_turn_charges(user_hash, turn_key)` ledger records committed charges. The `claim_assistant_turn` RPC:

1. Takes a transaction-scoped advisory lock on the user hash.
2. Returns `allowed=true, charged=false` if a charge for the turn exists and is under 5 minutes old.
3. Otherwise reads both window counters, denies without incrementing either if either is full, and only then increments both.
4. Upserts the charge row and writes an `accepted` usage event.

This gives exactly-once accounting for a logical run across continuations, retries, and concurrent duplicate delivery, without introducing a second rate-limit system. The existing `request_rate_limits` table remains the counter store.

### 3.3 Charging order in `/run`

1. Parse body and schema.
2. Reject conversation over the turn limit (409).
3. Shape messages and reject prepared payloads over 256 KB (413).
4. Claim the turn (atomic quota).
5. Register run telemetry and forward to the runtime.

Steps 1–3 never charge. Steps 4–5 execute at most once per accepted turn.

---

## 4. Architecture

### 4.1 New and changed components

| Component | Responsibility |
|---|---|
| `lib/assistant/settings.ts` | Typed limit bounds, nullable `app_config` overlay, clamp, cached read. |
| `lib/assistant/turn-key.ts` | Pure turn/thread/user hash derivation and continuation detection. |
| `lib/assistant/rate-limit.ts` | `claimAgentTurn` production RPC call plus preview in-memory implementation. |
| `lib/assistant/run-context.ts` | Per-run registry of resolved config + telemetry, keyed by an internal header. |
| `lib/assistant/telemetry.ts` | Step aggregation, error classification, usage persistence, prune throttle. |
| `lib/assistant/usage.ts` | Admin aggregation and cost estimation. |
| `app/api/admin/assistant/usage/route.ts` | Admin-only usage summary. |
| `components/admin/assistant-settings-client.tsx` | Bounded settings form (platform admin). |
| `components/admin/assistant-usage-client.tsx` | Usage cards, daily table, privacy/estimate labels. |
| `app/admin/assistant/page.tsx` | Composes access, settings, and usage for admins. |

### 4.2 Per-run data flow

```
POST /run
  → auth + access
  → resolve config (cached DB overlay over env defaults)
  → validate / shape messages
  → derive turn identity
  → claim_assistant_turn (atomic, idempotent)
  → register RunContext { config, telemetry } keyed by runKey
  → set internal x-assistant-run-key header on forwarded request
  → runtime agent factory reads RunContext
  → withStepMetrics records token/latency/finish/tool data into telemetry
  → route wraps the SSE body; on close/error/cancel it persists the final usage row
```

The internal header is overwritten server-side, so a client cannot inject a run key or substitute configuration. Provider settings (`apiKey`, `baseURL`, `model`, `thinking`) remain environment-only.

### 4.3 Telemetry collection

`withStepMetrics` keeps its console line and additionally records into the telemetry object:

- per-step latency and first-chunk latency;
- input, cached-input, output, and reasoning tokens from the provider `finish` part;
- finish reason and tool names;
- step count and tool-call count;
- provider error classification (status/code/name only, never the message body).

The model stream is wrapped with a backpressure-aware `ReadableStream` so mid-stream provider errors and consumer cancellation are observed. If the provider omits usage, token fields stay `null` rather than zero.

### 4.4 Failure classification

| Class | Detection | Student message |
|---|---|---|
| `quota_denied` | 429 / `quota_exhausted` | "You've used your AI allowance for now. Please try again later." |
| `execution_limit` | `execution_limit` / step-limit errors | "This request needed too many steps. Try a simpler question or start a new chat." |
| `provider_balance` | 402 / insufficient balance | "The AI service is temporarily unavailable. Please try again later." |
| `provider_auth` | 401/403 from the provider | "The AI service is not configured correctly. Please contact support." |
| `provider_rate_limit` | 429 from the provider | "The AI service is busy. Please try again shortly." |
| `provider_timeout` | `TimeoutError` | "The AI service took too long. Please try again." |
| `quota_unavailable` | 503 from the quota store | "The assistant is temporarily unavailable. Please try again." |
| `tool_failure` | Existing typed tool outcomes | Existing tool-specific alerts; never "no courses found." |

Server responses keep stable machine codes (`quota_exhausted`, `temporarily_unavailable`, `conversation_limit`, `payload_too_large`). Raw provider messages are never echoed to students.

---

## 5. Database design

Migration: `supabase/migrations/20261028_assistant_admin_ops.sql`, reflected in `supabase/schema.sql`.

### 5.1 `app_config` additions (nullable = inherit environment default)

| Column | Bounds | Default |
|---|---|---|
| `ai_quota_per_hour` | 1–500 | inherit `AGENT_RATE_LIMIT_PER_HOUR` (30) |
| `ai_quota_per_day` | 1–2000 | inherit `AGENT_RATE_LIMIT_PER_DAY` (80) |
| `ai_max_turns` | 1–100 | inherit `AGENT_MAX_TURNS_PER_CONVERSATION` (30) |
| `ai_history_turns` | 0–20 | inherit `AGENT_HISTORY_TURNS` (8) |
| `ai_max_steps` | 1–12 | inherit `AGENT_MAX_STEPS` (8) |
| `ai_max_output_tokens` | 128–4096 | inherit `AI_MAX_OUTPUT_TOKENS` (2000) |
| `ai_timeout_ms` | 5000–60000 | inherit `AI_TIMEOUT_MS` (30000) |

CHECK constraints enforce the same ranges in the database. The server also clamps on read, so a bad historical row cannot exceed a safety ceiling.

### 5.2 `assistant_turn_charges`

```sql
create table public.assistant_turn_charges (
  user_hash text not null,
  turn_key text not null,
  charged_at timestamptz not null default now(),
  continuations integer not null default 0,
  primary key (user_hash, turn_key)
);
```

Indexed on `charged_at` for pruning. Service-role only, RLS enabled.

### 5.3 `assistant_usage_events`

One row per executed run (and per denial/rejection):

- `run_key` (unique), `user_hash`, `thread_hash`, `turn_key`;
- `occurred_at`, `outcome`, `is_continuation`, `charged`;
- `duration_ms`, `steps`, `tool_calls`;
- `input_tokens`, `cached_input_tokens`, `output_tokens`, `reasoning_tokens`;
- `error_class` (classified only; no message text).

Outcomes: `accepted`, `completed`, `provider_error`, `client_aborted`, `execution_limit`, `denied_quota`, `rejected`.

No prompts, replies, tool arguments, academic records, or raw user/thread identifiers are stored.

### 5.4 RPCs

- `claim_assistant_turn(...)` — atomic, idempotent claim described in §3.2; writes the `accepted` usage event. Returns `allowed`, `charged`, `window_kind`, `retry_after`.
- `assistant_usage_daily(target_days)` — daily aggregates for the admin page (accepted, completed, failures, denials, tokens, model time, steps). Avoids PostgREST row limits.
- `prune_assistant_telemetry()` — deletes usage events older than 90 days, charge rows older than 30 days, and rate-limit rows older than 7 days; returns deleted counts.

All RPCs are `security invoker`, `search_path = public`, revoked from `public/anon/authenticated`, and granted to `service_role` only.

---

## 6. Administrator configuration

### 6.1 Settings model

The smallest typed model is used: nullable columns on the existing single-row `app_config`, not a generic settings platform.

- Effective value = `clamp(DB value ?? environment default)`.
- Clearing a value (sending `null`) restores the environment default.
- All numeric writes are validated by Zod and by database CHECK constraints.
- The absolute ceilings above are constants in code and cannot be raised from the admin UI.

### 6.2 Permissions and audit

- `ai_assistant_access` and tester management: any admin (unchanged).
- Any patch containing a numeric assistant limit: platform admin required (the existing route check already rejects non-platform admins for non-access fields).
- Every change writes `config.update` with actor, target, and before/after values to `admin_audit_log`.
- Changes take effect on the next request; the access/settings cache is invalidated with the existing `app-config` tag and otherwise expires within 5 minutes.

### 6.3 Admin UI

Extend `/admin/assistant` without redesigning the student experience:

- Existing access/testers panel (unchanged).
- New "Limits" panel, visible only to platform admins, with inputs bounded to the server ranges, inherited-value hints, per-field reset, and a save action.
- New "Usage" panel for all admins: current hour/day accepted turns, denials, provider failures, token totals, estimated cost when pricing is configured, and a 14-day table.
- The panel states that counts are aggregate, users are pseudonymous, prompts/replies are not stored, and cost is an estimate when pricing is configured.

---

## 7. Usage visibility and cost

Measured (from runtime data):
- accepted runs and charged turns;
- quota denials by window;
- rejected requests;
- provider/tool failures by class;
- steps, tool calls, duration, and provider-reported tokens.

Estimated (clearly labelled):
- cost = non-cached input × input price + cached input × cached price + output × output price.
- Prices come from optional environment variables (`AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_CACHED_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`).
- If input/output pricing is absent, cost is `null` and the UI shows tokens only. No exact billing claim is made.

Current quota consumption is shown as aggregate accepted turns in the current hour/day and denials, plus the configured per-user limits. Per-user identities are not reconstructable from stored hashes.

---

## 8. Retention

| Data | Retention | Enforcement |
|---|---|---|
| `assistant_usage_events` | 90 days | opportunistic prune RPC |
| `assistant_turn_charges` | 30 days | opportunistic prune RPC |
| `request_rate_limits` | 7 days after window start | opportunistic prune RPC |
| `admin_audit_log` | retained indefinitely for now | documented; 365-day deletion requires compliance/product approval |
| Conversations/prompts/replies | not stored | no setting is exposed |
| Preview workers | no writes | in-memory quota and no usage persistence |

The prune RPC is invoked at most once every 6 hours per isolate after a finalized run, fire-and-forget with errors logged. It is also callable manually with the service key. This avoids a cron scheduler or new infrastructure; if a durable schedule is later required, it is a documented follow-up.

---

## 9. Testing plan

Focused tests, added alongside existing suites:

1. Turn-key derivation is stable across retries/continuations, distinct across users/threads/messages, and never contains raw ids or prompt text.
2. Quota claim contract: both windows, no partial increment, denial metadata, fail-closed errors, preview idempotency.
3. SQL static contract: advisory lock, unique charge key, atomic both-window updates, bounds/CHECKs, service-role grants, prune cutoffs.
4. Route behavior: continuations and retries reuse a charge; 413/409 before charging; 429 with `Retry-After`; 503 on quota failure; client headers cannot select a run context or override config.
5. Admin settings: platform-only numeric changes; non-admin denial; invalid/out-of-range rejection; null reset; audit payload.
6. Usage API: admin-only, aggregate fields only, no hashes/content, estimate flag and null cost when pricing is absent.
7. Telemetry: token/step aggregation, error classification, no prompt/reply/argument storage, cancellation handling.
8. Student error mapping for quota, execution, provider balance, provider errors, and quota-service unavailability.
9. Retention: prune SQL cutoffs and the 6-hour throttle.
10. Full existing suite, typecheck, lint, and build; discovery/reference/timetable tests unchanged.

A local Supabase concurrency test is added as an opt-in integration test. If the local stack is unavailable, the SQL advisory-lock contract is verified statically and the limitation is reported.

---

## 10. Security and privacy

- Quota and usage are service-role-only tables with RLS enabled and no client grants.
- The run-context header is overwritten by the server; client-supplied values are ignored.
- Provider/runtime configuration remains server-side and non-overridable.
- Admin usage responses contain aggregates only; no user hashes, thread hashes, prompts, or replies.
- Logs and telemetry never contain prompt text, reply text, tool arguments, or raw Clerk ids.
- Quota failures fail closed; usage persistence failures never block a response and are logged without content.

---

## 11. Implementation matrix

| Status | Items |
|---|---|
| **Already implemented and sufficient** | Clerk auth; access modes; admin roles/audit; `app_config`; atomic per-window counters; fail-closed quota; server-only provider config; step token instrumentation; in-memory conversations; admin assistant page shell; SQL snapshot tests |
| **Implemented but corrected by D** | Charge ordering; continuation charging; hour/day atomicity; retry idempotency; configurable limits; hardcoded step budget; usage persistence; error mapping |
| **Missing, delivered by D** | Turn ledger; atomic claim RPC; typed settings overlay; usage events + admin API/UI; prune RPC; cost estimates; student messages |
| **Optional/deferred** | Per-user identity reports; historical cost snapshots; cron retention; authenticated browser verification |
| **Blocked on product/compliance** | `admin_audit_log` deletion schedule |

---

## 12. Alternatives considered

1. **Charge every HTTP run (status quo).** Rejected: double-charges frontend-tool continuations and retries, contrary to the per-turn intent.
2. **Charge only when the request ends in a user message, trusting the client.** Rejected: a client can append a fake tool result to avoid charging. The turn ledger plus bounded replay window is safer.
3. **Use CopilotKit `runId` as the idempotency key.** Rejected: the client library generates a new run id for continuation runs, so it does not identify a logical turn.
4. **Use the in-memory runner to detect continuations.** Rejected: isolates are ephemeral and requests can land on different workers.
5. **Refund provider failures.** Deferred: it changes the existing charging policy and requires debit/refund state; the brief says not to do this silently.
6. **A generic settings platform or a separate rate limiter.** Rejected: the single-row `app_config` and existing counter table are sufficient.
7. **Cron-based retention.** Deferred: no scheduler exists; the opportunistic prune is the minimal bounded alternative.
8. **Persist prompts/replies for richer analytics.** Rejected: violates the privacy boundary and is unnecessary for quota/cost visibility.

---

## 13. Out of scope

V2.3.5-C persistence, conversation restoration/summarization, planning-preference ledgers, chat-retention settings without enforcement, Feasible Plan Builder, new recommendation algorithms, timetable mutation, registration automation, provider migration, chat redesign, university-wide billing, and benchmark-score optimization.
