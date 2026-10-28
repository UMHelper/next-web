# V2.3.5-D Admin Configuration & Usage Controls — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trustworthy per-turn quota accounting, bounded admin-configurable limits, privacy-conscious usage visibility, and defined retention to the existing V2 assistant.

**Architecture:** Reuse `request_rate_limits` and `consume_rate_limit` storage. Add a small turn-charge ledger and one atomic `claim_assistant_turn` RPC. Overlay nullable limit columns on the existing single-row `app_config`. Record content-free usage events and extend the existing admin page. No conversation persistence.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase/Postgres, Zod, Vitest, CopilotKit v2, AI SDK v3 provider types.

**Spec:** `docs/superpowers/specs/2026-10-28-assistant-v2-3-5-d-admin-controls-design.md`

## Global Constraints

- Do not merge into `dev` or `main`; the integration target is `feat/global-assistant-v2`.
- No conversation, prompt, reply, or tool-argument persistence.
- Provider settings (`apiKey`, `baseURL`, `model`, `thinking`) stay environment-only.
- Quota checks fail closed; usage writes are best-effort and never block a response.
- Absolute ceilings are code constants and cannot be raised from the admin UI.
- Existing access-control behavior for authorized students is unchanged.
- Do not modify frozen discovery benchmarks or eval fixtures.
- Every task ends with its tests passing and a commit.

---

### Task 1: Database schema, claim RPC, prune RPC

**Files:**
- Create: `supabase/migrations/20261028_assistant_admin_ops.sql`
- Modify: `supabase/schema.sql` (append the same SQL under a migration comment)
- Test: `tests/database/assistant-ops-sql.test.ts`

**Interfaces:**
- Produces: `claim_assistant_turn(target_user_hash text, target_turn_key text, target_thread_hash text, target_run_key text, target_is_continuation boolean, hour_limit integer, day_limit integer)` returning `(allowed boolean, charged boolean, window_kind text, retry_after integer)`.
- Produces: `assistant_usage_daily(target_days integer)` returning daily aggregates.
- Produces: `prune_assistant_telemetry()` returning `(usage_deleted integer, charges_deleted integer, counters_deleted integer)`.
- Produces tables `assistant_turn_charges`, `assistant_usage_events`, and nullable `app_config.ai_*` columns.

- [ ] **Step 1: Write the failing SQL contract test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261028_assistant_admin_ops.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("assistant admin ops migration", () => {
  it("adds bounded nullable limit columns", () => {
    expect(migration).toContain("ai_quota_per_hour integer");
    expect(migration).toContain("check (ai_quota_per_hour is null or ai_quota_per_hour between 1 and 500)");
    expect(migration).toContain("ai_max_steps integer");
    expect(migration).toContain("check (ai_max_steps is null or ai_max_steps between 1 and 12)");
  });

  it("creates the idempotent turn ledger", () => {
    expect(migration).toContain("create table if not exists public.assistant_turn_charges");
    expect(migration).toContain("primary key (user_hash, turn_key)");
  });

  it("creates content-free usage events", () => {
    expect(migration).toContain("create table if not exists public.assistant_usage_events");
    expect(migration).toContain("outcome text not null");
    for (const forbidden of ["prompt", "reply", "content", "message_text"]) {
      expect(migration).not.toMatch(new RegExp(`\\b${forbidden}\\b`, "i"));
    }
  });

  it("serializes a user and consumes both windows only after both checks", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(target_user_hash, 0))");
    const fn = migration.slice(migration.indexOf("create or replace function public.claim_assistant_turn"));
    expect(fn.indexOf("if hour_count + 1 > hour_limit")).toBeLessThan(fn.indexOf("insert into public.request_rate_limits"));
    expect(fn.indexOf("if day_count + 1 > day_limit")).toBeLessThan(fn.indexOf("insert into public.request_rate_limits"));
    expect(fn).toContain("on conflict (user_hash, turn_key) do update");
  });

  it("grants only service_role and reloads PostgREST", () => {
    expect(migration).toContain("revoke all on public.assistant_usage_events from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update on public.assistant_usage_events to service_role");
    expect(migration).toContain("grant execute on function public.claim_assistant_turn");
    expect(migration).toContain("notify pgrst, 'reload schema'");
    expect(snapshot).toContain("assistant_turn_charges");
    expect(snapshot).toContain("assistant_usage_events");
  });
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npx vitest run tests/database/assistant-ops-sql.test.ts`
Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Write the migration**

Include, in this order:
1. `alter table public.app_config add column if not exists ...` for all seven nullable columns with named CHECK constraints.
2. `assistant_turn_charges` with primary key `(user_hash, turn_key)` and a `charged_at` index.
3. `assistant_usage_events` with a unique `run_key`, outcome CHECK, nullable token counters, and an `occurred_at` index.
4. `claim_assistant_turn` with the advisory lock, 5-minute replay lookup, both-window pre-check, both-window upsert, charge upsert, and an `accepted` or `denied_quota` event insert.
5. `assistant_usage_daily(target_days integer default 14)` aggregating by `date_trunc('day', occurred_at)`.
6. `prune_assistant_telemetry()` deleting usage older than 90 days, charges older than 30 days, counters older than 7 days.
7. RLS, revokes, service-role grants, and `notify pgrst, 'reload schema'`.

Use quoted output names only where needed; use `window_kind` rather than `window`.

- [ ] **Step 4: Run the contract test**

Run: `npx vitest run tests/database/assistant-ops-sql.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261028_assistant_admin_ops.sql supabase/schema.sql tests/database/assistant-ops-sql.test.ts
git commit -m "feat(assistant): add quota ledger, usage events, and retention schema"
```

---

### Task 2: Turn identity and atomic claim

**Files:**
- Create: `lib/assistant/turn-key.ts`
- Modify: `lib/assistant/rate-limit.ts`
- Test: `tests/assistant/turn-key.test.ts`
- Modify: `tests/assistant/rate-limit.test.ts`

**Interfaces:**
- Produces: `deriveTurnIdentity(input: { userId: string; threadId: string | undefined; messages: RunMessage[] }): { userHash: string; threadHash: string; turnKey: string; isContinuation: boolean }`.
- Produces: `claimAgentTurn(input: { userId: string; threadId: string | undefined; messages: RunMessage[]; runKey: string; limits: { perHour: number; perDay: number } }): Promise<AgentTurnClaim>` where `AgentTurnClaim = { allowed: true; charged: boolean; identity: TurnIdentity } | { allowed: false; window: "hour" | "day"; retryAfter: number; identity: TurnIdentity }`.
- Removes: `consumeAgentRateLimits` from the route path (keep a preview helper if useful).

- [ ] **Step 1: Write failing turn-key tests**

```ts
import { describe, expect, it } from "vitest";
import { deriveTurnIdentity } from "@/lib/assistant/turn-key";

const user = { id: "u1", role: "user", content: "question" };
const assistant = { id: "a1", role: "assistant", content: "answer" };
const tool = { id: "t1", role: "tool", toolCallId: "c1", content: "{}" };

it("is stable across retries and continuations", () => {
  const first = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [user] });
  const retry = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [user] });
  const continuation = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [user, assistant, tool] });
  expect(retry.turnKey).toBe(first.turnKey);
  expect(continuation.turnKey).toBe(first.turnKey);
  expect(continuation.isContinuation).toBe(true);
  expect(first.isContinuation).toBe(false);
});

it("changes for a new user message or thread", () => {
  const base = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [user] });
  const next = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [user, { id: "u2", role: "user", content: "next" }] });
  const otherThread = deriveTurnIdentity({ userId: "user_1", threadId: "t2", messages: [user] });
  expect(next.turnKey).not.toBe(base.turnKey);
  expect(otherThread.turnKey).not.toBe(base.turnKey);
});

it("never exposes raw ids or content", () => {
  const identity = deriveTurnIdentity({ userId: "user_1", threadId: "thread-secret", messages: [user] });
  const serialized = JSON.stringify(identity);
  expect(serialized).not.toContain("user_1");
  expect(serialized).not.toContain("thread-secret");
  expect(serialized).not.toContain("question");
});

it("falls back to a content fingerprint when the message id is missing", () => {
  const a = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [{ role: "user", content: "same" }] });
  const b = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [{ role: "user", content: "same" }] });
  const c = deriveTurnIdentity({ userId: "user_1", threadId: "t1", messages: [{ role: "user", content: "different" }] });
  expect(a.turnKey).toBe(b.turnKey);
  expect(a.turnKey).not.toBe(c.turnKey);
});
```

- [ ] **Step 2: Run it and confirm failure**

Run: `npx vitest run tests/assistant/turn-key.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement turn-key derivation**

```ts
import { createHash } from "node:crypto";
import type { RunMessage } from "@/lib/assistant/conversation";
import { hashUserId } from "@/lib/mcp/rate-limit";

export type TurnIdentity = {
  userHash: string;
  threadHash: string;
  turnKey: string;
  isContinuation: boolean;
};

const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

export function deriveTurnIdentity(input: {
  userId: string;
  threadId: string | undefined;
  messages: RunMessage[];
}): TurnIdentity {
  const turn = [...input.messages].reverse().find((message) => message.role === "user");
  const messageKey = typeof turn?.id === "string" && turn.id.length > 0
    ? turn.id
    : turn
      ? digest(JSON.stringify(turn.content ?? ""))
      : "no-user";
  const threadId = input.threadId ?? "no-thread";
  return {
    userHash: hashUserId(input.userId),
    threadHash: digest(threadId),
    turnKey: digest(`${hashUserId(input.userId)}\0${threadId}\0${messageKey}`),
    isContinuation: input.messages.at(-1)?.role === "tool",
  };
}
```

- [ ] **Step 4: Implement `claimAgentTurn`**

Production path calls `supabaseServer.rpc("claim_assistant_turn", {...})`. Preview path uses an in-memory map with 5-minute replay and hour/day counters. `isRateLimitDisabled()` returns `{ allowed: true, charged: false }` without counters. Storage errors throw so the route can fail closed.

- [ ] **Step 5: Update rate-limit tests**

Cover both windows, denial metadata, recent-charge reuse, stale-charge re-charge, preview behavior, and thrown errors. Use `vi.useFakeTimers()` for the preview replay window.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/assistant/turn-key.test.ts tests/assistant/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/assistant/turn-key.ts lib/assistant/rate-limit.ts tests/assistant/turn-key.test.ts tests/assistant/rate-limit.test.ts
git commit -m "feat(assistant): derive logical turns and claim quota atomically"
```

---

### Task 3: Typed settings overlay

**Files:**
- Create: `lib/assistant/settings.ts`
- Modify: `lib/assistant/config.ts` (add `maxSteps`)
- Modify: `lib/assistant/agent.ts` (use `config.maxSteps`)
- Test: `tests/assistant/settings.test.ts`
- Modify: `tests/assistant/config.test.ts`
- Modify: `tests/assistant/agent.test.ts`

**Interfaces:**
- Produces: `ASSISTANT_LIMIT_BOUNDS` and `ASSISTANT_LIMIT_FIELDS`.
- Produces: `readAssistantLimitOverrides(): Promise<AssistantLimitOverrides>` (raw nullable DB values).
- Produces: `resolveAssistantConfig(env?: Record<string,string|undefined>): Promise<AssistantConfig>` (env defaults overlaid by DB, then clamped).
- `AssistantConfig` gains `maxSteps: number`.

- [ ] **Step 1: Write failing settings tests**

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));
const maybeSingle = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  default: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) },
}));

import { resolveAssistantConfig } from "@/lib/assistant/settings";

it("uses environment defaults when the row has no overrides", async () => {
  maybeSingle.mockResolvedValue({ data: { ai_quota_per_hour: null }, error: null });
  const config = await resolveAssistantConfig({ AI_API_KEY: "k", AGENT_RATE_LIMIT_PER_HOUR: "10", AGENT_MAX_STEPS: "6" });
  expect(config.ratePerHour).toBe(10);
  expect(config.maxSteps).toBe(6);
});

it("lets database values win and clamps out-of-range values", async () => {
  maybeSingle.mockResolvedValue({ data: { ai_quota_per_hour: 5000, ai_max_steps: 99 }, error: null });
  const config = await resolveAssistantConfig({});
  expect(config.ratePerHour).toBe(500);
  expect(config.maxSteps).toBe(12);
});

it("falls back to environment values when the read fails", async () => {
  maybeSingle.mockResolvedValue({ data: null, error: { message: "db down" } });
  const config = await resolveAssistantConfig({ AGENT_RATE_LIMIT_PER_DAY: "42" });
  expect(config.ratePerDay).toBe(42);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/assistant/settings.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement bounds and overlay**

Define the seven fields exactly as the spec's §5.1 table. Clamp each resolved numeric value into its bounds. Read only the `ai_*` columns. On error or preview mode, log and use environment values. Wrap the DB read in `unstable_cache` with `["assistant-limits"]`, `tags: [CACHE_TAGS.appConfig]`, `revalidate: 300`.

- [ ] **Step 4: Add `maxSteps` to config**

`readAssistantConfig` parses `AGENT_MAX_STEPS` (default 8) and includes it in the returned object. Add it to `createAssistantAgent`'s `maxSteps`.

- [ ] **Step 5: Update existing config/agent tests**

Add `maxSteps: 8` to default and override expectations; assert `BuiltInAgent` receives the configured step budget.

- [ ] **Step 6: Run the tests**

Run: `npx vitest run tests/assistant/settings.test.ts tests/assistant/config.test.ts tests/assistant/agent.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/assistant/settings.ts lib/assistant/config.ts lib/assistant/agent.ts tests/assistant/settings.test.ts tests/assistant/config.test.ts tests/assistant/agent.test.ts
git commit -m "feat(assistant): add bounded database-backed runtime limits"
```

---

### Task 4: Run context, telemetry, and step metrics

**Files:**
- Create: `lib/assistant/run-context.ts`
- Create: `lib/assistant/telemetry.ts`
- Modify: `lib/assistant/metrics.ts`
- Modify: `lib/assistant/agent.ts`
- Test: `tests/assistant/telemetry.test.ts`
- Modify: `tests/assistant/metrics.test.ts`

**Interfaces:**
- Produces: `ASSISTANT_RUN_HEADER = "x-assistant-run-key"`.
- Produces: `registerRunContext(runKey, ctx)`, `getRunContext(runKey)`, `releaseRunContext(runKey)` where `ctx = { config: AssistantConfig; telemetry: RunTelemetry }`.
- Produces: `createRunTelemetry(seed)`, `finalizeRunUsage(telemetry, outcomeHint?)`, `recordRejectedRun(...)`.
- `withStepMetrics(model, telemetry?)` records each step.

- [ ] **Step 1: Write failing telemetry tests**

Cover: summed tokens across steps; steps/tool calls; `provider_balance` for status 402; `provider_auth` for 401; `timeout` for `TimeoutError`; `client_aborted` for `AbortError`; `execution_limit` when `steps >= maxSteps` and the last finish is `tool-calls`; no prompt/reply/tool arguments in the persisted payload.

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run tests/assistant/telemetry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement telemetry**

Use a bounded registry (`Map`, max 64, TTL 10 minutes) for run contexts. `RunTelemetry` accumulates:
```ts
type RunTelemetry = {
  runKey: string; userHash: string; threadHash: string; turnKey: string;
  isContinuation: boolean; charged: boolean; startedAt: number;
  steps: number; toolCalls: number; inputTokens: number | null;
  cachedInputTokens: number | null; outputTokens: number | null;
  reasoningTokens: number | null; lastFinish: string | null;
  errorClass: string | null; aborted: boolean;
};
```
`finalizeRunUsage` updates `assistant_usage_events` by `run_key` with outcome, duration, counters, and tokens. It returns early in preview mode. It never throws to the caller; errors are logged without content. `recordRejectedRun` inserts a `rejected` event best-effort.

- [ ] **Step 4: Extend `withStepMetrics`**

Add an optional telemetry argument. Replace `pipeThrough` with a backpressure-aware `ReadableStream` that inspects each part, records finish usage, catches source errors, and records cancellation. Keep the existing console line unchanged.

- [ ] **Step 5: Wire telemetry into the agent**

`createAssistantAgent(config, signal, telemetry?)` passes telemetry to `withStepMetrics`.

- [ ] **Step 6: Run telemetry and metrics tests**

Run: `npx vitest run tests/assistant/telemetry.test.ts tests/assistant/metrics.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/assistant/run-context.ts lib/assistant/telemetry.ts lib/assistant/metrics.ts lib/assistant/agent.ts tests/assistant/telemetry.test.ts tests/assistant/metrics.test.ts
git commit -m "feat(assistant): capture content-free run telemetry"
```

---

### Task 5: CopilotKit route accounting and usage finalization

**Files:**
- Modify: `app/api/copilotkit/[[...slug]]/route.ts`
- Modify: `tests/api/copilotkit.test.ts`

**Interfaces:**
- Consumes: `resolveAssistantConfig`, `claimAgentTurn`, `deriveTurnIdentity`, `registerRunContext`, `createRunTelemetry`, `finalizeRunUsage`, `recordRejectedRun`.
- Produces: stable error codes `quota_exhausted` (429, `Retry-After`), `temporarily_unavailable` (503), `conversation_limit` (409), `payload_too_large` (413).

- [ ] **Step 1: Update route tests first**

Add assertions for:
- 413 and 409 happen before any quota claim;
- 429 includes `Retry-After` and skips the runtime;
- quota throw → 503 and skips the runtime;
- the forwarded request carries `x-assistant-run-key`, overwriting a client-supplied value;
- a continuation uses the same turn key as its first run;
- the agent factory receives the resolved config and telemetry;
- the response body is wrapped and finalization runs on completion and cancellation.

Run: `npx vitest run tests/api/copilotkit.test.ts`
Expected: FAIL against the current route.

- [ ] **Step 2: Rework `handleRun` order**

1. parse + schema;
2. turn-limit check;
3. `prepareRunMessages` + 256 KB check;
4. derive identity;
5. `claimAgentTurn`;
6. on denial: `recordRejectedRun` is unnecessary (the RPC already wrote the denial); return 429;
7. register `RunContext`, generate `runKey = crypto.randomUUID()`, clone headers, `set(ASSISTANT_RUN_HEADER, runKey)`;
8. call the handler;
9. wrap the response body to finalize usage on close/error/cancel.

- [ ] **Step 3: Change the runtime agent factory**

Read the run key from the forwarded request, look up the context, and pass its config and telemetry to `createAssistantAgent`. Fall back to environment config when no context exists (`info`/`stop`).

- [ ] **Step 4: Wrap the response stream**

Use a backpressure-aware wrapper that forwards chunks unchanged, calls `finalizeRunUsage` exactly once on completion, error, or cancellation, and copies status/headers while dropping `content-length`. Await finalization before closing so the isolate stays alive for the write.

- [ ] **Step 5: Record pre-quota rejections**

Best-effort `recordRejectedRun` for authenticated `conversation_limit` and `payload_too_large` responses. Never block the response.

- [ ] **Step 6: Run the route tests**

Run: `npx vitest run tests/api/copilotkit.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/copilotkit/[[...slug]]/route.ts tests/api/copilotkit.test.ts
git commit -m "fix(assistant): charge once per turn and persist run outcomes"
```

---

### Task 6: Admin settings validation, permissions, and audit

**Files:**
- Modify: `lib/validation/admin.ts`
- Modify: `app/api/admin/app-config/route.ts`
- Test: `tests/validation/admin.test.ts`
- Modify: `tests/api/admin/app-config.test.ts`

**Interfaces:**
- `appConfigUpdateSchema` accepts the seven nullable `ai_*` numeric fields with the spec's bounds.
- Numeric assistant fields require `isPlatformAdmin`; `ai_assistant_access` remains any-admin.
- Audit `before` includes the previous assistant values.

- [ ] **Step 1: Write failing validation tests**

Assert each field accepts its min/max and `null`, rejects 0, non-integers, and ceiling+1, and rejects an empty patch.

- [ ] **Step 2: Write failing route tests**

Assert: non-platform admin can change access only; non-platform admin gets 403 for `ai_quota_per_hour`; platform admin can update limits; invalid values return 400; audit receives before/after.

- [ ] **Step 3: Implement**

Add the fields to Zod with `.nullable().optional()`. In POST, select the current assistant columns before updating, build `{ before, after }`, and require platform admin when any numeric assistant field is present.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/validation/admin.test.ts tests/api/admin/app-config.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/validation/admin.ts app/api/admin/app-config/route.ts tests/validation/admin.test.ts tests/api/admin/app-config.test.ts
git commit -m "feat(admin): validate and audit assistant limit changes"
```

---

### Task 7: Usage aggregation and cost estimates

**Files:**
- Create: `lib/assistant/usage.ts`
- Create: `app/api/admin/assistant/usage/route.ts`
- Test: `tests/assistant/usage.test.ts`
- Test: `tests/api/admin/assistant-usage.test.ts`

**Interfaces:**
- Produces: `estimateUsageCost(tokens, pricing)` returning `number | null`.
- Produces: `readAssistantUsageSummary(): Promise<AssistantUsageSummary>`:
```ts
type AssistantUsageSummary = {
  generatedAt: string;
  limits: { perHour: number; perDay: number };
  current: { chargedTurnsHour: number; chargedTurnsDay: number; denialsToday: number };
  totals: { accepted: number; completed: number; providerErrors: number; denied: number; rejected: number; inputTokens: number | null; outputTokens: number | null };
  daily: Array<{ day: string; accepted: number; completed: number; providerErrors: number; denied: number; rejected: number; inputTokens: number | null; outputTokens: number | null; estimatedCostUsd: number | null }>;
  cost: { estimate: true; configured: boolean; currency: "USD" };
};
```
- `GET /api/admin/assistant/usage` requires any admin and returns only aggregates.

- [ ] **Step 1: Write failing cost and aggregation tests**

Cover: null cost when input/output prices are absent; cached-token pricing; daily grouping; no `user_hash`, `thread_hash`, or content keys in the JSON response; non-admin 403.

- [ ] **Step 2: Implement cost estimation**

Read `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_CACHED_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`. If input or output price is missing or non-positive, return `null`. Treat cached tokens as a subset of input tokens.

- [ ] **Step 3: Implement the summary**

Use three head-count queries for the current hour/day charges and today's denials, and the `assistant_usage_daily(14)` RPC for the table. If the RPC fails, return an empty daily list with an `error: "usage_unavailable"` field rather than a 500 so the admin page still loads.

- [ ] **Step 4: Implement the route**

`requireAdmin()` then JSON with `Cache-Control: private, no-store`.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/assistant/usage.test.ts tests/api/admin/assistant-usage.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/assistant/usage.ts app/api/admin/assistant/usage/route.ts tests/assistant/usage.test.ts tests/api/admin/assistant-usage.test.ts
git commit -m "feat(admin): expose privacy-conscious usage and cost estimates"
```

---

### Task 8: Admin settings and usage UI

**Files:**
- Create: `components/admin/assistant-settings-client.tsx`
- Create: `components/admin/assistant-usage-client.tsx`
- Modify: `app/admin/assistant/page.tsx`
- Test: `tests/components/admin-assistant-settings.test.tsx` (jsdom)
- Modify: `tests/api/admin/assistant-page.test.ts`

**Interfaces:**
- `AssistantSettingsClient` receives `{ initial: { configured, effective, bounds }, canEdit: boolean }`.
- `AssistantUsageClient` receives `{ initial: AssistantUsageSummary }` and refreshes from `/api/admin/assistant/usage`.
- Page renders the existing access client, then settings (platform admins only), then usage (all admins).

- [ ] **Step 1: Write failing component tests**

Assert: inputs expose min/max; empty input sends `null`; invalid values are blocked client-side; non-platform admins see no editable limit form; usage renders "estimated" wording and a privacy note; refresh calls the endpoint.

- [ ] **Step 2: Implement the settings client**

Use the existing `Button`/`Input` components and `sonner` toasts. Save with `POST /api/admin/app-config`. Show "Inherited (default N)" when the configured value is `null`.

- [ ] **Step 3: Implement the usage client**

Cards for current hour/day/denials and totals; a daily table; a refresh button; labels for measured vs estimated and pseudonymous aggregates.

- [ ] **Step 4: Compose the page**

Read access, overrides, effective config, and usage server-side. Preserve the existing admin guard and access panel.

- [ ] **Step 5: Run component and page tests**

Run: `npx vitest run tests/components/admin-assistant-settings.test.tsx tests/api/admin/assistant-page.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/assistant-settings-client.tsx components/admin/assistant-usage-client.tsx app/admin/assistant/page.tsx tests/components/admin-assistant-settings.test.tsx tests/api/admin/assistant-page.test.ts
git commit -m "feat(admin): add assistant limit controls and usage panel"
```

---

### Task 9: Student-facing failure messages

**Files:**
- Modify: `lib/assistant/error-message.ts`
- Modify: `tests/assistant/error-message.test.ts`

**Interfaces:**
- Keep fixed, nontechnical strings. Map 429/`quota_exhausted`, `execution_limit`, 402/balance, provider auth/rate-limit/timeout, 503/`temporarily_unavailable`, and existing 401/403/409/413.

- [ ] **Step 1: Add failing cases**

Add table rows for each class, including provider messages such as `HTTP 402: Insufficient Balance`, `APICallError: 401`, `TimeoutError`, and `execution_limit`. Assert no raw provider text is returned.

- [ ] **Step 2: Implement the mapping**

Order specific patterns before the generic fallback. Do not include provider names, balances, URLs, or raw messages in the returned copy.

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/assistant/error-message.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/assistant/error-message.ts tests/assistant/error-message.test.ts
git commit -m "fix(assistant): clarify quota, provider, and execution failures"
```

---

### Task 10: Retention execution and full validation

**Files:**
- Modify: `lib/assistant/telemetry.ts` (prune throttle)
- Test: `tests/assistant/retention.test.ts`
- Create: `docs/superpowers/verification/2026-10-28-assistant-v2-3-5-d.md` (technical report)

**Interfaces:**
- Produces: `maybePruneAssistantTelemetry(now?: number): Promise<void>` that calls `prune_assistant_telemetry` at most once per 6 hours per isolate.

- [ ] **Step 1: Write the failing throttle test**

Use fake timers and a mocked RPC: first call runs; a call 1 hour later does not; a call 7 hours later runs again; a thrown prune error is logged and swallowed; preview mode never calls the RPC.

- [ ] **Step 2: Implement the throttle**

Call `maybePruneAssistantTelemetry()` fire-and-forget after finalizing a run. Do not await it in the response path.

- [ ] **Step 3: Run the focused suite**

Run: `npx vitest run tests/assistant tests/api tests/database`
Expected: PASS.

- [ ] **Step 4: Run the full gates**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all pass. Record the exact test-file/test counts and any build warnings.

- [ ] **Step 5: Browser acceptance (if possible)**

Start `npm run dev`, open `/admin/assistant`. Clerk authentication is required. Record whether an authenticated admin session was available; if not, state that the admin UI was verified only by component/API tests and report the limitation.

- [ ] **Step 6: Write the verification report and commit**

Include: decisions, schema/RPCs, quota contract, settings bounds, usage metrics and estimate semantics, retention, test counts, known limitations (authenticated browser check, local DB concurrency if unavailable), and rollback notes.

```bash
git add lib/assistant/telemetry.ts tests/assistant/retention.test.ts docs/superpowers/verification/2026-10-28-assistant-v2-3-5-d.md
git commit -m "feat(assistant): prune retained quota and usage data"
```

---

## Self-review notes

- Spec coverage: quota contract (Tasks 1–2, 5), settings (Tasks 3, 6, 8), usage/cost (Tasks 4, 7, 8), retention (Tasks 1, 10), student messaging (Task 9), testing (each task plus Task 10).
- Deliberate deferrals: authenticated browser acceptance and a cron-based prune schedule.
- No changes to discovery, reference, or timetable modules are planned; their suites are part of the regression gate.
