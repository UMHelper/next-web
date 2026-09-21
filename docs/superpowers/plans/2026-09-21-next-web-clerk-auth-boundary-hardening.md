# Clerk 鉴权边界与写接口契约收口 Implementation Plan（P0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 next-web 的 Clerk 鉴权边界与写接口契约收口到默认拒绝、身份字段服务端派生、Clerk 目录读取可缓存可分页的状态。

**Architecture:** 新增 `lib/clerk/user-directory.ts` 作为 Clerk 用户信息唯一入口（验证邮箱、分页、TTL 缓存）；`lib/admin-auth.ts` 改为消费它并只认 verified primary email；API route 用策略测试强制存在 guard；Web 客户端停止发送身份字段并正确处理 401。

**Tech Stack:** Next.js 14 App Router、`@clerk/nextjs` v4（本 spec 不升级）、Supabase（service role 已封装）、Vitest、TypeScript。

**Spec:** `docs/superpowers/specs/2026-09-21-next-web-clerk-auth-boundary-hardening-design.md`

## Global Constraints

- 不在本 plan 升级 `@clerk/nextjs` 大版本；`auth()` 保持 v4 同步调用。
- 不改数据库 schema。
- 不删除 `PLATFORM_ADMIN_EMAILS`（P3-1 才删除）；本 plan 只给它加 verified 校验。
- 所有新增/修改的测试必须能在 `npm run test` 下离线运行，不依赖真实 Clerk / Supabase。
- 每个 task 结束必须运行该 task 指定的验证命令，并确认输出。

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `lib/clerk/user-directory.ts` | Clerk 用户目录唯一入口：verified primary email、分页、TTL 缓存 |
| `lib/admin-auth.ts` | platform admin / DB admin 判定；消费 user-directory |
| `lib/comment-payload.ts` | 回复/投票请求 payload 的纯函数构造器（不含身份字段） |
| `app/api/admin/admins/route.ts` | 统一 `clerkClient`，消费 user-directory |
| `components/comment-card.tsx` | 使用 payload 构造器 + 处理非 2xx |
| `middleware.ts` | matcher 对齐 Clerk 默认 |
| `tests/clerk/user-directory.test.ts` | 目录模块单测 |
| `tests/admin-auth.test.ts` | 重写为 verified email / directory 场景 |
| `tests/security/api-route-guards.test.ts` | API 默认拒绝策略测试 |
| `tests/comment-payload.test.ts` | payload 构造器单测 |

---

## Task 1: Clerk 用户目录模块

**Files:**
- Create: `lib/clerk/user-directory.ts`
- Test: `tests/clerk/user-directory.test.ts`

**Interfaces:**
- Produces:
  - `type ClerkDirectoryUser = { id: string; primaryEmail: string | null; emailVerified: boolean; firstName: string | null; lastName: string | null; imageUrl: string | null; publicMetadata: Record<string, unknown> }`
  - `getVerifiedPrimaryEmail(user): string | null`
  - `toDirectoryUser(user): ClerkDirectoryUser`
  - `getDirectoryUser(userId): Promise<ClerkDirectoryUser | null>`
  - `getDirectoryUsers(userIds: string[]): Promise<Map<string, ClerkDirectoryUser>>`
  - `invalidateDirectoryCache(userIds?: string[]): void`
  - `__resetDirectoryCacheForTests(): void`

- [ ] **Step 1: Write the failing test**

Create `tests/clerk/user-directory.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserList } = vi.hoisted(() => ({ getUserList: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: { users: { getUserList } },
}));

import {
  __resetDirectoryCacheForTests,
  getDirectoryUser,
  getDirectoryUsers,
  getVerifiedPrimaryEmail,
  toDirectoryUser,
} from "@/lib/clerk/user-directory";

function clerkUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    primaryEmailAddressId: "email_1",
    emailAddresses: [
      { id: "email_1", emailAddress: "Admin@Example.com", verification: { status: "verified" } },
    ],
    firstName: "Ada",
    lastName: "Lovelace",
    imageUrl: "https://img.clerk.com/a.png",
    publicMetadata: { role: "platform_admin" },
    ...overrides,
  };
}

describe("user-directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDirectoryCacheForTests();
  });

  it("returns only a verified primary email", () => {
    expect(getVerifiedPrimaryEmail(clerkUser() as never)).toBe("admin@example.com");
  });

  it("returns null for an unverified primary email", () => {
    const user = clerkUser({
      emailAddresses: [
        { id: "email_1", emailAddress: "admin@example.com", verification: { status: "unverified" } },
      ],
    });
    expect(getVerifiedPrimaryEmail(user as never)).toBeNull();
  });

  it("does not fall back to a non-primary email", () => {
    const user = clerkUser({
      primaryEmailAddressId: "missing",
      emailAddresses: [
        { id: "email_2", emailAddress: "other@example.com", verification: { status: "verified" } },
      ],
    });
    expect(getVerifiedPrimaryEmail(user as never)).toBeNull();
  });

  it("maps a Clerk user to a directory user", () => {
    expect(toDirectoryUser(clerkUser() as never)).toEqual({
      id: "user_1",
      primaryEmail: "admin@example.com",
      emailVerified: true,
      firstName: "Ada",
      lastName: "Lovelace",
      imageUrl: "https://img.clerk.com/a.png",
      publicMetadata: { role: "platform_admin" },
    });
  });

  it("caches users within the TTL", async () => {
    getUserList.mockResolvedValue([clerkUser()]);
    const first = await getDirectoryUser("user_1");
    const second = await getDirectoryUser("user_1");
    expect(first?.id).toBe("user_1");
    expect(second?.id).toBe("user_1");
    expect(getUserList).toHaveBeenCalledTimes(1);
  });

  it("chunks large id lists into batches of at most 100", async () => {
    getUserList.mockResolvedValue([]);
    const ids = Array.from({ length: 150 }, (_, index) => `user_${index}`);
    await getDirectoryUsers(ids);
    expect(getUserList).toHaveBeenCalledTimes(2);
    expect(getUserList.mock.calls[0][0].limit).toBe(100);
    expect(getUserList.mock.calls[1][0].limit).toBe(50);
  });

  it("returns an empty map when Clerk fails", async () => {
    getUserList.mockRejectedValue(new Error("boom"));
    const result = await getDirectoryUsers(["user_1"]);
    expect(result.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/clerk/user-directory.test.ts`
Expected: FAIL — `Cannot find module '@/lib/clerk/user-directory'`。

- [ ] **Step 3: Write minimal implementation**

Create `lib/clerk/user-directory.ts`:

```ts
import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

export type ClerkDirectoryUser = {
  id: string;
  primaryEmail: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  publicMetadata: Record<string, unknown>;
};

type ClerkEmailAddressLike = {
  id: string;
  emailAddress: string;
  verification?: { status: string | null } | null;
};

type ClerkUserLike = {
  id: string;
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmailAddressLike[];
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  publicMetadata?: Record<string, unknown> | null;
};

const DEFAULT_TTL_MS = 60_000;
const MAX_USERS_PER_CALL = 100;
const MAX_USERS_TOTAL = 1_000;

type CacheEntry = { value: ClerkDirectoryUser; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export function getVerifiedPrimaryEmail(user: {
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmailAddressLike[];
}): string | null {
  const primary = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  if (!primary || primary.verification?.status !== "verified") return null;
  return primary.emailAddress.toLowerCase();
}

export function toDirectoryUser(user: ClerkUserLike): ClerkDirectoryUser {
  const primaryEmail = getVerifiedPrimaryEmail(user);
  return {
    id: user.id,
    primaryEmail,
    emailVerified: primaryEmail !== null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    imageUrl: user.imageUrl ?? null,
    publicMetadata: user.publicMetadata ?? {},
  };
}

export function invalidateDirectoryCache(userIds?: string[]): void {
  if (!userIds) {
    cache.clear();
    return;
  }
  for (const id of userIds) cache.delete(id);
}

export function __resetDirectoryCacheForTests(): void {
  cache.clear();
}

function readCache(id: string): ClerkDirectoryUser | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(id);
    return null;
  }
  return entry.value;
}

function writeCache(user: ClerkDirectoryUser): void {
  cache.set(user.id, { value: user, expiresAt: Date.now() + DEFAULT_TTL_MS });
}

export async function getDirectoryUser(userId: string): Promise<ClerkDirectoryUser | null> {
  const users = await getDirectoryUsers([userId]);
  return users.get(userId) ?? null;
}

export async function getDirectoryUsers(
  userIds: string[],
): Promise<Map<string, ClerkDirectoryUser>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, ClerkDirectoryUser>();
  const missing: string[] = [];

  for (const id of uniqueIds) {
    const cached = readCache(id);
    if (cached) result.set(id, cached);
    else missing.push(id);
  }

  for (let index = 0; index < missing.length; index += MAX_USERS_PER_CALL) {
    const chunk = missing.slice(index, index + MAX_USERS_PER_CALL);
    try {
      const users = await clerkClient.users.getUserList({
        userId: chunk,
        limit: chunk.length,
      });
      for (const user of users) {
        const mapped = toDirectoryUser(user as unknown as ClerkUserLike);
        writeCache(mapped);
        result.set(mapped.id, mapped);
      }
    } catch (error) {
      console.error(
        "[clerk-directory] failed to load users:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/clerk/user-directory.test.ts`
Expected: PASS（7 tests）。

- [ ] **Step 5: Commit**

```bash
git add lib/clerk/user-directory.ts tests/clerk/user-directory.test.ts
git commit -m "feat: add cached verified Clerk user directory"
```

---

## Task 2: admin-auth 只认 verified email 并消费 user-directory

**Files:**
- Modify: `lib/admin-auth.ts`
- Modify: `app/api/admin/admins/route.ts`（只改 `getPrimaryClerkEmail` 的导入/调用）
- Modify: `tests/admin-auth.test.ts`
- Test: `tests/admin-auth.test.ts`

**Interfaces:**
- Consumes: `getDirectoryUsers` from Task 1。
- Produces: `getClerkUserEmail` / `getClerkUserEmails` 语义不变，但邮箱来自 verified primary。

- [ ] **Step 1: Rewrite the failing test**

Replace `tests/admin-auth.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, getDirectoryUsers, maybeSingle } = vi.hoisted(() => ({
  auth: vi.fn(),
  getDirectoryUsers: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth }));
vi.mock("@/lib/clerk/user-directory", () => ({ getDirectoryUsers }));
vi.mock("@/lib/supabase/admin", () => ({
  default: {
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) })),
  },
}));

import {
  getCurrentAdmin,
  getPlatformAdminEmails,
  getPlatformAdminIds,
  requireAdmin,
} from "@/lib/admin-auth";

describe("admin auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PLATFORM_ADMIN_USER_IDS;
    delete process.env.PLATFORM_ADMIN_EMAILS;
  });

  it("parses platform admin ids", () => {
    expect(Array.from(getPlatformAdminIds("user_a, user_b ,,user_c"))).toEqual([
      "user_a",
      "user_b",
      "user_c",
    ]);
  });

  it("parses and normalizes platform admin emails", () => {
    expect(Array.from(getPlatformAdminEmails("Admin@Example.com, b@test.com "))).toEqual([
      "admin@example.com",
      "b@test.com",
    ]);
  });

  it("allows platform admin from env id", async () => {
    process.env.PLATFORM_ADMIN_USER_IDS = "user_platform";
    auth.mockReturnValue({ userId: "user_platform" });

    const result = await getCurrentAdmin();
    expect(result).toEqual({
      ok: true,
      session: { userId: "user_platform", isPlatformAdmin: true },
    });
  });

  it("allows platform admin by a verified primary Clerk email", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@example.com";
    auth.mockReturnValue({ userId: "user_email" });
    getDirectoryUsers.mockResolvedValue(
      new Map([["user_email", { id: "user_email", primaryEmail: "admin@example.com" }]]),
    );

    const result = await getCurrentAdmin();
    expect(result).toEqual({
      ok: true,
      session: { userId: "user_email", isPlatformAdmin: true },
    });
    expect(maybeSingle).not.toHaveBeenCalled();
  });

  it("does not allow an unverified email", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = "admin@example.com";
    auth.mockReturnValue({ userId: "user_unverified" });
    getDirectoryUsers.mockResolvedValue(
      new Map([["user_unverified", { id: "user_unverified", primaryEmail: null }]]),
    );
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getCurrentAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("allows an active db admin", async () => {
    auth.mockReturnValue({ userId: "user_db" });
    maybeSingle.mockResolvedValue({ data: { clerk_user_id: "user_db", active: true }, error: null });

    const result = await getCurrentAdmin();
    expect(result).toEqual({
      ok: true,
      session: { userId: "user_db", isPlatformAdmin: false },
    });
  });

  it("rejects non-admin users", async () => {
    auth.mockReturnValue({ userId: "user_plain" });
    maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getCurrentAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects anonymous users", async () => {
    auth.mockReturnValue({ userId: null });
    const result = await requireAdmin();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/admin-auth.test.ts`
Expected: FAIL（现有 `lib/admin-auth.ts` 仍直接调用 `clerkClient`，mock 不匹配）。

- [ ] **Step 3: Modify `lib/admin-auth.ts`**

Replace the top section（第 1–69 行）为：

```ts
import { auth } from "@clerk/nextjs/server";

import { apiError } from "@/lib/api-response";
import { getDirectoryUsers } from "@/lib/clerk/user-directory";
import supabaseAdmin from "@/lib/supabase/admin";

export type AdminSession = {
  userId: string;
  isPlatformAdmin: boolean;
};

export function getPlatformAdminIds(value = process.env.PLATFORM_ADMIN_USER_IDS) {
  if (!value) return new Set<string>();
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function getPlatformAdminEmails(value = process.env.PLATFORM_ADMIN_EMAILS) {
  if (!value) return new Set<string>();
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getClerkUserEmail(userId: string): Promise<string | null> {
  const users = await getDirectoryUsers([userId]);
  return users.get(userId)?.primaryEmail ?? null;
}

export async function getClerkUserEmails(userIds: string[]): Promise<Map<string, string | null>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const users = await getDirectoryUsers(uniqueIds);
  return new Map(uniqueIds.map((id) => [id, users.get(id)?.primaryEmail ?? null]));
}
```

`getCurrentAdmin` / `requireAdmin` 保持原样（第 71 行起）。邮箱校验现在自动只认 verified primary，因为 `getClerkUserEmail` 返回的已经是 verified email 或 `null`。

- [ ] **Step 4: Fix `app/api/admin/admins/route.ts` compile error**

把 `getPrimaryClerkEmail` 的导入改为：

```ts
import { toDirectoryUser } from "@/lib/clerk/user-directory";
```

并把两处调用：

```ts
userEmail = getPrimaryClerkEmail(users[0]);
userEmail = getPrimaryClerkEmail(user);
```

改为：

```ts
userEmail = toDirectoryUser(users[0] as never).primaryEmail;
userEmail = toDirectoryUser(user as never).primaryEmail;
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/admin-auth.test.ts`
Expected: PASS（8 tests）。

- [ ] **Step 6: Commit**

```bash
git add lib/admin-auth.ts app/api/admin/admins/route.ts tests/admin-auth.test.ts
git commit -m "fix: only trust verified primary Clerk emails for platform admins"
```

---

## Task 3: API 默认拒绝策略测试

**Files:**
- Create: `tests/security/api-route-guards.test.ts`

**Interfaces:**
- Consumes: 现有 `app/api/**/route.ts*` 文件系统结构。
- Produces: 一个策略测试，新增无 guard 的 API route 会让 CI 失败。

- [ ] **Step 1: Write the failing test**

Create `tests/security/api-route-guards.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = path.join(process.cwd(), "app", "api");

const KNOWN_GUARDS = [
  "verifyIOSRequest",
  "requireWriteIdentity",
  "resolveCommentIdentity",
  "resolveReportIdentity",
  "requireAdmin",
  "getCurrentAdmin",
];

const PUBLIC_API_ROUTES = new Map<string, string>([
  [
    "/api/browser-diagnostics",
    "public user-facing Environment Info support tool (components/browser-diagnostics.tsx)",
  ],
]);

function listRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listRouteFiles(full));
    else if (/^route\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

function routePath(file: string): string {
  const relative = path.relative(process.cwd(), file);
  const withoutExt = relative.replace(/\/route\.tsx?$/, "");
  return `/${withoutExt.replace(/^app\//, "")}`;
}

describe("api route guards", () => {
  const files = listRouteFiles(API_ROOT);

  it("finds route files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s is guarded or explicitly public", (file) => {
    const source = readFileSync(file, "utf8");
    const route = routePath(file);

    if (PUBLIC_API_ROUTES.has(route)) return;

    const guarded = KNOWN_GUARDS.some((guard) => {
      const matches = source.match(new RegExp(`\\b${guard}\\b`, "g"));
      return (matches?.length ?? 0) >= 2; // import + call
    });

    expect(
      guarded,
      `${route} has no known auth guard. Add an auth check or add it to PUBLIC_API_ROUTES with a justification.`,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes correctly**

Run: `npx vitest run tests/security/api-route-guards.test.ts`
Expected: PASS — 现有所有 API route 都有 guard，只有 `browser-diagnostics` 走显式白名单。

- [ ] **Step 3: Verify the test can fail (negative check)**

临时把 `app/api/browser-diagnostics/route.ts` 加入一个不存在的路径测试不可行；改为人工确认：从 `PUBLIC_API_ROUTES` 移除该条后，测试必须 FAIL。确认后恢复。

Run: `npx vitest run tests/security/api-route-guards.test.ts`
Expected after removal: FAIL，错误信息包含 `/api/browser-diagnostics has no known auth guard`。

- [ ] **Step 4: Commit**

```bash
git add tests/security/api-route-guards.test.ts
git commit -m "test: enforce auth guards for all api routes"
```

---

## Task 4: 客户端 payload 与 401 处理

**Files:**
- Create: `lib/comment-payload.ts`
- Test: `tests/comment-payload.test.ts`
- Modify: `components/comment-card.tsx`

**Interfaces:**
- Produces:
  - `buildReplyPayload(commentId: number | string, content: string): { replyto: number; content: string }`
  - `buildVotePayload(commentId: number | string, offset: number, emoji?: string): { comment: number; offset: number; emoji?: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/comment-payload.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildReplyPayload, buildVotePayload } from "@/lib/comment-payload";

describe("comment payload builders", () => {
  it("builds a reply payload without client identity fields", () => {
    const payload = buildReplyPayload(42, "hello");
    expect(payload).toEqual({ replyto: 42, content: "hello" });
    expect(Object.keys(payload).sort()).toEqual(["content", "replyto"]);
  });

  it("builds a vote payload without client identity fields", () => {
    const payload = buildVotePayload(42, 1);
    expect(payload).toEqual({ comment: 42, offset: 1 });
    expect(Object.keys(payload).sort()).toEqual(["comment", "offset"]);
  });

  it("includes emoji only when provided", () => {
    expect(buildVotePayload(42, 0, "🔥")).toEqual({ comment: 42, offset: 0, emoji: "🔥" });
    expect(buildVotePayload(42, 0)).toEqual({ comment: 42, offset: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/comment-payload.test.ts`
Expected: FAIL — module not found。

- [ ] **Step 3: Write minimal implementation**

Create `lib/comment-payload.ts`:

```ts
export function buildReplyPayload(commentId: number | string, content: string) {
  return { replyto: Number(commentId), content };
}

export function buildVotePayload(commentId: number | string, offset: number, emoji?: string) {
  return emoji
    ? { comment: Number(commentId), offset, emoji }
    : { comment: Number(commentId), offset };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/comment-payload.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 5: Update `components/comment-card.tsx`**

在 import 区加入：

```ts
import { buildReplyPayload, buildVotePayload } from "@/lib/comment-payload";
```

把 `submitReply` 的 body 构造与请求替换为：

```ts
toast.promise(
    fetch(`/api/reply/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildReplyPayload(comment.id, reply)),
    }).then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(payload?.error?.message ?? `HTTP ${res.status}`);
        }
        setCurrentReply((pre: any[]) => [payload, ...pre]);
        setIsReplySubmitOpen(false);
        setIsReplyOpen(true);
        document.getElementById(`reply${comment.id}`)?.scrollTo({ top: 0 });
        return payload;
    }),
    {
        loading: 'Submiting...',
        success: 'Thanks for your reply!',
        error: (err) => (err instanceof Error ? err.message : 'Error'),
    }
)
```

把 `handleVote` 的请求替换为：

```ts
toast.promise(
    fetch(`/api/vote/${comment.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildVotePayload(comment.id, offset, emoji)),
    }).then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(payload?.error?.message ?? `HTTP ${res.status}`);
        }
        if (offset != 0) {
            setVoteHistory(payload);
            if (offset === 1) comment.upvote += payload.offset;
            else comment.downvote += payload.offset;
        } else {
            setEmojiHistory((pre: any[]) => [...pre, payload]);
            comment.emoji_vote.map((item: any) => {
                if (item.emoji == payload.emoji) item.count += 1;
            });
        }
        setIsVoting(false);
        return payload;
    }),
    {
        loading: 'Voting...',
        success: 'Thanks for your vote!',
        error: (err) => (err instanceof Error ? err.message : 'Error'),
    }
)
```

- [ ] **Step 6: Verify no forbidden identity fields remain**

Run: `grep -n "verify_account\|body.verify\|created_by: user" components/comment-card.tsx`
Expected: 无输出。

- [ ] **Step 7: Run regression tests**

Run: `npx vitest run tests/comment-payload.test.ts tests/components`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add lib/comment-payload.ts tests/comment-payload.test.ts components/comment-card.tsx
git commit -m "fix: stop sending client identity fields and handle write errors"
```

---

## Task 5: 统一 clerkClient，移除顶层 @clerk/backend

**Files:**
- Modify: `app/api/admin/admins/route.ts`
- Modify: `package.json`

- [ ] **Step 1: Update `app/api/admin/admins/route.ts`**

- 删除 `import { Clerk } from "@clerk/backend";`
- import 区加入：

```ts
import { clerkClient } from "@clerk/nextjs/server";
```

- 把：

```ts
const clerk = Clerk({ secretKey });
const users = await clerk.users.getUserList({ emailAddress: [identifier], limit: 2 });
const user = await clerk.users.getUser(identifier);
```

改为：

```ts
const users = await clerkClient.users.getUserList({ emailAddress: [identifier], limit: 2 });
const user = await clerkClient.users.getUser(identifier);
```

保留 `secretKey` 的存在性检查（第 76–79 行），用于在未配置时返回 503。

- [ ] **Step 2: Remove the top-level dependency**

编辑 `package.json` 删除 `"@clerk/backend": "^0.34.1"`，然后：

Run: `npm install --package-lock-only --offline`
Expected: 成功更新 lockfile。

如果 offline 安装失败（无缓存）：**保留 `package.json` 不变**，只提交代码改动，并在报告中记录“依赖移除待有网络时执行”。不要手改 `package-lock.json`。

- [ ] **Step 3: Verify no direct import remains**

Run: `grep -rn "@clerk/backend" app lib components`
Expected: 无输出。

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/admin-auth.test.ts tests/api`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/admins/route.ts package.json package-lock.json
git commit -m "refactor: use clerkClient consistently"
```

---

## Task 6: middleware matcher 对齐 Clerk 默认

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Update matcher**

把 `middleware.ts` 的 `config` 改为：

```ts
export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "fix: align clerk middleware matcher with upstream default"
```

---

## Task 7: 全量验证

**Files:**
- 无新增

- [ ] **Step 1: Run the full suite**

Run: `npm run test`
Expected: 所有 test files 通过，0 failures。

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0。

- [ ] **Step 5: Report**

把 Step 1–4 的原始输出记录到 `docs/superpowers/verification/2026-09-21-clerk-auth-boundary-hardening.md`，并提交：

```bash
git add docs/superpowers/verification/2026-09-21-clerk-auth-boundary-hardening.md
git commit -m "docs: verify clerk auth boundary hardening"
```

---

## Self-Review

**Spec coverage:**

| Spec 决策 | 对应 task |
|---|---|
| D1 verified email | Task 1 + 2 |
| D2 默认拒绝策略测试 | Task 3 |
| D3 user-directory 分页缓存 | Task 1 |
| D4 客户端 payload + 401 | Task 4 |
| D5 统一 clerkClient | Task 5 |
| D6 matcher | Task 6 |
| G7 全量验证 | Task 7 |

**类型一致性：**`getDirectoryUsers` 返回 `Map<string, ClerkDirectoryUser>`，Task 2 的 `getClerkUserEmails` 与 Task 5 的 `toDirectoryUser` 均消费同一类型；`buildReplyPayload` / `buildVotePayload` 只在 Task 4 内使用。

**已知偏差：**
- Spec D3 写“offset 分页”，实现按 `userId` 数组每 100 个分块更准确（`getUserList` 支持 `userId` 过滤），语义等价且少一次全量拉取；已在 Task 1 测试中锁定。
- Spec 测试策略提到“组件测试”，Task 4 用纯函数 + 源码 grep 替代，避免对复杂评论卡片做脆弱 DOM 测试；行为由 `lib/comment-payload.ts` 单测锁定。
