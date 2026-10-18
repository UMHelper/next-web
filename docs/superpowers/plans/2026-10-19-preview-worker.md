# Preview Testing Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the current site to a separate `next-web-preview` Cloudflare Worker that uses the existing DeepSeek key and the production Supabase database with all writes blocked.

**Architecture:** A pure decision function (`evaluateSupabaseRequest`) allows only `GET`/`HEAD` and an explicit read-only RPC allowlist. It is applied in two places: a `fetch` wrapper installed in `createSupabaseAdminClient()` and the admin relay route (which uses raw `fetch`). Everything is gated by `PREVIEW_DB_READONLY=1` / `PREVIEW_MODE=1`, which only the preview env sets, so production is unchanged. The preview Worker is a `wrangler.jsonc` `env.preview` with no R2 or D1 binding. The preview build uses OpenNext's dummy cache, and deploys via `scripts/deploy-preview.sh`.

**Tech Stack:** Next.js 15, `@opennextjs/cloudflare` 1.16.6, Wrangler 4, `@supabase/supabase-js`, Vitest 2, Clerk (development instance).

Spec: `docs/superpowers/specs/2026-10-19-preview-worker-design.md`

## Global Constraints

- Production behavior must not change: no new code path may run unless `PREVIEW_DB_READONLY === "1"` or `PREVIEW_MODE === "1"`. Anything else (unset, `"0"`, `"true"`) is off.
- The read-only guard fails closed: unknown method, unknown endpoint, or a non-allowlisted RPC is rejected.
- `consume_rate_limit` must never be on the read-only RPC allowlist.
- Preview must not bind production's R2 bucket or D1 database, and must not create its own. `env.preview` has no `r2_buckets` or `d1_databases`. When `PREVIEW_DB_READONLY === "1"`, `open-next.config.ts` sets `incrementalCache` and `tagCache` to `"dummy"`. Production builds leave that flag unset and keep the R2 and D1 caches.
- No secret values are written to any committed file or printed to the terminal. Secrets go in with `wrangler secret put`, and `.env.preview.local` is git-ignored by the existing `.env*.local` rule.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` for preview must start with `pk_test_`.
- Test command: `npx vitest run <path>`. Lint: `npm run lint` (`--max-warnings=0`).
- Commits stage explicit paths only. The working tree already has unrelated uncommitted changes (`lib/assistant/agent.ts`, `tests/assistant/agent.test.ts`, and others), and they must not be swept in. Only commit if the user has said commits are wanted.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/supabase/readonly-guard.ts` | Create | Pure guard: flag check, allowlist, decision function, `fetch` wrapper |
| `tests/supabase/readonly-guard.test.ts` | Create | Unit tests for the guard, plus the SQL read-only check of the allowlist |
| `lib/supabase/shared.ts` | Modify | Install the guard fetch when the flag is set |
| `tests/supabase/shared.test.ts` | Create | Client wiring tests |
| `app/api/admin/supabase/[...path]/route.ts` | Modify | Apply the guard decision to relay requests |
| `tests/api/admin/supabase-relay.test.ts` | Modify | Relay guard tests |
| `lib/rate-limit.ts` | Modify | In-memory limiter when the flag is set |
| `tests/supabase/preview-rate-limit.test.ts` | Create | Limiter tests |
| `lib/assistant/access.ts` | Modify | Preview access-mode override |
| `tests/assistant/access.test.ts` | Modify | Override tests |
| `open-next.config.ts` | Modify | Dummy caches when `PREVIEW_DB_READONLY=1` |
| `wrangler.jsonc` | Modify | `env.preview` block, no R2 or D1 |
| `scripts/deploy-preview.sh` | Create | Validate env, build, deploy |
| `package.json` | Modify | `deploy:preview` script |
| `.env.example` | Modify | Document preview variables |
| `docs/preview-worker.md` | Create | Runbook |

---

### Task 1: Read-only guard module

**Files:**
- Create: `lib/supabase/readonly-guard.ts`
- Test: `tests/supabase/readonly-guard.test.ts`

**Interfaces:**
- Consumes: nothing (no app imports; reads `process.env` only).
- Produces (later tasks rely on these exact names):
  - `PREVIEW_READONLY_CODE: "PREVIEW_READONLY"`
  - `PREVIEW_READONLY_MESSAGE: string`
  - `READONLY_RPC_ALLOWLIST: ReadonlySet<string>`
  - `isReadonlyPreview(env?: Record<string, string | undefined>): boolean`
  - `type GuardDecision = { allowed: true } | { allowed: false; reason: string }`
  - `evaluateSupabaseRequest(method: string, pathname: string): GuardDecision`
  - `createReadonlyFetch(base?: typeof fetch): typeof fetch`

- [ ] **Step 1: Write the failing tests**

Create `tests/supabase/readonly-guard.test.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  PREVIEW_READONLY_CODE,
  READONLY_RPC_ALLOWLIST,
  createReadonlyFetch,
  evaluateSupabaseRequest,
  isReadonlyPreview,
} from "@/lib/supabase/readonly-guard";

describe("isReadonlyPreview", () => {
  it("is on only for exactly '1'", () => {
    expect(isReadonlyPreview({ PREVIEW_DB_READONLY: "1" })).toBe(true);
    expect(isReadonlyPreview({})).toBe(false);
    expect(isReadonlyPreview({ PREVIEW_DB_READONLY: "0" })).toBe(false);
    expect(isReadonlyPreview({ PREVIEW_DB_READONLY: "true" })).toBe(false);
    expect(isReadonlyPreview({ PREVIEW_DB_READONLY: "" })).toBe(false);
  });
});

describe("evaluateSupabaseRequest", () => {
  it("allows GET and HEAD on any path", () => {
    expect(evaluateSupabaseRequest("GET", "/rest/v1/course_noporf").allowed).toBe(true);
    expect(evaluateSupabaseRequest("HEAD", "/rest/v1/course_noporf").allowed).toBe(true);
    expect(evaluateSupabaseRequest("get", "/rest/v1/comment").allowed).toBe(true);
  });

  it("allows POST to an allowlisted rpc only", () => {
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/get_schedule_list").allowed).toBe(true);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/get_schedule_list/").allowed).toBe(true);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/consume_rate_limit").allowed).toBe(false);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/insert_comment_and_refresh_prof_stats").allowed).toBe(false);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/admin_apply_schedule").allowed).toBe(false);
  });

  it("matches rpc names exactly", () => {
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/GET_SCHEDULE_LIST").allowed).toBe(false);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/get_schedule_list/extra").allowed).toBe(false);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/get_schedule_list_x").allowed).toBe(false);
  });

  it("rejects every other write", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post", "patch"]) {
      const decision = evaluateSupabaseRequest(method, "/rest/v1/comment");
      expect(decision.allowed).toBe(false);
    }
    expect(evaluateSupabaseRequest("DELETE", "/storage/v1/object/bucket/file").allowed).toBe(false);
    expect(evaluateSupabaseRequest("POST", "/auth/v1/admin/users").allowed).toBe(false);
  });

  it("rejects unknown methods", () => {
    expect(evaluateSupabaseRequest("OPTIONS", "/rest/v1/comment").allowed).toBe(false);
    expect(evaluateSupabaseRequest("TRACE", "/rest/v1/comment").allowed).toBe(false);
  });

  it("never allowlists consume_rate_limit", () => {
    expect(READONLY_RPC_ALLOWLIST.has("consume_rate_limit")).toBe(false);
  });
});

describe("createReadonlyFetch", () => {
  const ok = () => new Response("[]", { status: 200 });

  it("rejects a write with a PostgREST-shaped 403 and never calls the network", async () => {
    const base = vi.fn(ok);
    const guarded = createReadonlyFetch(base as unknown as typeof fetch);

    const response = await guarded("https://x.supabase.co/rest/v1/comment", {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body.code).toBe(PREVIEW_READONLY_CODE);
    expect(typeof body.message).toBe("string");
    expect(base).not.toHaveBeenCalled();
  });

  it("passes reads through with the original arguments", async () => {
    const base = vi.fn(ok);
    const guarded = createReadonlyFetch(base as unknown as typeof fetch);
    const init = { headers: { apikey: "k" } };

    const response = await guarded("https://x.supabase.co/rest/v1/comment?select=*", init);

    expect(response.status).toBe(200);
    expect(base).toHaveBeenCalledWith("https://x.supabase.co/rest/v1/comment?select=*", init);
  });

  it("passes an allowlisted rpc through", async () => {
    const base = vi.fn(ok);
    const guarded = createReadonlyFetch(base as unknown as typeof fetch);

    await guarded("https://x.supabase.co/rest/v1/rpc/get_popular_courses", { method: "POST", body: "{}" });

    expect(base).toHaveBeenCalledTimes(1);
  });

  it("reads the method and url from a Request or URL input", async () => {
    const base = vi.fn(ok);
    const guarded = createReadonlyFetch(base as unknown as typeof fetch);

    const blocked = await guarded(
      new Request("https://x.supabase.co/rest/v1/comment", { method: "DELETE" }),
    );
    expect(blocked.status).toBe(403);

    const allowed = await guarded(new URL("https://x.supabase.co/rest/v1/comment"));
    expect(allowed.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(1);
  });
});

describe("READONLY_RPC_ALLOWLIST", () => {
  const root = process.cwd();
  const sqlFiles = [
    path.join(root, "supabase/schema.sql"),
    ...fs
      .readdirSync(path.join(root, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => path.join(root, "supabase/migrations", name)),
  ];
  const sources = sqlFiles.map((file) => fs.readFileSync(file, "utf8"));

  /** Returns every definition body (text between the $tag$ delimiters) of `public.<name>`. */
  function definitionBodies(name: string): string[] {
    const bodies: string[] = [];
    const header = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, "gi");
    for (const text of sources) {
      for (const match of text.matchAll(header)) {
        const afterHeader = text.slice(match.index! + match[0].length);
        const open = afterHeader.match(/\$([A-Za-z_]*)\$/);
        if (!open || open.index === undefined) continue;
        const delimiter = `$${open[1]}$`;
        const bodyStart = open.index + delimiter.length;
        const bodyEnd = afterHeader.indexOf(delimiter, bodyStart);
        if (bodyEnd === -1) continue;
        bodies.push(afterHeader.slice(bodyStart, bodyEnd));
      }
    }
    return bodies;
  }

  const WRITE_PATTERN =
    /\b(insert\s+into|update\s+[\w."]+\s+set|delete\s+from|truncate\b|alter\s+table|drop\s+(table|function)|create\s+table)/i;

  it.each([...READONLY_RPC_ALLOWLIST])("%s is defined in SQL and contains no write statement", (name) => {
    const bodies = definitionBodies(name);
    expect(bodies.length, `no definition of public.${name} found in supabase/`).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toMatch(WRITE_PATTERN);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/supabase/readonly-guard.test.ts`
Expected: FAIL, `Failed to resolve import "@/lib/supabase/readonly-guard"`.

- [ ] **Step 3: Write the implementation**

Create `lib/supabase/readonly-guard.ts`:

```ts
export const PREVIEW_READONLY_CODE = "PREVIEW_READONLY";
export const PREVIEW_READONLY_MESSAGE = "Preview worker is read-only";

/**
 * RPCs a preview worker may call against the production database. Every entry
 * was checked to contain no write statement (enforced by
 * tests/supabase/readonly-guard.test.ts). `consume_rate_limit` is deliberately
 * absent because it writes counters; preview uses an in-memory limiter instead.
 */
export const READONLY_RPC_ALLOWLIST: ReadonlySet<string> = new Set([
  "get_comment_list",
  "get_comment_page",
  "get_comment_page_v2",
  "get_course_list_by_prof",
  "get_offer_list_by_prof",
  "get_popular_courses",
  "get_prof_course_id",
  "get_schedule_list",
  "search_courses",
  "search_instructors_with_courses",
  "search_planner_courses",
  "search_planner_instructors",
]);

const RPC_PATH = /^\/rest\/v1\/rpc\/([A-Za-z_][A-Za-z0-9_]*)\/?$/;

export type GuardDecision = { allowed: true } | { allowed: false; reason: string };

export function isReadonlyPreview(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.PREVIEW_DB_READONLY === "1";
}

/** Pure decision used by both the client fetch wrapper and the admin relay route. */
export function evaluateSupabaseRequest(method: string, pathname: string): GuardDecision {
  const verb = method.toUpperCase();
  if (verb === "GET" || verb === "HEAD") return { allowed: true };

  if (verb === "POST") {
    const rpc = RPC_PATH.exec(pathname);
    if (rpc && READONLY_RPC_ALLOWLIST.has(rpc[1])) return { allowed: true };
    if (rpc) return { allowed: false, reason: `rpc ${rpc[1]} is not on the read-only allowlist` };
  }

  return { allowed: false, reason: `${verb} ${pathname} is a write` };
}

function describeInput(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
): { method: string; pathname: string } {
  const isRequest = typeof Request !== "undefined" && input instanceof Request;
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (isRequest ? input.method : "GET");
  return { method, pathname: new URL(url, "http://localhost").pathname };
}

export function createReadonlyFetch(
  base: typeof fetch = (input, init) => fetch(input, init),
): typeof fetch {
  return async (input, init) => {
    const { method, pathname } = describeInput(input, init);
    const decision = evaluateSupabaseRequest(method, pathname);
    if (!decision.allowed) {
      return new Response(
        JSON.stringify({
          message: PREVIEW_READONLY_MESSAGE,
          code: PREVIEW_READONLY_CODE,
          details: decision.reason,
          hint: null,
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }
    return base(input, init);
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/supabase/readonly-guard.test.ts`
Expected: PASS. If an `it.each` allowlist case fails with "no definition found" or a write-pattern match, **stop and read that function's SQL**. If it really writes, remove it from `READONLY_RPC_ALLOWLIST`. Only loosen `WRITE_PATTERN` if the match is a comment or string and not a statement.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/readonly-guard.ts tests/supabase/readonly-guard.test.ts
git commit -m "feat(preview): add read-only Supabase request guard"
```

---

### Task 2: Install the guard in the Supabase client and the admin relay

**Files:**
- Modify: `lib/supabase/shared.ts`
- Modify: `app/api/admin/supabase/[...path]/route.ts:1-8` (imports) and `:44-47` (after the path check)
- Create: `tests/supabase/shared.test.ts`
- Modify: `tests/api/admin/supabase-relay.test.ts`

**Interfaces:**
- Consumes: `isReadonlyPreview`, `createReadonlyFetch`, `evaluateSupabaseRequest`, `PREVIEW_READONLY_CODE`, `PREVIEW_READONLY_MESSAGE` from Task 1.
- Produces: no new exports. `createSupabaseAdminClient()` keeps its signature.

- [ ] **Step 1: Write the failing client tests**

Create `tests/supabase/shared.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { createSupabaseAdminClient } from "@/lib/supabase/shared";

type ClientOptions = { global?: { fetch?: typeof fetch } };

function optionsPassedToCreateClient(): ClientOptions {
  const call = createClient.mock.calls.at(-1) as unknown as [string, string, ClientOptions];
  return call[2];
}

describe("createSupabaseAdminClient", () => {
  beforeEach(() => {
    createClient.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("installs no custom fetch by default", () => {
    createSupabaseAdminClient();
    expect(optionsPassedToCreateClient().global).toBeUndefined();
  });

  it.each(["0", "true", ""])("installs no custom fetch when the flag is %j", (value) => {
    vi.stubEnv("PREVIEW_DB_READONLY", value);
    createSupabaseAdminClient();
    expect(optionsPassedToCreateClient().global).toBeUndefined();
  });

  it("installs a guard fetch that blocks writes when the flag is 1", async () => {
    vi.stubEnv("PREVIEW_DB_READONLY", "1");
    const network = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", network);

    createSupabaseAdminClient();
    const guarded = optionsPassedToCreateClient().global?.fetch;
    expect(guarded).toBeTypeOf("function");

    const blocked = await guarded!("https://x.supabase.co/rest/v1/comment", { method: "POST" });
    expect(blocked.status).toBe(403);
    expect(network).not.toHaveBeenCalled();

    const read = await guarded!("https://x.supabase.co/rest/v1/comment");
    expect(read.status).toBe(200);
    expect(network).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/supabase/shared.test.ts`
Expected: FAIL on the `flag is 1` test (`global` is undefined, so `guarded` is not a function). The other cases pass.

- [ ] **Step 3: Wire the guard into `shared.ts`**

Replace the whole of `lib/supabase/shared.ts` with:

```ts
import { createClient } from "@supabase/supabase-js";

import { createReadonlyFetch, isReadonlyPreview } from "./readonly-guard";

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing required Supabase env: ${name}`);
  }

  return value;
}

export function createSupabaseAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      // Preview workers read production data. Block every write at the source.
      ...(isReadonlyPreview() ? { global: { fetch: createReadonlyFetch() } } : {}),
    },
  );
}
```

- [ ] **Step 4: Run to verify the client tests pass**

Run: `npx vitest run tests/supabase/shared.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Write the failing relay tests**

In `tests/api/admin/supabase-relay.test.ts`, change the first import to `import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";`. Then, inside `describe("/api/admin/supabase relay", ...)`, directly after the `beforeEach` block, add:

```ts
  afterEach(() => {
    vi.unstubAllEnvs();
  });
```

Add these tests at the end of that same `describe`, before its closing `});`:

```ts
  describe("when PREVIEW_DB_READONLY is 1", () => {
    beforeEach(() => {
      vi.stubEnv("PREVIEW_DB_READONLY", "1");
    });

    it("blocks table writes without calling upstream", async () => {
      const request = new Request("http://localhost/api/admin/supabase/rest/v1/comment", {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request, ctx("rest", "v1", "comment"));

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({ code: "PREVIEW_READONLY" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("blocks non-allowlisted rpc calls", async () => {
      const request = new Request("http://localhost/api/admin/supabase/rest/v1/rpc/consume_rate_limit", {
        method: "POST",
        body: "{}",
        headers: { "Content-Type": "application/json" },
      });
      const response = await POST(request, ctx("rest", "v1", "rpc", "consume_rate_limit"));

      expect(response.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("still forwards reads", async () => {
      const response = await GET(
        new Request("http://localhost/api/admin/supabase/rest/v1/course_noporf?select=New_code"),
        ctx("rest", "v1", "course_noporf"),
      );

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  it("forwards writes when the preview flag is off", async () => {
    const request = new Request("http://localhost/api/admin/supabase/rest/v1/course_noporf", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request, ctx("rest", "v1", "course_noporf"));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 6: Run to verify the relay tests fail**

Run: `npx vitest run tests/api/admin/supabase-relay.test.ts`
Expected: FAIL. The three read-only cases that expect 403 fail because the relay currently forwards the writes. The reads case and the flag-off case pass.

- [ ] **Step 7: Apply the guard to the relay route**

In `app/api/admin/supabase/[...path]/route.ts`, add this import after the existing `@/lib/supabase-relay` import block:

```ts
import {
  PREVIEW_READONLY_CODE,
  PREVIEW_READONLY_MESSAGE,
  evaluateSupabaseRequest,
  isReadonlyPreview,
} from "@/lib/supabase/readonly-guard";
```

Then insert this block right after the `isAllowedRelayPath` check, before `const base = ...`:

```ts
    if (isReadonlyPreview()) {
      const decision = evaluateSupabaseRequest(request.method, `/${path.join("/")}`);
      if (!decision.allowed) {
        return relayError(PREVIEW_READONLY_CODE, PREVIEW_READONLY_MESSAGE, 403);
      }
    }
```

- [ ] **Step 8: Run to verify the relay tests pass**

Run: `npx vitest run tests/api/admin/supabase-relay.test.ts tests/supabase`
Expected: PASS.

- [ ] **Step 9: Scan for any other place that holds the secret key or talks to Supabase directly**

Run: `rg -n "SUPABASE_SECRET_KEY|createClient\(" app lib components --glob '*.{ts,tsx}'`
Expected: only `lib/supabase/shared.ts` and `app/api/admin/supabase/[...path]/route.ts` use `SUPABASE_SECRET_KEY`, and the only `createClient(` calls are in `shared.ts` and `lib/update/relay-client.ts` (the browser client, which goes through the relay). If anything else appears, route it through the guard or stop and ask.

- [ ] **Step 10: Commit**

```bash
git add lib/supabase/shared.ts "app/api/admin/supabase/[...path]/route.ts" tests/supabase/shared.test.ts tests/api/admin/supabase-relay.test.ts
git commit -m "feat(preview): enforce read-only guard in Supabase client and admin relay"
```

---

### Task 3: In-memory rate limiter for preview

**Files:**
- Modify: `lib/rate-limit.ts`
- Test: `tests/supabase/preview-rate-limit.test.ts`

**Interfaces:**
- Consumes: `isReadonlyPreview` from Task 1.
- Produces: `consumeRateLimit(input)` is unchanged in signature and return shape (`{ allowed, remaining, retryAfter }`). In preview it never calls Supabase.

- [ ] **Step 1: Write the failing tests**

Create `tests/supabase/preview-rate-limit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ default: { rpc } }));

import { consumeRateLimit } from "@/lib/rate-limit";

describe("consumeRateLimit in a read-only preview", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.stubEnv("PREVIEW_DB_READONLY", "1");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("allows up to the limit, then denies, without touching Supabase", async () => {
    const input = { key: "agent:user_a", action: "agent", limit: 2, windowSeconds: 60 } as const;

    const first = await consumeRateLimit(input);
    const second = await consumeRateLimit(input);
    const third = await consumeRateLimit(input);

    expect(first).toMatchObject({ allowed: true, remaining: 1 });
    expect(second).toMatchObject({ allowed: true, remaining: 0 });
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.retryAfter).toBe(60);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("counts down retryAfter and resets after the window", async () => {
    const input = { key: "agent:user_b", action: "agent", limit: 1, windowSeconds: 60 } as const;
    await consumeRateLimit(input);

    vi.advanceTimersByTime(20_000);
    const denied = await consumeRateLimit(input);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBe(40);

    vi.advanceTimersByTime(41_000);
    const fresh = await consumeRateLimit(input);
    expect(fresh.allowed).toBe(true);
  });

  it("keeps keys, actions, and windows independent", async () => {
    await consumeRateLimit({ key: "k1", action: "agent", limit: 1, windowSeconds: 60 });

    const otherKey = await consumeRateLimit({ key: "k2", action: "agent", limit: 1, windowSeconds: 60 });
    const otherAction = await consumeRateLimit({ key: "k1", action: "mcp", limit: 1, windowSeconds: 60 });
    const otherWindow = await consumeRateLimit({ key: "k1", action: "agent", limit: 1, windowSeconds: 3600 });

    expect(otherKey.allowed).toBe(true);
    expect(otherAction.allowed).toBe(true);
    expect(otherWindow.allowed).toBe(true);
  });

  it("defaults the window to one hour", async () => {
    const result = await consumeRateLimit({ key: "k3", action: "agent", limit: 1 });
    expect(result.retryAfter).toBe(3600);
  });
});

describe("consumeRateLimit outside preview", () => {
  it("still uses the database rpc", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ allowed: true, remaining: 4, reset_at: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    });

    const result = await consumeRateLimit({ key: "web:u:comment", action: "comment", limit: 5 });

    expect(rpc).toHaveBeenCalledWith("consume_rate_limit", {
      target_key: "web:u:comment",
      window_seconds: 3600,
      max_hits: 5,
    });
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/supabase/preview-rate-limit.test.ts`
Expected: FAIL. The preview cases fail because the code calls the mocked `rpc` (which returns `undefined`, so destructuring throws). The "outside preview" case passes.

- [ ] **Step 3: Implement the in-memory limiter**

In `lib/rate-limit.ts`, add this import below the existing import:

```ts
import { isReadonlyPreview } from "@/lib/supabase/readonly-guard";
```

Add this block between the `RateLimitRow` type and `export async function consumeRateLimit`:

```ts
type PreviewBucket = { count: number; resetAt: number };

const previewBuckets = new Map<string, PreviewBucket>();
const PREVIEW_PRUNE_THRESHOLD = 1000;

/**
 * Preview workers must not write rate-limit counters to the production
 * database, so they count in memory per isolate. Good enough for testing.
 */
function consumePreviewRateLimit(input: ConsumeRateLimitInput, windowSeconds: number) {
  const now = Date.now();

  if (previewBuckets.size > PREVIEW_PRUNE_THRESHOLD) {
    for (const [key, bucket] of previewBuckets) {
      if (bucket.resetAt <= now) previewBuckets.delete(key);
    }
  }

  const bucketKey = `${input.action}:${windowSeconds}:${input.key}`;
  let bucket = previewBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowSeconds * 1000 };
    previewBuckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= input.limit,
    remaining: Math.max(0, input.limit - bucket.count),
    retryAfter: Math.max(0, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}
```

In `consumeRateLimit`, right after `const windowSeconds = input.windowSeconds ?? 3600;`, add:

```ts
  if (isReadonlyPreview()) {
    return consumePreviewRateLimit(input, windowSeconds);
  }
```

- [ ] **Step 4: Run to verify pass, including the original test**

Run: `npx vitest run tests/supabase/preview-rate-limit.test.ts tests/rate-limit.test.ts tests/assistant/rate-limit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit.ts tests/supabase/preview-rate-limit.test.ts
git commit -m "feat(preview): use in-memory rate limiter when DB is read-only"
```

---

### Task 4: Preview assistant-access override

**Files:**
- Modify: `lib/assistant/access.ts:13-33`
- Modify: `tests/assistant/access.test.ts` (extend the `readAssistantAccess` describe, `beforeEach`/`afterEach`)

**Interfaces:**
- Consumes: `parseAssistantAccess` from `@/lib/assistant/access-mode`, already imported in `access.ts`.
- Produces: `readAssistantAccess()` returns `process.env.ASSISTANT_ACCESS_OVERRIDE` (parsed) when `PREVIEW_MODE === "1"` and the override is non-empty. Otherwise behavior is unchanged.

- [ ] **Step 1: Write the failing tests**

In `tests/assistant/access.test.ts`, change the first line to `import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";`. After the existing `beforeEach` block, add:

```ts
afterEach(() => {
  vi.unstubAllEnvs();
});
```

Add this `describe` after the `readAssistantAccess` describe block (before `describe("canUseAssistant", ...)`):

```ts
describe("readAssistantAccess preview override", () => {
  it("uses the override and skips the database when PREVIEW_MODE is 1", async () => {
    vi.stubEnv("PREVIEW_MODE", "1");
    vi.stubEnv("ASSISTANT_ACCESS_OVERRIDE", "everyone");
    setMode("off");

    await expect(readAssistantAccess()).resolves.toBe("everyone");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("treats an invalid override as off", async () => {
    vi.stubEnv("PREVIEW_MODE", "1");
    vi.stubEnv("ASSISTANT_ACCESS_OVERRIDE", "bogus");
    setMode("everyone");

    await expect(readAssistantAccess()).resolves.toBe("off");
  });

  it("ignores the override unless PREVIEW_MODE is exactly 1", async () => {
    vi.stubEnv("ASSISTANT_ACCESS_OVERRIDE", "everyone");
    setMode("off");
    await expect(readAssistantAccess()).resolves.toBe("off");

    vi.stubEnv("PREVIEW_MODE", "true");
    await expect(readAssistantAccess()).resolves.toBe("off");
  });

  it("falls back to the database when PREVIEW_MODE is 1 but no override is set", async () => {
    vi.stubEnv("PREVIEW_MODE", "1");
    vi.stubEnv("ASSISTANT_ACCESS_OVERRIDE", "");
    setMode("testers");

    await expect(readAssistantAccess()).resolves.toBe("testers");
  });

  it("lets canUseAssistant allow a signed-in user via the override", async () => {
    vi.stubEnv("PREVIEW_MODE", "1");
    vi.stubEnv("ASSISTANT_ACCESS_OVERRIDE", "everyone");
    setMode("off");

    await expect(canUseAssistant("user_1")).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/assistant/access.test.ts`
Expected: FAIL. The override cases that expect `everyone` fail (the code reads the mocked DB and returns `off`).

- [ ] **Step 3: Implement the override**

In `lib/assistant/access.ts`, insert this function directly above `readAssistantAccess` (and above its doc comment):

```ts
/**
 * Preview workers read a production database that has no `ai_assistant_access`
 * column yet. `PREVIEW_MODE=1` plus `ASSISTANT_ACCESS_OVERRIDE` supplies the
 * mode instead. Ignored everywhere else.
 */
function previewAccessOverride(): AssistantAccess | null {
  if (process.env.PREVIEW_MODE !== "1") return null;
  const raw = process.env.ASSISTANT_ACCESS_OVERRIDE;
  if (!raw) return null;
  return parseAssistantAccess(raw);
}
```

Then make the first lines of `readAssistantAccess` read:

```ts
export async function readAssistantAccess(): Promise<AssistantAccess> {
  const override = previewAccessOverride();
  if (override) return override;

  try {
```

(keep the rest of the existing function body unchanged).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/assistant/access.test.ts tests/assistant/access-mode.test.ts`
Expected: PASS. Note: `parseAssistantAccess("bogus")` returns `"off"`, and `"off"` is truthy, so the early return applies and the database is not read.

- [ ] **Step 5: Commit**

```bash
git add lib/assistant/access.ts tests/assistant/access.test.ts
git commit -m "feat(preview): allow assistant access mode override in preview"
```

---

### Task 5: Wrangler preview env, deploy script, and docs

**Files:**
- Modify: `open-next.config.ts`
- Modify: `wrangler.jsonc` (add `env.preview` before the final `}`)
- Create: `scripts/deploy-preview.sh`
- Modify: `package.json` (scripts)
- Modify: `.env.example` (append a section)
- Create: `docs/preview-worker.md`
- Modify: `docs/superpowers/specs/2026-10-19-preview-worker-design.md` and this plan, which already record the dummy-cache decision. Include them in the commit.

**Interfaces:**
- Consumes: the `PREVIEW_*` variable names from Tasks 1 to 4.
- Produces: `npm run deploy:preview`, and the Worker `next-web-preview`.

- [ ] **Step 1: Use the dummy cache for preview builds**

The human chose not to create an R2 bucket or a D1 database. Replace `open-next.config.ts` with:

```ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

const preview = process.env.PREVIEW_DB_READONLY === "1";

export default defineCloudflareConfig({
  incrementalCache: preview ? "dummy" : r2IncrementalCache,
  tagCache: preview ? "dummy" : d1NextTagCache,
});
```

Do not create any Cloudflare resources.

- [ ] **Step 2: Create the deploy script**

Create `scripts/deploy-preview.sh`:

```bash
#!/usr/bin/env bash
# Build and deploy the preview Worker (next-web-preview).
# Reads build-time values from .env.preview.local (git-ignored). Runtime secrets
# are set separately with `wrangler secret put <NAME> --env preview`.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE=".env.preview.local"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. See docs/preview-worker.md and the Preview worker section of .env.example." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "./$ENV_FILE"
set +a

case "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" in
  pk_test_*) ;;
  *)
    echo "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must be a Clerk development key (pk_test_...)." >&2
    exit 1
    ;;
esac

if [ "${PREVIEW_DB_READONLY:-}" != "1" ]; then
  echo "PREVIEW_DB_READONLY must be 1 in $ENV_FILE so the build cannot write to the production database." >&2
  exit 1
fi

: "${PREVIEW_MODE:?PREVIEW_MODE must be set in $ENV_FILE}"
: "${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL must be set in $ENV_FILE}"
: "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in $ENV_FILE}"
: "${SUPABASE_SECRET_KEY:?SUPABASE_SECRET_KEY must be set in $ENV_FILE}"

npx opennextjs-cloudflare build --env preview
npx opennextjs-cloudflare deploy --env preview
```

Run: `chmod +x scripts/deploy-preview.sh`

- [ ] **Step 3: Add the `env.preview` block to `wrangler.jsonc`**

Insert this as the last property of the top-level object (after the `"images"` block, add a comma after its closing brace). Do not add `r2_buckets` or `d1_databases`:

```jsonc
  "env": {
    "preview": {
      "name": "next-web-preview",
      "keep_vars": true,
      "upload_source_maps": true,
      "observability": {
        "enabled": true,
        "head_sampling_rate": 1,
        "logs": {
          "enabled": true,
          "head_sampling_rate": 1,
          "invocation_logs": true,
        },
      },
      "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
      "vars": {
        "COPILOTKIT_TELEMETRY_DISABLED": "true",
        "AI_BASE_URL": "https://api.deepseek.com",
        "AI_MODEL": "deepseek-flash",
        "AI_THINKING": "off",
        "AI_MAX_OUTPUT_TOKENS": "400",
        "AI_TIMEOUT_MS": "30000",
        "AGENT_RATE_LIMIT_PER_HOUR": "30",
        "AGENT_RATE_LIMIT_PER_DAY": "80",
        "AGENT_MAX_TURNS_PER_CONVERSATION": "30",
        "AGENT_HISTORY_TURNS": "8",
        "PREVIEW_MODE": "1",
        "PREVIEW_DB_READONLY": "1",
        "ASSISTANT_ACCESS_OVERRIDE": "everyone",
      },
      "assets": {
        "directory": ".open-next/assets",
        "binding": "ASSETS",
      },
      "services": [
        {
          "binding": "WORKER_SELF_REFERENCE",
          "service": "next-web-preview",
        },
      ],
      "images": {
        "binding": "IMAGES",
      },
    },
  },
```

Check the model value: `AI_MODEL` above matches `.env.example`. If the user's real model name differs, ask and use theirs.

- [ ] **Step 4: Add the npm script**

In `package.json`, add this entry directly after the `"upload"` script:

```json
    "deploy:preview": "bash scripts/deploy-preview.sh",
```

- [ ] **Step 5: Document the variables in `.env.example`**

Append to the end of `.env.example`:

```
# Preview worker (next-web-preview). Put build-time values in .env.preview.local (git-ignored),
# NOT in this file. See docs/preview-worker.md.
# Build-time (.env.preview.local):
#   NEXT_PUBLIC_SUPABASE_URL=<production url>
#   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<production publishable key>
#   SUPABASE_SECRET_KEY=<production secret key>
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<Clerk DEVELOPMENT key, must start with pk_test_>
#   PREVIEW_MODE=1
#   PREVIEW_DB_READONLY=1
# Runtime secrets (wrangler secret put <NAME> --env preview):
#   AI_API_KEY, SUPABASE_SECRET_KEY, CLERK_SECRET_KEY (sk_test_...), PLATFORM_ADMIN_EMAILS
# PREVIEW_DB_READONLY=1 blocks every write to Supabase and swaps the rate limiter for an in-memory one.
# PREVIEW_MODE=1 enables ASSISTANT_ACCESS_OVERRIDE=off|testers|everyone (production DB lacks the column).
```

- [ ] **Step 6: Write the runbook**

Create `docs/preview-worker.md`:

````markdown
# Preview worker

`next-web-preview` is a separate Cloudflare Worker that runs the current code against the production Supabase database **read-only**, with no ISR cache and a Clerk development instance. Design: `docs/superpowers/specs/2026-10-19-preview-worker-design.md`.

## What it does and does not do

- Reads production data. Every write is rejected with `PREVIEW_READONLY` (client, admin relay, build).
- No ISR cache. Each request renders fresh. Preview has no R2 bucket and no D1 database.
- Rate limits are in memory, per isolate. Nothing is written to production.
- The assistant is open to every signed-in user (`ASSISTANT_ACCESS_OVERRIDE=everyone`).
- Comments, votes, reports, timetable plans, admin edits, the update pipeline, and tester management all fail by design.

## One-time setup

1. Create `.env.preview.local` (git-ignored) with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   SUPABASE_SECRET_KEY=...
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   PREVIEW_MODE=1
   PREVIEW_DB_READONLY=1
   ```
2. Set the runtime secrets (each prompts for the value):
   ```
   npx wrangler secret put AI_API_KEY --env preview
   npx wrangler secret put SUPABASE_SECRET_KEY --env preview
   npx wrangler secret put CLERK_SECRET_KEY --env preview
   npx wrangler secret put PLATFORM_ADMIN_EMAILS --env preview
   ```

## Deploy

```
npm run deploy:preview
```

The script refuses to run unless the Clerk key starts with `pk_test_` and `PREVIEW_DB_READONLY=1`.

## Smoke test

1. Home page renders and a course page shows production data.
2. Sign in with a Clerk dev user whose email is in `PLATFORM_ADMIN_EMAILS`.
3. Open the assistant and send a message. A DeepSeek reply streams back.
4. Try to post a comment. The request fails with "Preview worker is read-only", and no new row appears in production.

## Teardown

```
npx wrangler delete --env preview
```
````

- [ ] **Step 7: Verify config syntax and bindings**

Run: `npx wrangler deploy --dry-run --env preview --outdir /tmp/next-web-preview-dry`
Expected: this needs `.open-next/worker.js`. If it does not exist yet, defer this step to Task 6. Do not build here, because a build reads the production database and needs `.env.preview.local`, which the user has not created yet. Check `wrangler.jsonc` instead: `env.preview` must have `WORKER_SELF_REFERENCE`, `ASSETS`, and `IMAGES`, the `PREVIEW_*` vars, and no `r2_buckets` or `d1_databases`. It must not name `next-web-inc-cache` or `next-web-tag-cache`.

- [ ] **Step 8: Commit**

```bash
git add open-next.config.ts wrangler.jsonc scripts/deploy-preview.sh package.json .env.example docs/preview-worker.md docs/superpowers/specs/2026-10-19-preview-worker-design.md docs/superpowers/plans/2026-10-19-preview-worker.md
git commit -m "feat(preview): add next-web-preview worker env, deploy script, and runbook"
```

---

### Task 6: Full verification, deploy, and smoke test

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything above, plus the user-supplied `.env.preview.local` and secrets.

- [ ] **Step 1: Run the full test suite and lint**

Run: `npm test && npm run lint`
Expected: all tests pass and lint reports no warnings. Any failure in files you did not touch (the working tree has other uncommitted work) is reported to the user, not "fixed".

- [ ] **Step 2: Collect the user-supplied inputs**

Ask the user to:
1. Create `.env.preview.local` (contents in `docs/preview-worker.md`, One-time setup step 1). Do not read the file back or print its values.
2. Run the four `wrangler secret put ... --env preview` commands from `docs/preview-worker.md`, One-time setup step 2. They type the values themselves, so the agent never sees them.
3. Confirm the Clerk dev instance exists and the dev user's email is the one given to `PLATFORM_ADMIN_EMAILS`.

Do not continue until the user confirms all three.

- [ ] **Step 3: Build and dry-run**

Do not deploy yet. First run a build only, using the same env loading as the script:

```bash
bash -c 'set -a; . ./.env.preview.local; set +a; npx opennextjs-cloudflare build --env preview'
```

Expected: build succeeds. Then run the Step 7 dry run from Task 5.

- [ ] **Step 4: Confirm the production Worker is untouched, before deploying**

Run: `npx wrangler deployments list --name next-web`
Expected: record the latest deployment id and timestamp. Compare again after Step 5.

- [ ] **Step 5: Deploy**

Run: `npm run deploy:preview`
Expected: prints a `https://next-web-preview.<account>.workers.dev` URL. Record it.

- [ ] **Step 6: Automated smoke checks**

```bash
URL=https://next-web-preview.<account>.workers.dev
curl -s -o /dev/null -w "%{http_code}\n" "$URL/"
curl -s "$URL/" | rg -o "pk_(test|live)_" | sort -u
```

Expected: the first prints `200`. The second prints only `pk_test_`. If `pk_live_` appears, stop, undeploy with `npx wrangler delete --env preview`, and investigate.

Then check a data page. Pick a course route from `app/` and confirm it returns 200 with real content. Then confirm the production Worker did not change: `npx wrangler deployments list --name next-web` must match the Step 4 record.

- [ ] **Step 7: Manual smoke checks with the user**

Walk the user through the "Smoke test" list in `docs/preview-worker.md`: sign in with the Clerk dev user, send an assistant message and see a DeepSeek reply, and try to post a comment and confirm the read-only rejection. Ask the user to confirm no new row appeared in the production `comment` table.

- [ ] **Step 8: Report**

Report to the user: the preview URL; which smoke checks passed (with evidence); the features that are intentionally non-functional in preview; and the teardown command.

---

## Self-Review

**Spec coverage**

| Spec section | Covered by |
|---|---|
| 2 Worker and infrastructure (name, dummy cache, sampling, script) | Task 5 Steps 1 to 4 |
| 3 Build-time values, secrets, vars, `.env.example` | Task 5 Steps 2, 3, 5; Task 6 Step 2 |
| 4 Guard (rules, allowlist, 403 shape, flag) | Task 1 |
| 4 Guard installed in the client | Task 2 Steps 1 to 4 |
| 4 Raw-fetch bypass (relay route) | Task 2 Steps 5 to 8 |
| 4 In-memory rate limiter | Task 3 |
| 4 Fail closed on a missing guard | Same expression in `shared.ts`; flag-on always wraps fetch (Task 2 test) |
| 5 Assistant override | Task 4 |
| 5 Admin via `PLATFORM_ADMIN_EMAILS` (secret) | Task 5 Step 6, Task 6 Step 2 |
| 7 Unit tests | Tasks 1 to 4 |
| 7 Build, deploy, smoke test, prod untouched | Task 6 |
| 8 Direct-client scan | Task 2 Step 9 |
| 9 Runbook | Task 5 Step 6 |

**Placeholder scan:** `<account>` is the workers.dev subdomain printed by Task 6 Step 5. No TBD or "add handling" steps.

**Type consistency:** `isReadonlyPreview`, `evaluateSupabaseRequest`, `createReadonlyFetch`, `PREVIEW_READONLY_CODE`, and `PREVIEW_READONLY_MESSAGE` are defined in Task 1 with the exact names used in Tasks 2 and 3. `consumeRateLimit` keeps its existing return shape.

**Known deviations from the spec:** the guard has no path-prefix exemption (stricter, fail closed, spec updated). `PLATFORM_ADMIN_EMAILS` is a secret and not a var (spec updated). The runbook is `docs/preview-worker.md` (spec table updated). Preview uses the dummy cache instead of its own R2 and D1 (human decision, spec updated).
