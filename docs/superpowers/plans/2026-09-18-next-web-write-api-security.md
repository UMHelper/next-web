# next-web 写接口安全与数据访问边界 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `next-web` 的评论、回复、投票写接口和 Supabase 数据边界收紧到“服务端 service role + 严格身份/输入校验 + 最小权限 RPC”，并修复评论 RPC 的隐私泄漏与硬编码 UM token。

**Architecture:** Next.js Route Handlers 是唯一写入口。Web 使用 Clerk v4 `authMiddleware` + `auth()` 派生身份；iOS 继续使用 `verifyIOSRequest` + `iosVersionGuard`。Supabase 表启用 RLS，`anon`/`authenticated` 的全部表/函数权限被撤销，所有服务端代码继续通过 `lib/supabase/server.ts` 拿到 service role 客户端。Rate limit 由 Postgres RPC 提供。

**Tech Stack:** Next.js 14 App Router、TypeScript 5.2、Clerk `@clerk/nextjs@4.31.8`、Supabase JS、Zod 3、Vitest 2、PostgreSQL 15。

**Spec:** `docs/superpowers/specs/2026-09-18-next-web-write-api-security-design.md`

## Global Constraints

- 保留工作区已有的 `lib/ios-version.ts`、`app/api/version/route.ts` 和 `.env.example` 中 iOS 版本控制改动，不要回退或覆盖。
- Supabase 环境变量固定为 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`；不要重新引入 `NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`SUPABASE_JWT_SECRET`。
- Web 写接口必须从 Clerk `auth()` 取 `userId`；任何 `verify_account` / `created_by` 请求字段都不得进入数据库。
- iOS 写接口必须通过 `verifyIOSRequest`；共享写接口调用 `iosVersionGuard(request, { allowMissingVersion: true })`。
- 所有服务端数据库访问继续 import `@/lib/supabase/server`；该文件在本计划完成后必须 re-export service role 客户端。
- 不再新增 browser Supabase 客户端；`lib/supabase/browser.ts` 删除。
- 所有写接口错误响应使用 `{ error: { code, message, details? } }`。
- 所有新增/修改 SQL 迁移放到 `supabase/migrations/20260918_*.sql`，使用 `if exists` / `if not exists`。
- **SQL 迁移文件不会自动 apply**。实施者必须拿到 `SUPABASE_DB_URL`，用 `node scripts/apply-sql.mjs <file>` 直连目标数据库执行；如果没有 `SUPABASE_DB_URL`，必须停下来让人类在 Supabase Dashboard 执行并回贴输出，不能假装迁移已完成。
- 迁移前必须由人工做数据库备份；执行顺序为 `security_hardening` → `rate_limit` → `get_comment_page_privacy`。
- 本计划不修改 `app/reviews/[code]/[...prof]/page.tsx` 的 `params.prof.pop()`，那是 Phase 1B；只把 viewer id 透传给评论查询。
- 每个任务结束必须 `git add` + `git commit`，不要把所有改动堆到一个 commit。

---

## File Structure

**Create**

- `vitest.config.ts`
- `tests/setup/smoke.test.ts`
- `lib/validation/identity.ts`
- `lib/validation/comment.ts`
- `lib/validation/reply.ts`
- `lib/validation/vote.ts`
- `lib/api-response.ts`
- `lib/api-auth.ts`
- `lib/rate-limit.ts`
- `tests/validation/*.test.ts`
- `tests/api-response.test.ts`
- `tests/rate-limit.test.ts`
- `tests/api-auth.test.ts`
- `tests/api/reply.test.ts`
- `tests/api/vote.test.ts`
- `tests/api/comment-post.test.ts`
- `tests/api/get-comment-page.test.ts`
- `tests/security/no-hardcoded-um-token.test.ts`
- `supabase/migrations/20260918_security_hardening.sql`
- `supabase/migrations/20260918_rate_limit.sql`
- `supabase/migrations/20260918_get_comment_page_privacy.sql`
- `scripts/apply-sql.mjs`
- `scripts/verify-security-hardening.sql`

**Modify**

- `package.json`（新增 `test` script 与 `vitest` devDependency）
- `middleware.ts`（接入 Clerk v4 `authMiddleware`）
- `lib/supabase/shared.ts`
- `lib/supabase/server.ts`
- `lib/database/get-comment-list.ts`
- `lib/database/get-course-info.ts`
- `app/api/reply/route.ts`
- `app/api/vote/[comment_id]/route.ts`
- `app/api/comment/[code]/[prof]/route.tsx`
- `components/comments.tsx`
- `components/comment-card.tsx`
- `.env.example`
- `cloudflare-env.d.ts`

**Delete**

- `lib/supabase/browser.ts`

---

### Task 1: Add Vitest test harness

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/setup/smoke.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: none
- Produces: `npm run test` executes Vitest; `@` alias resolves to project root.

- [ ] **Step 1: Create the Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
  },
});
```

- [ ] **Step 2: Write a smoke test that proves the harness runs**

```ts
// tests/setup/smoke.test.ts
import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs TypeScript tests", () => {
    const expected = 2 + 2;
    expect(expected).toBe(4);
  });
});
```

- [ ] **Step 3: Add the test script and devDependency**

Run:

```bash
npm install --save-dev vitest@^2.1.9
npm pkg set scripts.test="vitest run"
```

- [ ] **Step 4: Run the harness smoke test**

Run: `npm run test -- tests/setup/smoke.test.ts -v`

Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup/smoke.test.ts
git commit -m "test: add vitest harness"
```

---

### Task 2: Shared Zod schemas

**Files:**
- Create: `lib/validation/identity.ts`
- Create: `lib/validation/comment.ts`
- Create: `lib/validation/reply.ts`
- Create: `lib/validation/vote.ts`
- Test: `tests/validation/identity.test.ts`, `tests/validation/comment.test.ts`, `tests/validation/reply.test.ts`, `tests/validation/vote.test.ts`

**Interfaces:**
- Consumes: `REACTION_EMOJI_LIST` from `lib/consant.ts`
- Produces:
  - `identityIdSchema: ZodType<string>`
  - `commentSubmissionSchema: ZodType<{ attendance:number; pre:number; grade:number; hard:number; reward:number; assignment:number; recommend:number; content:string }>`
  - `replySubmissionSchema: ZodType<{ replyto:number; content:string }>`
  - `voteSubmissionSchema: ZodType<{ comment:number; offset:-1|0|1; emoji?:string }>`

- [ ] **Step 1: Write failing validation tests**

```ts
// tests/validation/identity.test.ts
import { describe, expect, it } from "vitest";
import { identityIdSchema } from "@/lib/validation/identity";

describe("identityIdSchema", () => {
  it("accepts Clerk user ids", () => {
    expect(identityIdSchema.safeParse("user_2abcDEF").success).toBe(true);
  });

  it("accepts UUIDs", () => {
    expect(identityIdSchema.safeParse("123e4567-e89b-12d3-a456-426614174000").success).toBe(true);
  });

  it("rejects arbitrary strings", () => {
    expect(identityIdSchema.safeParse("not-an-id").success).toBe(false);
  });
});
```

```ts
// tests/validation/comment.test.ts
import { describe, expect, it } from "vitest";
import { commentSubmissionSchema } from "@/lib/validation/comment";

const valid = {
  attendance: 3,
  pre: 3,
  grade: 4,
  hard: 2,
  reward: 4,
  assignment: 3,
  recommend: 5,
  content: "Very useful course.",
};

describe("commentSubmissionSchema", () => {
  it("accepts a valid submission", () => {
    expect(commentSubmissionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects NaN", () => {
    expect(commentSubmissionSchema.safeParse({ ...valid, grade: Number.NaN }).success).toBe(false);
  });

  it("rejects out-of-range scores", () => {
    expect(commentSubmissionSchema.safeParse({ ...valid, hard: 6 }).success).toBe(false);
  });

  it("rejects content over 2000 characters", () => {
    expect(commentSubmissionSchema.safeParse({ ...valid, content: "x".repeat(2001) }).success).toBe(false);
  });
});
```

```ts
// tests/validation/reply.test.ts
import { describe, expect, it } from "vitest";
import { replySubmissionSchema } from "@/lib/validation/reply";

describe("replySubmissionSchema", () => {
  it("accepts replyto and content only", () => {
    expect(replySubmissionSchema.safeParse({ replyto: 12, content: "Thanks!" }).success).toBe(true);
  });

  it("strips/rejects extra client-controlled fields", () => {
    const result = replySubmissionSchema.safeParse({
      replyto: 12,
      content: "Thanks!",
      verify_account: "spoofed",
    });
    expect(result.success).toBe(false);
  });
});
```

```ts
// tests/validation/vote.test.ts
import { describe, expect, it } from "vitest";
import { voteSubmissionSchema } from "@/lib/validation/vote";

describe("voteSubmissionSchema", () => {
  it("accepts a direction vote", () => {
    expect(voteSubmissionSchema.safeParse({ comment: 7, offset: 1 }).success).toBe(true);
  });

  it("requires emoji when offset is 0", () => {
    expect(voteSubmissionSchema.safeParse({ comment: 7, offset: 0 }).success).toBe(false);
  });

  it("rejects an unknown emoji", () => {
    expect(voteSubmissionSchema.safeParse({ comment: 7, offset: 0, emoji: "🔥" }).success).toBe(false);
  });

  it("rejects offset outside -1/0/1", () => {
    expect(voteSubmissionSchema.safeParse({ comment: 7, offset: 2 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/validation -v`

Expected: FAIL with module-not-found for `@/lib/validation/*`.

- [ ] **Step 3: Implement the schemas**

```ts
// lib/validation/identity.ts
import { z } from "zod";

export const uuidSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/);

export const clerkUserIdSchema = z.string().regex(/^user_[A-Za-z0-9_-]+$/);

export const identityIdSchema = z.union([clerkUserIdSchema, uuidSchema]);
export const commentIdSchema = z.coerce.number().int().positive();
```

```ts
// lib/validation/comment.ts
import { z } from "zod";

const scoreSchema = z.coerce.number().finite().min(1).max(5);

export const courseCodeSchema = z.string().regex(/^[A-Z]{4}\d{4}$/);
export const professorNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "professor name contains control characters");

export const commentSubmissionSchema = z.object({
  attendance: scoreSchema,
  pre: scoreSchema,
  grade: scoreSchema,
  hard: scoreSchema,
  reward: scoreSchema,
  assignment: scoreSchema,
  recommend: scoreSchema,
  content: z.string().trim().min(1).max(2000),
}).strict();

export type CommentSubmission = z.infer<typeof commentSubmissionSchema>;
```

```ts
// lib/validation/reply.ts
import { z } from "zod";

export const replySubmissionSchema = z.object({
  replyto: z.coerce.number().int().positive(),
  content: z.string().trim().min(1).max(250),
}).strict();

export type ReplySubmission = z.infer<typeof replySubmissionSchema>;
```

```ts
// lib/validation/vote.ts
import { z } from "zod";
import { REACTION_EMOJI_LIST } from "@/lib/consant";

const reactionEmojiSchema = z.enum(REACTION_EMOJI_LIST as [string, ...string[]]);

export const voteSubmissionSchema = z
  .object({
    comment: z.coerce.number().int().positive(),
    offset: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
    emoji: reactionEmojiSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.offset === 0 && !value.emoji) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emoji"],
        message: "emoji is required when offset is 0",
      });
    }
    if (value.offset !== 0 && value.emoji) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["emoji"],
        message: "emoji is only allowed when offset is 0",
      });
    }
  });

export type VoteSubmission = z.infer<typeof voteSubmissionSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/validation -v`

Expected: all validation tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/validation tests/validation
git commit -m "feat: add request validation schemas"
```

---

### Task 3: API error and body-size helpers

**Files:**
- Create: `lib/api-response.ts`
- Test: `tests/api-response.test.ts`

**Interfaces:**
- Consumes: `NextResponse`
- Produces:
  - `apiError(code: string, message: string, status: number, details?: Record<string, unknown>): NextResponse`
  - `readJsonBody(request: Request, maxBytes: number): Promise<{ ok: true; data: unknown } | { ok: false; response: NextResponse }>`
  - `readFormData(request: Request, maxBytes: number): Promise<{ ok: true; data: FormData } | { ok: false; response: NextResponse }>`
  - `ApiError` class extending `Error` with `status`, `code`, `details`.

- [ ] **Step 1: Write failing helper tests**

```ts
// tests/api-response.test.ts
import { describe, expect, it } from "vitest";
import { apiError, readJsonBody } from "@/lib/api-response";

describe("apiError", () => {
  it("returns the normalized error envelope", async () => {
    const response = apiError("invalid_request", "Bad input", 400);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "invalid_request", message: "Bad input" },
    });
  });
});

describe("readJsonBody", () => {
  it("rejects a body larger than the limit", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "2048" },
      body: JSON.stringify({ value: "x".repeat(2048) }),
    });
    const result = await readJsonBody(request, 1024);
    expect(result.ok).toBe(false);
  });

  it("parses valid JSON", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 1 }),
    });
    const result = await readJsonBody(request, 1024);
    expect(result).toEqual({ ok: true, data: { value: 1 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api-response.test.ts -v`

Expected: FAIL module not found.

- [ ] **Step 3: Implement `lib/api-response.ts`**

```ts
import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
) {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

type ReadResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function readJsonBody(
  request: Request,
  maxBytes: number,
): Promise<ReadResult<unknown>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, response: apiError("payload_too_large", "Request body too large", 413) };
  }

  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, response: apiError("payload_too_large", "Request body too large", 413) };
  }

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, response: apiError("invalid_request", "Invalid JSON body", 400) };
  }
}

export async function readFormData(
  request: Request,
  maxBytes: number,
): Promise<ReadResult<FormData>> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, response: apiError("payload_too_large", "Request body too large", 413) };
  }

  try {
    return { ok: true, data: await request.formData() };
  } catch {
    return { ok: false, response: apiError("invalid_request", "Invalid multipart body", 400) };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- tests/api-response.test.ts -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/api-response.ts tests/api-response.test.ts
git commit -m "feat: add api response and body limit helpers"
```

---

### Task 4: Consolidate on the server-only service-role client and add least-privilege migration

**Files:**
- Modify: `lib/supabase/shared.ts`
- Modify: `lib/supabase/server.ts`
- Delete: `lib/supabase/browser.ts`
- Create: `supabase/migrations/20260918_security_hardening.sql`
- Test: run migration locally + `scripts/verify-security-hardening.sql`

**Interfaces:**
- Consumes: existing `supabaseAdmin` default export
- Produces: `import supabaseServer from "@/lib/supabase/server"` now returns the service-role client.

- [ ] **Step 1: Replace `lib/supabase/shared.ts` with admin-only factory**

```ts
import "server-only";

import { createClient } from "@supabase/supabase-js";

function requireEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing required Supabase env: ${name}`);
  return value;
}

export function createSupabaseAdminClient() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  const secret = requireEnv(
    "SUPABASE_SECRET_KEY",
    process.env.SUPABASE_SECRET_KEY,
  );

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
```

- [ ] **Step 2: Replace `lib/supabase/server.ts` with a re-export of admin**

```ts
import "server-only";

import supabaseAdmin from "./admin";

export default supabaseAdmin;
```

- [ ] **Step 3: Delete `lib/supabase/browser.ts`**

Run:

```bash
git rm lib/supabase/browser.ts
```

- [ ] **Step 4: Add a direct SQL runner (psql is not installed in this environment)**

Run:

```bash
npm install --save-dev pg
```

Create `scripts/apply-sql.mjs`:

```js
#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Client } from "pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-sql.mjs <file.sql>");
  process.exit(1);
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("SUPABASE_DB_URL is required; stop and ask the human to provide it or run the SQL in Supabase Dashboard");
  process.exit(2);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const sql = readFileSync(file, "utf8");
  const result = await client.query(sql);
  const results = Array.isArray(result) ? result : [result];
  for (const item of results) {
    if (item.rows?.length) {
      console.table(item.rows);
    }
  }
  console.log(`SQL applied: ${file}`);
} catch (error) {
  console.error(`SQL failed: ${file}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
```

- [ ] **Step 5: Write the least-privilege migration**

```sql
-- supabase/migrations/20260918_security_hardening.sql
begin;

do $$
declare
  target_table record;
begin
  for target_table in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', target_table.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

drop function if exists public.get_comment_list(text, text);

commit;
```

- [ ] **Step 6: Write the verification SQL**

```sql
-- scripts/verify-security-hardening.sql
select 'rls_enabled' as check_name, count(*) as failures
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity is false;

select 'anon_table_grants' as check_name, count(*) as failures
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');

select 'get_comment_list_removed' as check_name, count(*) as failures
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_comment_list';
```

Expected: all `failures` are `0`.

- [ ] **Step 7: Apply to the target database and verify (direct connection required)**

**Precondition:** human has provided `SUPABASE_DB_URL` (prefer the Supabase Dashboard Session pooler IPv4 URL), or will run the SQL in Dashboard and paste the output. If neither exists, STOP and ask; do not mark this step complete. If the URL host resolves only to IPv6 and connection times out, ask for the Session pooler URL.

Run:

```bash
node scripts/apply-sql.mjs supabase/migrations/20260918_security_hardening.sql
node scripts/apply-sql.mjs scripts/verify-security-hardening.sql
npm run test
npm run lint
```

Expected: first command prints rows for every statement that returns rows; second command prints four `check_name` rows with `failures = 0`; tests and lint pass.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json scripts/apply-sql.mjs lib/supabase supabase/migrations/20260918_security_hardening.sql scripts/verify-security-hardening.sql
git commit -m "feat: enforce server-only supabase access"
```

---

### Task 5: Postgres-backed rate limiting

**Files:**
- Create: `supabase/migrations/20260918_rate_limit.sql`
- Create: `lib/rate-limit.ts`
- Test: `tests/rate-limit.test.ts`

**Interfaces:**
- Consumes: `supabaseServer`
- Produces:
  - `consumeRateLimit(input: { key:string; action:string; limit:number; windowSeconds?:number }): Promise<{ allowed:boolean; remaining:number; retryAfter:number }>`

- [ ] **Step 1: Write failing rate-limit client test**

```ts
// tests/rate-limit.test.ts
import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  default: { rpc },
}));

import { consumeRateLimit } from "@/lib/rate-limit";

describe("consumeRateLimit", () => {
  it("returns retryAfter when the limit is exceeded", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ allowed: false, remaining: 0, reset_at: "2026-09-18T12:00:00.000Z" }],
      error: null,
    });

    const result = await consumeRateLimit({
      key: "web:user_1:comment",
      action: "comment",
      limit: 10,
      windowSeconds: 3600,
    });

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/rate-limit.test.ts -v`

Expected: FAIL module not found.

- [ ] **Step 3: Write the rate-limit migration**

```sql
-- supabase/migrations/20260918_rate_limit.sql
begin;

create table if not exists public.request_rate_limits (
  key text primary key,
  window_started_at timestamptz not null,
  hit_count integer not null default 0
);

alter table public.request_rate_limits enable row level security;
revoke all on public.request_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.request_rate_limits to service_role;

create or replace function public.consume_rate_limit(
  target_key text,
  window_seconds integer,
  max_hits integer
)
returns table(allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
  rec public.request_rate_limits;
begin
  if window_seconds <= 0 or max_hits <= 0 then
    raise exception 'window_seconds and max_hits must be positive';
  end if;

  insert into public.request_rate_limits(key, window_started_at, hit_count)
  values (target_key, now_ts, 1)
  on conflict (key) do update
    set
      hit_count = case
        when public.request_rate_limits.window_started_at < now_ts - make_interval(secs => window_seconds)
          then 1
        else public.request_rate_limits.hit_count + 1
      end,
      window_started_at = case
        when public.request_rate_limits.window_started_at < now_ts - make_interval(secs => window_seconds)
          then now_ts
        else public.request_rate_limits.window_started_at
      end
  returning * into rec;

  allowed := rec.hit_count <= max_hits;
  remaining := greatest(max_hits - rec.hit_count, 0);
  reset_at := rec.window_started_at + make_interval(secs => window_seconds);
  return next;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

commit;
```

- [ ] **Step 4: Implement `lib/rate-limit.ts`**

```ts
import supabaseServer from "@/lib/supabase/server";

type ConsumeRateLimitInput = {
  key: string;
  action: "comment" | "reply" | "vote";
  limit: number;
  windowSeconds?: number;
};

type RateLimitRow = {
  allowed: boolean;
  remaining: number;
  reset_at: string;
};

export async function consumeRateLimit(input: ConsumeRateLimitInput) {
  const windowSeconds = input.windowSeconds ?? 3600;
  const { data, error } = await supabaseServer.rpc("consume_rate_limit", {
    target_key: input.key,
    window_seconds: windowSeconds,
    max_hits: input.limit,
  });

  if (error) {
    throw new Error(`rate limit failed: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | null;
  if (!row) {
    throw new Error("rate limit returned no row");
  }

  const resetAt = new Date(row.reset_at).getTime();
  const retryAfter = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));

  return {
    allowed: row.allowed,
    remaining: row.remaining,
    retryAfter,
  };
}
```

- [ ] **Step 5: Run tests and apply to the target database**

**Precondition:** `SUPABASE_DB_URL` is available (prefer Session pooler IPv4 URL), or human will run the SQL in Dashboard.

Run:

```bash
npm run test -- tests/rate-limit.test.ts -v
node scripts/apply-sql.mjs supabase/migrations/20260918_rate_limit.sql
```

Expected: test passes; migration applies cleanly.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260918_rate_limit.sql lib/rate-limit.ts tests/rate-limit.test.ts
git commit -m "feat: add database-backed rate limiting"
```

---

### Task 6: Clerk middleware and write-identity helper

**Files:**
- Modify: `middleware.ts`
- Create: `lib/api-auth.ts`
- Test: `tests/api-auth.test.ts`

**Interfaces:**
- Consumes: `auth()` from `@clerk/nextjs/server`; `verifyIOSRequest`; `iosVersionGuard`; `identityIdSchema`
- Produces:
  - `requireWriteIdentity(request): Promise<{ identity: { platform:"web"|"ios"; id:string } } | { response: NextResponse }>`
  - Middleware default export is Clerk v4 `authMiddleware`.

- [ ] **Step 1: Write failing auth-helper tests**

```ts
// tests/api-auth.test.ts
import { describe, expect, it, vi } from "vitest";

const auth = vi.fn();
const verifyIOSRequest = vi.fn();
const iosVersionGuard = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/ios-auth", () => ({ verifyIOSRequest }));
vi.mock("@/lib/ios-version", () => ({ iosVersionGuard }));

import { requireWriteIdentity } from "@/lib/api-auth";

describe("requireWriteIdentity", () => {
  it("returns a web identity from Clerk", async () => {
    verifyIOSRequest.mockReturnValue(false);
    auth.mockReturnValue({ userId: "user_2abcDEF" });
    const request = new Request("http://localhost/api/reply", { method: "POST" });

    const result = await requireWriteIdentity(request);

    expect("identity" in result && result.identity).toEqual({ platform: "web", id: "user_2abcDEF" });
  });

  it("returns 401 when there is no Clerk session", async () => {
    verifyIOSRequest.mockReturnValue(false);
    auth.mockReturnValue({ userId: null });
    const request = new Request("http://localhost/api/reply", { method: "POST" });

    const result = await requireWriteIdentity(request);

    expect("response" in result && result.response.status).toBe(401);
  });

  it("returns an iOS identity from the viewer header", async () => {
    verifyIOSRequest.mockReturnValue(true);
    iosVersionGuard.mockReturnValue(null);
    const request = new Request("http://localhost/api/vote/1", {
      method: "POST",
      headers: { "x-um-viewer-id": "123e4567-e89b-12d3-a456-426614174000" },
    });

    const result = await requireWriteIdentity(request);

    expect("identity" in result && result.identity).toEqual({
      platform: "ios",
      id: "123e4567-e89b-12d3-a456-426614174000",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/api-auth.test.ts -v`

Expected: FAIL module not found.

- [ ] **Step 3: Implement `lib/api-auth.ts`**

```ts
import { auth } from "@clerk/nextjs/server";
import type { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { verifyIOSRequest } from "@/lib/ios-auth";
import { iosVersionGuard } from "@/lib/ios-version";
import { identityIdSchema } from "@/lib/validation/identity";

export const IOS_VIEWER_HEADER = "x-um-viewer-id";

export type WriteIdentity = {
  platform: "web" | "ios";
  id: string;
};

export async function requireWriteIdentity(
  request: Request,
): Promise<{ identity: WriteIdentity } | { response: NextResponse }> {
  if (verifyIOSRequest(request)) {
    const versionResponse = iosVersionGuard(request, { allowMissingVersion: true });
    if (versionResponse) return { response: versionResponse };

    const viewerId = request.headers.get(IOS_VIEWER_HEADER)?.trim() ?? "";
    const parsed = identityIdSchema.safeParse(viewerId);
    if (!parsed.success) {
      return { response: apiError("invalid_request", `Missing or invalid ${IOS_VIEWER_HEADER}`, 400) };
    }

    return { identity: { platform: "ios", id: parsed.data } };
  }

  const { userId } = auth();
  if (!userId) {
    return { response: apiError("unauthorized", "Sign in required", 401) };
  }

  return { identity: { platform: "web", id: userId } };
}

export function rateLimitKey(identity: WriteIdentity, action: "comment" | "reply" | "vote") {
  return `${identity.platform}:${identity.id}:${action}`;
}
```

- [ ] **Step 4: Replace `middleware.ts` with Clerk v4 `authMiddleware`**

```ts
import { authMiddleware } from "@clerk/nextjs/server";

export default authMiddleware({
  publicRoutes: [
    "/",
    "/catalog(.*)",
    "/course(.*)",
    "/professor(.*)",
    "/reviews(.*)",
    "/search(.*)",
    "/timetable(.*)",
    "/submit(.*)",
    "/privacy-policy(.*)",
    "/terms-of-service(.*)",
    "/layout-preview(.*)",
    "/api/(.*)",
  ],
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/api/(.*)"],
};
```

- [ ] **Step 5: Run tests and lint**

Run:

```bash
npm run test -- tests/api-auth.test.ts -v
npm run lint
```

Expected: tests pass; lint passes.

- [ ] **Step 6: Commit**

```bash
git add middleware.ts lib/api-auth.ts tests/api-auth.test.ts
git commit -m "feat: add Clerk middleware and write identity helper"
```

---

### Task 7: Harden `POST /api/reply`

**Files:**
- Modify: `app/api/reply/route.ts`
- Test: `tests/api/reply.test.ts`

**Interfaces:**
- Consumes: `requireWriteIdentity`, `readJsonBody`, `replySubmissionSchema`, `consumeRateLimit`, `supabaseAdmin`
- Produces: POST returns the inserted reply shape; 401/400/404/429 on errors.

- [ ] **Step 1: Write failing route tests**

```ts
// tests/api/reply.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const single = vi.fn();
const insert = vi.fn(() => ({ select: () => ({ single }) }));
const from = vi.fn(() => ({ insert }));
const select = vi.fn(() => ({ eq: () => ({ maybeSingle: vi.fn() }) }));
const consumeRateLimit = vi.fn();
const requireWriteIdentity = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ default: { from } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit }));
vi.mock("@/lib/api-auth", () => ({ requireWriteIdentity, rateLimitKey: () => "web:user_1:reply" }));

import { POST } from "@/app/api/reply/route";

describe("POST /api/reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when identity is missing", async () => {
    requireWriteIdentity.mockResolvedValue({
      response: new Response(JSON.stringify({ error: { code: "unauthorized", message: "Sign in required" } }), { status: 401 }),
    });

    const response = await POST(
      new Request("http://localhost/api/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ replyto: 1, content: "hello" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("ignores client-supplied identity fields", async () => {
    requireWriteIdentity.mockResolvedValue({ identity: { platform: "web", id: "user_1" } });
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfter: 0 });
    from
      .mockImplementationOnce(() => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 1, course_id: 10, attendance: 3, pre: 3, grade: 3, hard: 3, reward: 3, recommend: 3, assignment: 3, result: 3, hidden: 0 }, error: null }) }) }),
      }))
      .mockImplementationOnce(() => insert());
    single.mockResolvedValue({ data: { id: 99 }, error: null });

    const response = await POST(
      new Request("http://localhost/api/reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          replyto: 1,
          content: "hello",
          verify_account: "spoofed",
          created_by: "spoofed",
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/api/reply.test.ts -v`

Expected: FAIL because route currently accepts extra fields and has no auth.

- [ ] **Step 3: Rewrite `app/api/reply/route.ts`**

```ts
import { NextResponse } from "next/server";

import { apiError, readJsonBody } from "@/lib/api-response";
import { rateLimitKey, requireWriteIdentity } from "@/lib/api-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import supabaseAdmin from "@/lib/supabase/admin";
import { replySubmissionSchema } from "@/lib/validation/reply";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identityResult = await requireWriteIdentity(request);
  if ("response" in identityResult) return identityResult.response;
  const { identity } = identityResult;

  const bodyResult = await readJsonBody(request, 8_192);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = replySubmissionSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid reply payload", 400, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const limit = Number(process.env.RATE_LIMIT_REPLY_PER_HOUR ?? "30");
  const rate = await consumeRateLimit({
    key: rateLimitKey(identity, "reply"),
    action: "reply",
    limit,
  });
  if (!rate.allowed) {
    return apiError("rate_limited", "Too many replies", 429, { retryAfter: rate.retryAfter });
  }

  const { data: parent, error: parentError } = await supabaseAdmin
    .from("comment")
    .select("id, course_id, attendance, pre, grade, hard, reward, recommend, assignment, result, hidden")
    .eq("id", parsed.data.replyto)
    .maybeSingle();

  if (parentError) {
    console.error("[api/reply] failed to load parent:", parentError.message);
    return apiError("internal_error", "Unable to load parent comment", 500);
  }
  if (!parent || parent.hidden === 1) {
    return apiError("not_found", "Parent comment not found", 404);
  }

  const { data, error } = await supabaseAdmin
    .from("comment")
    .insert([{
      content: parsed.data.content,
      pub_time: new Date().toISOString().slice(0, 19).replace("T", " "),
      course_id: parent.course_id,
      attendance: parent.attendance,
      pre: parent.pre,
      grade: parent.grade,
      hard: parent.hard,
      reward: parent.reward,
      recommend: parent.recommend,
      assignment: parent.assignment,
      result: parent.result,
      verify: 1,
      verify_account: identity.id,
      replyto: parent.id,
    }])
    .select()
    .single();

  if (error || !data) {
    console.error("[api/reply] insert failed:", error?.message ?? "no data");
    return apiError("internal_error", "Unable to submit reply", 500);
  }

  return NextResponse.json({
    ...data,
    avatar_seed: null,
    emoji_vote: [],
    vote_history: [],
  });
}
```

- [ ] **Step 4: Run route tests and lint**

Run:

```bash
npm run test -- tests/api/reply.test.ts -v
npm run lint
```

Expected: tests pass; lint passes.

- [ ] **Step 5: Commit**

```bash
git add app/api/reply/route.ts tests/api/reply.test.ts
git commit -m "fix: secure reply endpoint"
```

---

### Task 8: Harden `POST /api/vote/[comment_id]`

**Files:**
- Modify: `app/api/vote/[comment_id]/route.ts`
- Test: `tests/api/vote.test.ts`

**Interfaces:**
- Consumes: `requireWriteIdentity`, `readJsonBody`, `voteSubmissionSchema`, `consumeRateLimit`, `supabaseAdmin`
- Produces: POST returns `{ comment, offset, emoji, created_by }`; duplicate vote returns 200; validation errors 400; unauthenticated 401; rate limit 429.

- [ ] **Step 1: Write failing route tests**

```ts
// tests/api/vote.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn(() => ({ select: () => Promise.resolve({ data: [], error: null }) }));
const from = vi.fn(() => ({ insert }));
const requireWriteIdentity = vi.fn();
const consumeRateLimit = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ default: { from } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit }));
vi.mock("@/lib/api-auth", () => ({ requireWriteIdentity, rateLimitKey: () => "web:user_1:vote" }));

import { POST } from "@/app/api/vote/[comment_id]/route";

describe("POST /api/vote/[comment_id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireWriteIdentity.mockResolvedValue({ identity: { platform: "web", id: "user_1" } });
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 119, retryAfter: 0 });
  });

  it("rejects a body comment id that does not match the path", async () => {
    const response = await POST(
      new Request("http://localhost/api/vote/7", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: 8, offset: 1 }),
      }),
      { params: { comment_id: "7" } },
    );

    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("ignores client-created_by and writes the Clerk identity", async () => {
    insert.mockResolvedValueOnce({ data: [], error: null });

    const response = await POST(
      new Request("http://localhost/api/vote/7", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ comment: 7, offset: 1, created_by: "spoofed" }),
      }),
      { params: { comment_id: "7" } },
    );

    expect(response.status).toBe(200);
    expect(insert).toHaveBeenCalledWith([
      expect.objectContaining({ created_by: "user_1", comment_id: 7, offset: 1 }),
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- tests/api/vote.test.ts -v`

Expected: FAIL because route currently uses `body.created_by`.

- [ ] **Step 3: Rewrite `app/api/vote/[comment_id]/route.ts`**

```ts
import { NextResponse } from "next/server";

import { apiError, readJsonBody } from "@/lib/api-response";
import { rateLimitKey, requireWriteIdentity } from "@/lib/api-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import supabaseAdmin from "@/lib/supabase/admin";
import { voteSubmissionSchema } from "@/lib/validation/vote";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { comment_id: string } },
) {
  const identityResult = await requireWriteIdentity(request);
  if ("response" in identityResult) return identityResult.response;
  const { identity } = identityResult;

  const bodyResult = await readJsonBody(request, 4_096);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = voteSubmissionSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid vote payload", 400, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  if (String(parsed.data.comment) !== params.comment_id) {
    return apiError("invalid_request", "comment must match the URL parameter", 400);
  }

  const limit = Number(process.env.RATE_LIMIT_VOTE_PER_HOUR ?? "120");
  const rate = await consumeRateLimit({
    key: rateLimitKey(identity, "vote"),
    action: "vote",
    limit,
  });
  if (!rate.allowed) {
    return apiError("rate_limited", "Too many votes", 429, { retryAfter: rate.retryAfter });
  }

  const payload = {
    comment_id: parsed.data.comment,
    offset: parsed.data.offset,
    emoji: parsed.data.offset === 0 ? parsed.data.emoji ?? null : null,
    created_by: identity.id,
    created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  };

  const { error } = await supabaseAdmin.from("vote").insert([payload]);

  if (error && error.code !== "23505") {
    console.error("[api/vote] insert failed:", error.message);
    return apiError("internal_error", "Unable to submit vote", 500);
  }

  return NextResponse.json({
    comment: parsed.data.comment,
    offset: parsed.data.offset,
    emoji: payload.emoji,
    created_by: identity.id,
  });
}
```

- [ ] **Step 4: Run tests and lint**

Run:

```bash
npm run test -- tests/api/vote.test.ts -v
npm run lint
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add "app/api/vote/[comment_id]/route.ts" tests/api/vote.test.ts
git commit -m "fix: secure vote endpoint"
```

---

### Task 9: Harden `POST /api/comment/[code]/[prof]`

**Files:**
- Modify: `app/api/comment/[code]/[prof]/route.tsx`
- Test: `tests/api/comment-post.test.ts`

**Interfaces:**
- Consumes: `requireWriteIdentity`, `readFormData`, `commentSubmissionSchema`, `courseCodeSchema`, `professorNameSchema`, `consumeRateLimit`, `supabaseAdmin`
- Produces: 401/400/413/429; on success calls `insert_comment_and_refresh_prof_stats` with server-derived identity.

- [ ] **Step 1: Write failing route tests**

```ts
// tests/api/comment-post.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(() => ({ single: async () => ({ data: { id: 1 }, error: null }) }));
const requireWriteIdentity = vi.fn();
const consumeRateLimit = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ default: { rpc } }));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit }));
vi.mock("@/lib/api-auth", () => ({ requireWriteIdentity, rateLimitKey: () => "web:user_1:comment" }));

import { POST } from "@/app/api/comment/[code]/[prof]/route";

function validForm() {
  const form = new FormData();
  form.set("attendance", "3");
  form.set("pre", "3");
  form.set("grade", "4");
  form.set("hard", "2");
  form.set("reward", "4");
  form.set("assignment", "3");
  form.set("recommend", "5");
  form.set("content", "Very useful course.");
  form.set("verify", "1");
  form.set("verify_account", "spoofed");
  return form;
}

describe("POST /api/comment/[code]/[prof]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireWriteIdentity.mockResolvedValue({ identity: { platform: "web", id: "user_1" } });
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfter: 0 });
  });

  it("returns 400 for an invalid course code", async () => {
    const response = await POST(
      new Request("http://localhost/api/comment/BAD/BAD", { method: "POST", body: validForm() }),
      { params: { code: "BAD", prof: "BAD" } },
    );

    expect(response.status).toBe(400);
  });

  it("ignores client verify/verify_account and uses the server identity", async () => {
    const response = await POST(
      new Request("http://localhost/api/comment/ACCT1000/TEACHER", {
        method: "POST",
        body: validForm(),
      }),
      { params: { code: "ACCT1000", prof: "TEACHER" } },
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      "insert_comment_and_refresh_prof_stats",
      expect.objectContaining({
        target_verify: 1,
        target_verify_account: "user_1",
        target_content: "Very useful course.",
      }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/api/comment-post.test.ts -v`

Expected: FAIL because the route currently trusts client `verify_account` and has no schema.

- [ ] **Step 3: Rewrite the POST handler**

Keep the existing GET handler in the same file. Replace only the `POST` export with:

```tsx
import { NextResponse } from "next/server";
import { apiError, readFormData } from "@/lib/api-response";
import { rateLimitKey, requireWriteIdentity } from "@/lib/api-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import supabaseAdmin from "@/lib/supabase/admin";
import {
  commentSubmissionSchema,
  courseCodeSchema,
  professorNameSchema,
} from "@/lib/validation/comment";
import { getReviewInfo } from "@/lib/database/get-prof-info";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 5_000_000;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function formNumber(form: FormData, key: string) {
  return Number(form.get(key));
}

export async function POST(
  request: Request,
  { params }: { params: { code: string; prof: string } },
) {
  const identityResult = await requireWriteIdentity(request);
  if ("response" in identityResult) return identityResult.response;
  const { identity } = identityResult;

  const code = decodeURIComponent(params.code).toUpperCase();
  const prof = decodeURIComponent(params.prof).replaceAll("$", "/").toUpperCase();

  const codeParsed = courseCodeSchema.safeParse(code);
  const profParsed = professorNameSchema.safeParse(prof);
  if (!codeParsed.success || !profParsed.success) {
    return apiError("invalid_request", "Invalid course code or professor name", 400);
  }

  const formResult = await readFormData(request, MAX_IMAGE_BYTES + 32_768);
  if (!formResult.ok) return formResult.response;
  const form = formResult.data;

  const parsed = commentSubmissionSchema.safeParse({
    attendance: formNumber(form, "attendance"),
    pre: formNumber(form, "pre"),
    grade: formNumber(form, "grade"),
    hard: formNumber(form, "hard"),
    reward: formNumber(form, "reward"),
    assignment: formNumber(form, "assignment"),
    recommend: formNumber(form, "recommend"),
    content: form.get("content"),
  });
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid comment payload", 400, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const image = form.get("image");
  if (image instanceof File && image.size > 0) {
    if (image.size > MAX_IMAGE_BYTES) {
      return apiError("payload_too_large", "Image is larger than 5 MB", 413);
    }
    if (!ACCEPTED_IMAGE_TYPES.has(image.type)) {
      return apiError("invalid_request", "Unsupported image type", 400);
    }
  }

  const review = await getReviewInfo(codeParsed.data, profParsed.data);
  if (!review) {
    return apiError("not_found", "Course/professor mapping not found", 404);
  }

  const limit = Number(process.env.RATE_LIMIT_COMMENT_PER_HOUR ?? "10");
  const rate = await consumeRateLimit({
    key: rateLimitKey(identity, "comment"),
    action: "comment",
    limit,
  });
  if (!rate.allowed) {
    return apiError("rate_limited", "Too many comments", 429, { retryAfter: rate.retryAfter });
  }

  let imageUrl: string | null = null;
  if (image instanceof File && image.size > 0) {
    const imgurForm = new FormData();
    imgurForm.append("image", image, image.name);
    const imgurResponse = await fetch("https://api.imgur.com/3/upload", {
      method: "POST",
      body: imgurForm,
      headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` },
      signal: AbortSignal.timeout(10_000),
    });
    const imgurJson = await imgurResponse.json().catch(() => null);
    if (!imgurResponse.ok || !imgurJson?.success) {
      return apiError("internal_error", "Image upload failed", 502);
    }
    imageUrl = imgurJson.data.link;
  }

  const scores = parsed.data;
  const { error } = await supabaseAdmin
    .rpc("insert_comment_and_refresh_prof_stats", {
      target_course_id: review.id,
      target_content: scores.content,
      target_attendance: scores.attendance,
      target_pre: scores.pre,
      target_grade: scores.grade,
      target_hard: scores.hard,
      target_reward: scores.reward,
      target_recommend: scores.recommend,
      target_assignment: scores.assignment,
      target_result:
        (scores.attendance +
          scores.pre +
          scores.grade +
          scores.hard +
          scores.reward +
          scores.assignment +
          scores.recommend) / 7,
      target_pub_time: new Date().toISOString().slice(0, 19).replace("T", " "),
      target_verify: 1,
      target_verify_account: identity.id,
      target_img: imageUrl,
    })
    .single();

  if (error) {
    console.error("[api/comment] insert failed:", error.message);
    return apiError("internal_error", "Unable to submit comment", 500);
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run tests and lint**

Run:

```bash
npm run test -- tests/api/comment-post.test.ts -v
npm run lint
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add "app/api/comment/[code]/[prof]/route.tsx" tests/api/comment-post.test.ts
git commit -m "fix: secure comment submission endpoint"
```

---

### Task 10: Make comment RPC privacy-safe and update the read path

**Files:**
- Create: `supabase/migrations/20260918_get_comment_page_privacy.sql`
- Modify: `lib/database/get-comment-list.ts`
- Modify: `app/api/comment/[code]/[prof]/route.tsx` GET handler
- Modify: `app/reviews/[code]/[...prof]/page.tsx`
- Modify: `components/comments.tsx`
- Modify: `components/comment-card.tsx`
- Test: `tests/api/get-comment-page.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin`, `auth()` from Clerk, `readIOSClientVersion` / headers
- Produces:
  - `getComentListByCourseIDAndPage(courseId: number, page: number, viewerId?: string | null)`
  - RPC rows contain `avatar_seed`, `upvote_count`, `downvote_count`, `emoji_counts`, `vote_history` (viewer-only).

- [ ] **Step 1: Write the SQL migration**

```sql
-- supabase/migrations/20260918_get_comment_page_privacy.sql
begin;

drop function if exists public.get_comment_page(integer, integer, integer);

create or replace function public.get_comment_page(
  target_course_id integer,
  target_page integer,
  target_page_size integer default 20,
  target_viewer_id text default null
)
returns table (
  id bigint,
  content text,
  attendance double precision,
  pre double precision,
  grade double precision,
  hard double precision,
  reward double precision,
  recommend double precision,
  assignment double precision,
  result double precision,
  pub_time timestamp without time zone,
  upvote integer,
  downvote integer,
  course_id integer,
  verify integer,
  avatar_seed text,
  content_en text,
  img text,
  replyto bigint,
  hidden smallint,
  upvote_count integer,
  downvote_count integer,
  emoji_counts jsonb,
  vote_history jsonb
)
language sql
stable
as $$
with page_comments as (
  select c.*
  from public.comment c
  where c.course_id = target_course_id
    and c.hidden <> 1
    and c.replyto is null
  order by c.pub_time desc
  limit target_page_size
  offset greatest(target_page, 0) * target_page_size
),
thread_comments as (
  select p.*
  from page_comments p
  union all
  select c.*
  from public.comment c
  join page_comments p on c.replyto = p.id
  where c.hidden <> 1
),
vote_totals as (
  select
    v.comment_id,
    sum(case when v.offset = 1 then 1 else 0 end)::int as upvote_count,
    sum(case when v.offset = -1 then 1 else 0 end)::int as downvote_count
  from public.vote v
  join thread_comments c on c.id = v.comment_id
  group by v.comment_id
),
reaction_counts as (
  select
    v.comment_id,
    jsonb_agg(jsonb_build_object('emoji', v.emoji, 'count', v.count) order by v.emoji) as emoji_counts
  from (
    select comment_id, emoji, count(*)::int as count
    from public.vote
    where offset = 0
      and emoji is not null
      and comment_id in (select id from thread_comments)
    group by comment_id, emoji
  ) v
  group by v.comment_id
),
viewer_votes as (
  select
    v.comment_id,
    jsonb_agg(
      jsonb_build_object(
        'comment_id', v.comment_id,
        'offset', v.offset,
        'created_at', v.created_at,
        'emoji', v.emoji
      )
      order by v.created_at asc
    ) as vote_history
  from public.vote v
  where v.comment_id in (select id from thread_comments)
    and target_viewer_id is not null
    and v.created_by = target_viewer_id
  group by v.comment_id
)
select
  c.id,
  c.content,
  c.attendance,
  c.pre,
  c.grade,
  c.hard,
  c.reward,
  c.recommend,
  c.assignment,
  c.result,
  c.pub_time,
  c.upvote,
  c.downvote,
  c.course_id,
  c.verify,
  md5(c.verify_account) as avatar_seed,
  c.content_en,
  c.img,
  c.replyto,
  c.hidden,
  coalesce(t.upvote_count, 0) as upvote_count,
  coalesce(t.downvote_count, 0) as downvote_count,
  coalesce(r.emoji_counts, '[]'::jsonb) as emoji_counts,
  coalesce(v.vote_history, '[]'::jsonb) as vote_history
from thread_comments c
left join vote_totals t on t.comment_id = c.id
left join reaction_counts r on r.comment_id = c.id
left join viewer_votes v on v.comment_id = c.id
order by
  case when c.replyto is null then 0 else 1 end,
  c.pub_time desc,
  c.id asc;
$$;

revoke all on function public.get_comment_page(integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.get_comment_page(integer, integer, integer, text) to service_role;

commit;
```

- [ ] **Step 2: Write failing read-path tests**

```ts
// tests/api/get-comment-page.test.ts
import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn().mockResolvedValue({
  data: [{ id: 1, avatar_seed: "abc", upvote_count: 2, downvote_count: 1, emoji_counts: [], vote_history: [] }],
  error: null,
});

vi.mock("@/lib/supabase/server", () => ({ default: { rpc } }));

import { getComentListByCourseIDAndPage } from "@/lib/database/get-comment-list";

describe("getComentListByCourseIDAndPage", () => {
  it("passes viewer id to the RPC", async () => {
    await getComentListByCourseIDAndPage(42, 0, "user_2abcDEF");
    expect(rpc).toHaveBeenCalledWith(
      "get_comment_page",
      expect.objectContaining({ target_course_id: 42, target_page: 0, target_viewer_id: "user_2abcDEF" }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- tests/api/get-comment-page.test.ts -v`

Expected: FAIL because the wrapper does not accept/pass viewer id.

- [ ] **Step 4: Update `lib/database/get-comment-list.ts`**

```ts
import supabaseServer from "@/lib/supabase/server";

export const getComentListByCourseIDAndPage = async (
  course_id: number,
  page: number,
  viewerId: string | null = null,
) => {
  const { data, error } = await supabaseServer.rpc("get_comment_page", {
    target_course_id: Number(course_id),
    target_page: page,
    target_page_size: 20,
    target_viewer_id: viewerId,
  });

  if (error) {
    throw new Error(`get_comment_page failed: ${error.message}`);
  }

  return (data ?? []) as any[];
};
```

Delete the unused `getCommentList`, `getCommentNumber`, `getVoteHistory`, and `getReplyByCommentIDList` exports.

- [ ] **Step 5: Update the Web read path**

In `app/reviews/[code]/[...prof]/page.tsx`:

```tsx
import { auth } from "@clerk/nextjs/server";

// ... after prof_info is resolved
const { userId } = auth();
const comments: any[] = await getComentListByCourseIDAndPage(prof_info.id, page_num - 1, userId);
```

In the GET handler of `app/api/comment/[code]/[prof]/route.tsx`, read the viewer header and pass it through:

```tsx
const viewerId = request.headers.get("x-um-viewer-id")?.trim() || null;
const comments = await getComentListByCourseIDAndPage(prof_info.id, page - 1, viewerId);
```

- [ ] **Step 6: Update `components/comments.tsx` to use aggregates**

```tsx
import { Masonry } from "@/components/masonry";
import { CommentCard } from "@/components/comment-card";
import { REACTION_EMOJI_LIST } from "@/lib/consant";

const Comments = ({ comments }: { comments: any[] }) => {
  const editedComments: any[] = comments.map((comment) => {
    const counts = new Map<string, number>(
      (comment.emoji_counts ?? []).map((row: any) => [row.emoji, row.count]),
    );

    return {
      ...comment,
      upvote: comment.upvote_count ?? 0,
      downvote: comment.downvote_count ?? 0,
      emoji_vote: REACTION_EMOJI_LIST.map((emoji) => ({
        emoji,
        count: counts.get(emoji) ?? 0,
      })),
      vote_history: comment.vote_history ?? [],
      avatar_seed: comment.avatar_seed ?? "",
    };
  });

  const replyByParentId = new Map<any, any[]>();
  const nonReplyComments: any[] = [];

  editedComments.forEach((comment) => {
    if (comment.replyto === null) {
      nonReplyComments.push(comment);
      return;
    }
    const replyList = replyByParentId.get(comment.replyto) ?? [];
    replyList.push(comment);
    replyByParentId.set(comment.replyto, replyList);
  });

  return (
    <>
      <Masonry col={3} className="">
        {nonReplyComments.map((comment: any, index: number) => (
          <div key={index}>
            <CommentCard comment={comment} reply_comment={replyByParentId.get(comment.id) ?? []} />
          </div>
        ))}
      </Masonry>
      {nonReplyComments.length === 0 ? (
        <div className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent text-xl font-black mt-4">
          No comment yet. Be the first to sumbit your review! <br />
        </div>
      ) : null}
    </>
  );
};

export { Comments };
```

- [ ] **Step 7: Update avatar input in `components/comment-card.tsx`**

Replace every `HashEmojiAvatar({ user_id: reply.verify_account })` / `HashEmojiAvatar({ user_id: user?.id })` with:

```tsx
HashEmojiAvatar({ user_id: reply.avatar_seed || reply.verify_account || "" })
```

For the signed-in reply placeholder, keep the local user id because it is not displayed from server data:

```tsx
HashEmojiAvatar({ user_id: user?.id ?? "" })
```

- [ ] **Step 8: Run tests and apply the privacy migration to the target database**

**Precondition:** `SUPABASE_DB_URL` is available (prefer Session pooler IPv4 URL), or human will run the SQL in Dashboard.

Run:

```bash
npm run test
node scripts/apply-sql.mjs supabase/migrations/20260918_get_comment_page_privacy.sql
node scripts/apply-sql.mjs scripts/verify-security-hardening.sql
npm run lint
```

Expected: tests pass; migration applies; verification failures 0.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260918_get_comment_page_privacy.sql lib/database/get-comment-list.ts "app/api/comment/[code]/[prof]/route.tsx" "app/reviews/[code]/[...prof]/page.tsx" components/comments.tsx components/comment-card.tsx tests/api/get-comment-page.test.ts
git commit -m "fix: stop leaking voter identities in comment RPC"
```

---

### Task 11: Remove hardcoded UM Open Data token

**Files:**
- Modify: `lib/database/get-course-info.ts`
- Modify: `.env.example`
- Modify: `cloudflare-env.d.ts`

**Interfaces:**
- Consumes: `process.env.UM_OPEN_DATA_TOKEN`
- Produces: `fetchCourseInfoByUMAPI` uses `fetch` + timeout, no hardcoded token, no `axios`/`https`/`crypto` imports.

- [ ] **Step 1: Write a failing regression test**

```ts
// tests/security/no-hardcoded-um-token.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("UM Open Data token", () => {
  it("is not hardcoded in get-course-info.ts", () => {
    const source = readFileSync(join(process.cwd(), "lib/database/get-course-info.ts"), "utf8");
    expect(source).not.toContain("f5aaa86cc5b4424aa621538fceaab34f");
    expect(source).toContain("UM_OPEN_DATA_TOKEN");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/security/no-hardcoded-um-token.test.ts -v`

Expected: FAIL because token is still hardcoded.

- [ ] **Step 3: Replace the remote fetch implementation**

```ts
export const fetchCourseInfoByUMAPIUncached = async (code: string) => {
  const token = process.env.UM_OPEN_DATA_TOKEN;
  if (!token) {
    console.error("[um-api] UM_OPEN_DATA_TOKEN is not configured");
    return null;
  }

  try {
    const response = await fetch(
      `https://api.data.um.edu.mo/service/academic/course_catalog/all?course_code=${encodeURIComponent(code.toUpperCase())}`,
      {
        headers: { Authorization: token },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.error("[um-api] request failed", response.status);
      return null;
    }

    const body = (await response.json()) as { _embedded?: unknown[] };
    return body._embedded?.[0] ?? null;
  } catch (error) {
    console.error("[um-api] request error", error instanceof Error ? error.message : String(error));
    return null;
  }
};
```

Remove the `crypto`, `https`, and `axios` imports and the `allowLegacyRenegotiationOptions` object. Keep the `unstable_cache` wrapper.

- [ ] **Step 4: Add environment entries**

`.env.example`:

```bash
# UM Open Data API（仅服务端使用）
UM_OPEN_DATA_TOKEN=
```

`cloudflare-env.d.ts` inside `interface Env`:

```ts
UM_OPEN_DATA_TOKEN: string;
```

- [ ] **Step 5: Run test and lint**

Run:

```bash
npm run test -- tests/security/no-hardcoded-um-token.test.ts -v
npm run lint
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add lib/database/get-course-info.ts .env.example cloudflare-env.d.ts tests/security/no-hardcoded-um-token.test.ts
git commit -m "fix: move UM API token out of source"
```

---

### Task 12: Verification, docs, and release checklist

**Files:**
- Create: `docs/superpowers/verification/2026-09-18-write-api-security.md`
- Modify: `docs/technical-optimization-audit.md`（在顶部加一条指向本阶段 spec/plan 的引用）

**Interfaces:**
- Consumes: all previous tasks
- Produces: reproducible verification record and rollout checklist.

- [ ] **Step 1: Write the verification record**

Create `docs/superpowers/verification/2026-09-18-write-api-security.md` containing:

```markdown
# Write API Security Verification — 2026-09-18

## Commands

- [ ] `npm run test`
- [ ] `npm run lint`
- [ ] `node node_modules/typescript/bin/tsc --noEmit`
- [ ] `npm run build`
- [ ] `node scripts/apply-sql.mjs supabase/migrations/20260918_security_hardening.sql`
- [ ] `node scripts/apply-sql.mjs supabase/migrations/20260918_rate_limit.sql`
- [ ] `node scripts/apply-sql.mjs supabase/migrations/20260918_get_comment_page_privacy.sql`
- [ ] `node scripts/apply-sql.mjs scripts/verify-security-hardening.sql`

## SQL assertions

Expected: all `failures` rows are `0`.

## Manual smoke

- [ ] Web unauthenticated `POST /api/comment/...` → 401
- [ ] Web unauthenticated `POST /api/reply` → 401
- [ ] Web unauthenticated `POST /api/vote/...` → 401
- [ ] Forged `verify_account=user_evil` in comment form → DB row contains Clerk user id
- [ ] Forged `created_by=user_evil` in vote JSON → DB row contains Clerk user id
- [ ] Comment body > 5 MB → 413
- [ ] 11th comment from same user within an hour → 429
- [ ] `select * from comment` as `anon` → permission denied
- [ ] `get_comment_page` for two different viewers returns different `vote_history`
- [ ] `git grep f5aaa86cc5b4424aa621538fceaab34f` → no matches
```

- [ ] **Step 2: Add a pointer in the audit doc**

At the top of `docs/technical-optimization-audit.md`, add:

```markdown
> Phase 1A security spec: `docs/superpowers/specs/2026-09-18-next-web-write-api-security-design.md`
> Phase 1A plan: `docs/superpowers/plans/2026-09-18-next-web-write-api-security.md`
```

- [ ] **Step 3: Run the full verification**

Run:

```bash
npm run test
npm run lint
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/verification/2026-09-18-write-api-security.md docs/technical-optimization-audit.md
git commit -m "docs: add write api security verification record"
```

---

## Self-Review

**Spec coverage:**

- G1/G2 server-only service role + RLS/REVOKE → Task 4.
- G3/G4 auth + whitelist + validation → Tasks 2, 3, 6, 7, 8, 9.
- G5 comment RPC privacy → Task 10.
- G6 hardcoded UM token → Task 11.
- G7 tests/SQL/checklist → Tasks 1-3, 5-12.
- G8 hidden comments + body size → Tasks 4, 3, 9.
- AC1-AC9 → Tasks 4, 6-11, 12.

**Known dependency order:** Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Tasks 7/8/9 → Task 10 → Task 11 → Task 12.

**Open implementation notes:**

- Clerk v4 `authMiddleware` publicRoutes are best-effort; if a public page is unexpectedly redirected, add its pattern to `publicRoutes`. Do not remove the middleware.
- `Supabase` local key rotation and production key rotation are operational tasks outside the repository; the verification record must be filled in before deployment.
- iOS clients must send `X-UM-Viewer-Id` for write endpoints after this change; coordinate with next-ios release.
