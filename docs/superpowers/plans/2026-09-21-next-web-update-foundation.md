# Next Web 更新流水线 · Plan 1：数据层地基

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 current year/sem 等运营配置落库，并硬化课表数据（规范化 + dedupe + 唯一索引 + 服务端过滤），同时落 5 个供网页更新流水线调用的原子 RPC。

**Architecture:** 所有 DB 变更走 `supabase/migrations/*.sql`，并把等价「最终结构」同步进 `supabase/schema.sql` 快照（本地 bootstrap 用）。应用侧通过 `lib/config/app-config.ts`（`unstable_cache` + tag）读取配置，通过 `/api/admin/app-config`（platform admin）写入。更新 RPC 全部 `security definer` + 只授权 `service_role`。

**Tech Stack:** Next.js 14 App Router、TypeScript、Supabase/Postgres 15、vitest（`npm test` = `vitest run`）、zod。

**Spec:** `docs/superpowers/specs/2026-09-21-next-web-update-pipeline-design.md`

## Global Constraints

- 服务端只做「鉴权 + 中转」，不在服务端跑数据循环（Cloudflare Workers CPU 上限 5 min）。
- 写库凭据永不进入浏览器；`SUPABASE_SECRET_KEY` 只在服务端使用。
- 所有 `/api/admin/*` 写入口用 `requireAdmin({ platformOnly: true })`。
- 新 DB 函数：`security definer` + `set search_path = public` + `revoke all ... from public, anon, authenticated` + `grant execute ... to service_role` + 末尾 `notify pgrst, 'reload schema';`。
- 迁移文件命名：`supabase/migrations/20260921_<name>.sql`。
- 每个 SQL 迁移都要同步进 `supabase/schema.sql` 快照（用 `create ... if not exists` / `create or replace`，可重复执行）。
- 测试不连真库；SQL 相关测试只 `readFileSync` 断言文件内容（仿 `tests/database/popular-courses-sql.test.ts`）。
- 配置默认值：`currentYear=2026`、`currentSem=1`、`isPreenrollmentOpen=true`、`databaseLastUpdate=null`。
- 保留 `time_location`/`offer`/`schedule` 三表结构，不重命名列。

---

### Task 1: `app_config` 表迁移

**Files:**
- Create: `supabase/migrations/20260921_app_config.sql`
- Modify: `supabase/schema.sql`（末尾追加快照）
- Test: `tests/database/app-config-sql.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `public.app_config(id, current_year, current_sem, is_preenrollment_open, database_last_update, updated_at, updated_by)`，单行 `id=1`

- [ ] **Step 1: 写失败测试**

Create `tests/database/app-config-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260921_app_config.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("app_config migration", () => {
  it("creates the single-row config table", () => {
    expect(migration).toContain("create table if not exists public.app_config");
    expect(migration).toContain("check (id = 1)");
    expect(migration).toContain("check (current_sem in (1, 2))");
    expect(migration).toContain("database_last_update date");
  });

  it("seeds a default row and grants only service_role", () => {
    expect(migration).toContain("values (1, 2026, 1, true, current_date)");
    expect(migration).toContain("on conflict (id) do nothing");
    expect(migration).toContain("grant select, insert, update on table public.app_config to service_role");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });

  it("is reflected in the schema.sql snapshot", () => {
    expect(snapshot).toContain("public.app_config");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/database/app-config-sql.test.ts`
Expected: FAIL（`ENOENT` 或断言失败）

- [ ] **Step 3: 写迁移**

Create `supabase/migrations/20260921_app_config.sql`:

```sql
create table if not exists public.app_config (
  id integer primary key default 1 check (id = 1),
  current_year integer not null,
  current_sem integer not null check (current_sem in (1, 2)),
  is_preenrollment_open boolean not null default true,
  database_last_update date,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.app_config (id, current_year, current_sem, is_preenrollment_open, database_last_update)
values (1, 2026, 1, true, current_date)
on conflict (id) do nothing;

alter table public.app_config enable row level security;

revoke all on table public.app_config from public, anon, authenticated;
grant select, insert, update on table public.app_config to service_role;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: 同步 schema.sql 快照**

在 `supabase/schema.sql` 文件**末尾**追加同一段 DDL（去掉 `notify pgrst` 也可，但保留无害）：

```sql
--
-- App config (migration: 20260921_app_config.sql)
--

create table if not exists public.app_config (
  id integer primary key default 1 check (id = 1),
  current_year integer not null,
  current_sem integer not null check (current_sem in (1, 2)),
  is_preenrollment_open boolean not null default true,
  database_last_update date,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.app_config (id, current_year, current_sem, is_preenrollment_open, database_last_update)
values (1, 2026, 1, true, current_date)
on conflict (id) do nothing;
```

- [ ] **Step 5: 运行测试并提交**

Run: `npm test -- tests/database/app-config-sql.test.ts`
Expected: PASS

```bash
git add supabase/migrations/20260921_app_config.sql supabase/schema.sql tests/database/app-config-sql.test.ts
git commit -m "feat(db): add app_config table"
```

---

### Task 2: 配置读取核心 + 缓存读

**Files:**
- Create: `lib/config/app-config-core.ts`
- Create: `lib/config/app-config.ts`
- Modify: `lib/cache-tags.ts`
- Test: `tests/config/app-config-core.test.ts`

**Interfaces:**
- Consumes: `supabaseServer`（`lib/supabase/server.ts`）
- Produces:
  - `type AppConfig = { currentYear: number; currentSem: 1 | 2; isPreenrollmentOpen: boolean; databaseLastUpdate: string | null; updatedAt: string | null; updatedBy: string | null }`
  - `const DEFAULT_APP_CONFIG: AppConfig`
  - `mapAppConfigRow(row: Record<string, unknown> | null | undefined): AppConfig`
  - `readAppConfig(client: { from(table: string): any }): Promise<AppConfig>`
  - `getAppConfig(): Promise<AppConfig>`（`unstable_cache`，tag `CACHE_TAGS.appConfig`）
  - `CACHE_TAGS.appConfig = "app-config"`

- [ ] **Step 1: 写失败测试**

Create `tests/config/app-config-core.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_APP_CONFIG,
  mapAppConfigRow,
  readAppConfig,
} from "@/lib/config/app-config-core";

function fakeClient(result: { data: unknown; error: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => result,
        }),
      }),
    }),
  };
}

describe("mapAppConfigRow", () => {
  it("returns defaults for a missing row", () => {
    expect(mapAppConfigRow(null)).toEqual(DEFAULT_APP_CONFIG);
    expect(mapAppConfigRow(undefined)).toEqual(DEFAULT_APP_CONFIG);
  });

  it("maps snake_case columns and coerces types", () => {
    expect(mapAppConfigRow({
      current_year: 2027,
      current_sem: 2,
      is_preenrollment_open: false,
      database_last_update: "2027-01-15",
      updated_at: "2027-01-15T10:00:00.000Z",
      updated_by: "user_admin",
    })).toEqual({
      currentYear: 2027,
      currentSem: 2,
      isPreenrollmentOpen: false,
      databaseLastUpdate: "2027-01-15",
      updatedAt: "2027-01-15T10:00:00.000Z",
      updatedBy: "user_admin",
    });
  });

  it("falls back on invalid enum values", () => {
    expect(mapAppConfigRow({ current_year: "bad", current_sem: 9 })).toMatchObject({
      currentYear: 2026,
      currentSem: 1,
    });
  });
});

describe("readAppConfig", () => {
  it("returns defaults when the query errors", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const config = await readAppConfig(fakeClient({ data: null, error: { message: "boom" } }) as any);
    expect(config).toEqual(DEFAULT_APP_CONFIG);
    spy.mockRestore();
  });

  it("returns mapped data on success", async () => {
    const config = await readAppConfig(fakeClient({
      data: { current_year: 2028, current_sem: 1, is_preenrollment_open: true, database_last_update: null, updated_at: null, updated_by: null },
      error: null,
    }) as any);
    expect(config.currentYear).toBe(2028);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/config/app-config-core.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 core**

Create `lib/config/app-config-core.ts`:

```ts
export type AppConfig = {
  currentYear: number;
  currentSem: 1 | 2;
  isPreenrollmentOpen: boolean;
  databaseLastUpdate: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const DEFAULT_APP_CONFIG: AppConfig = {
  currentYear: 2026,
  currentSem: 1,
  isPreenrollmentOpen: true,
  databaseLastUpdate: null,
  updatedAt: null,
  updatedBy: null,
};

type SupabaseLike = { from(table: string): any };

function toNullableString(value: unknown): string | null {
  return value == null ? null : String(value);
}

export function mapAppConfigRow(row: Record<string, unknown> | null | undefined): AppConfig {
  if (!row) return { ...DEFAULT_APP_CONFIG };

  const year = Number(row.current_year);
  const sem = Number(row.current_sem);
  const open = row.is_preenrollment_open;

  return {
    currentYear: Number.isInteger(year) && year > 2000 ? year : DEFAULT_APP_CONFIG.currentYear,
    currentSem: sem === 2 ? 2 : sem === 1 ? 1 : DEFAULT_APP_CONFIG.currentSem,
    isPreenrollmentOpen: typeof open === "boolean" ? open : DEFAULT_APP_CONFIG.isPreenrollmentOpen,
    databaseLastUpdate: toNullableString(row.database_last_update),
    updatedAt: toNullableString(row.updated_at),
    updatedBy: toNullableString(row.updated_by),
  };
}

export async function readAppConfig(client: SupabaseLike): Promise<AppConfig> {
  const { data, error } = await client
    .from("app_config")
    .select("current_year, current_sem, is_preenrollment_open, database_last_update, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("[app-config] read failed:", error.message);
    return { ...DEFAULT_APP_CONFIG };
  }

  return mapAppConfigRow(data);
}
```

- [ ] **Step 4: 实现 server 读 + cache tag**

Modify `lib/cache-tags.ts`，在对象里加一行：

```ts
export const CACHE_TAGS = {
  course: "course",
  professor: "professor",
  statistics: "statistics",
  catalog: "catalog",
  appConfig: "app-config",
} as const;
```

Create `lib/config/app-config.ts`:

```ts
import "server-only";

import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/cache-tags";
import { readAppConfig, type AppConfig } from "@/lib/config/app-config-core";
import supabaseServer from "@/lib/supabase/server";

export type { AppConfig } from "@/lib/config/app-config-core";

export const getAppConfig = unstable_cache(
  async (): Promise<AppConfig> => readAppConfig(supabaseServer),
  ["app-config"],
  { tags: [CACHE_TAGS.appConfig], revalidate: 300 },
);
```

- [ ] **Step 5: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/config/app-config-core.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add lib/config/app-config-core.ts lib/config/app-config.ts lib/cache-tags.ts tests/config/app-config-core.test.ts
git commit -m "feat(config): add cached app config reader"
```

---

### Task 3: `/api/admin/app-config` 路由

**Files:**
- Create: `app/api/admin/app-config/route.ts`
- Modify: `lib/validation/admin.ts`（加 `appConfigUpdateSchema`）
- Modify: `lib/admin-audit.ts`（action union 加 `"config.update"`）
- Test: `tests/api/admin/app-config.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`、`writeAuditLog`、`supabaseAdmin`、`readJsonBody`/`apiError`、`CACHE_TAGS`、`mapAppConfigRow`
- Produces:
  - `GET /api/admin/app-config` → `{ config: AppConfig }`
  - `POST /api/admin/app-config`（body 为 `appConfigUpdateSchema`）→ `{ config: AppConfig }`，并 `revalidateTag("app-config")`

- [ ] **Step 1: 写失败测试**

Create `tests/api/admin/app-config.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireAdmin, writeAuditLog, revalidateTag, maybeSingle, single, update } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAuditLog: vi.fn(),
  revalidateTag: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));
vi.mock("@/lib/admin-audit", () => ({ writeAuditLog }));
vi.mock("next/cache", () => ({ revalidateTag }));
vi.mock("@/lib/supabase/admin", () => {
  const builder: any = {
    select: () => builder,
    update: (value: unknown) => {
      update(value);
      return builder;
    },
    eq: () => builder,
    maybeSingle,
    single,
  };
  return { default: { from: () => builder } };
});

import { GET, POST } from "@/app/api/admin/app-config/route";

const row = {
  current_year: 2026,
  current_sem: 1,
  is_preenrollment_open: true,
  database_last_update: "2026-08-08",
  updated_at: null,
  updated_by: null,
};

describe("/api/admin/app-config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: true } });
    maybeSingle.mockResolvedValue({ data: row, error: null });
    single.mockResolvedValue({ data: { ...row, current_sem: 2 }, error: null });
  });

  it("requires platform admin", async () => {
    requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "forbidden", message: "x" } }, { status: 403 }),
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(requireAdmin).toHaveBeenCalledWith({ platformOnly: true });
  });

  it("returns the mapped config", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      config: {
        currentYear: 2026,
        currentSem: 1,
        isPreenrollmentOpen: true,
        databaseLastUpdate: "2026-08-08",
        updatedAt: null,
        updatedBy: null,
      },
    });
  });

  it("updates, revalidates and audits", async () => {
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_sem: 2 }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0][0]).toMatchObject({ current_sem: 2, updated_by: "user_admin" });
    expect(revalidateTag).toHaveBeenCalledWith("app-config");
    expect(writeAuditLog).toHaveBeenCalledOnce();
  });

  it("rejects invalid bodies", async () => {
    const request = new Request("http://localhost/api/admin/app-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_sem: 9 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/api/admin/app-config.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 加 validation + audit action**

在 `lib/validation/admin.ts` 末尾追加：

```ts
export const appConfigUpdateSchema = z
  .object({
    current_year: z.coerce.number().int().min(2000).max(2100).optional(),
    current_sem: z.union([z.literal(1), z.literal(2)]).optional(),
    is_preenrollment_open: z.boolean().optional(),
    database_last_update: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "no fields to update" });
```

在 `lib/admin-audit.ts` 的 `action` union 里加一项 `| "config.update"`：

```ts
  action:
    | "report.update"
    | "comment.update"
    | "course.update"
    | "prof.update"
    | "admin.grant"
    | "admin.revoke"
    | "sync.um"
    | "config.update";
```

- [ ] **Step 4: 实现路由**

Create `app/api/admin/app-config/route.ts`:

```ts
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { mapAppConfigRow } from "@/lib/config/app-config-core";
import supabaseAdmin from "@/lib/supabase/admin";
import { appConfigUpdateSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const { data, error } = await supabaseAdmin
    .from("app_config")
    .select("current_year, current_sem, is_preenrollment_open, database_last_update, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();

  if (error) return apiError("internal_error", "Unable to load app config", 500);
  return NextResponse.json({ config: mapAppConfigRow(data) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const body = await readJsonBody(request, 4_096);
  if (!body.ok) return body.response;

  const parsed = appConfigUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid app config", 400, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const patch = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
    updated_by: admin.session.userId,
  };

  const { data, error } = await supabaseAdmin
    .from("app_config")
    .update(patch)
    .eq("id", 1)
    .select("current_year, current_sem, is_preenrollment_open, database_last_update, updated_at, updated_by")
    .single();

  if (error) return apiError("internal_error", "Unable to update app config", 500);

  revalidateTag(CACHE_TAGS.appConfig);
  await writeAuditLog({
    actorId: admin.session.userId,
    action: "config.update",
    targetType: "app_config",
    targetId: 1,
    after: patch,
  });

  return NextResponse.json({ config: mapAppConfigRow(data) });
}
```

- [ ] **Step 5: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/api/admin/app-config.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add app/api/admin/app-config/route.ts lib/validation/admin.ts lib/admin-audit.ts tests/api/admin/app-config.test.ts
git commit -m "feat(admin): add app config endpoint"
```

---

### Task 4: 配置消费方迁移（去掉 4 个 env）

**Files:**
- Create: `lib/config/term-format.ts`
- Create: `lib/config/offered-badge.ts`
- Modify: `components/search.tsx`（接收 props，去掉 `process.env`）
- Modify: `app/page.tsx`（改成 async，读取配置并传 props）
- Modify: `components/prof-card.tsx`（`await getAppConfig()`）
- Modify: `app/reviews/[code]/[...prof]/page.tsx`（`await getAppConfig()`）
- Modify: `lib/sitemap-data.ts`（改成 async）
- Modify: `app/sitemap.ts`（await sitemap helpers）
- Test: `tests/config/term-format.test.ts`
- Test: `tests/config/offered-badge.test.ts`
- Test: `tests/sitemap-data.test.ts`（更新）

**Interfaces:**
- Consumes: `getAppConfig`（Task 2）
- Produces:
  - `formatAcademicYear(year: number, sem: number): string` → `"2026/2027 AY Sem 1"`
  - `shouldShowOfferedBadge(isPreenrollmentOpen: boolean, isOffered: unknown): boolean`
  - `getSitemapLastModified(): Promise<Date>`、`buildCatalogSitemap(): Promise<Array<{ url: string; lastModified: Date; changeFrequency: "monthly"; priority: number }>>`
  - `SearchComp` props：`{ currentYear: number; currentSem: number; databaseLastUpdate: string | null }`

- [ ] **Step 1: 写失败测试**

Create `tests/config/term-format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatAcademicYear } from "@/lib/config/term-format";

describe("formatAcademicYear", () => {
  it("formats the academic year label", () => {
    expect(formatAcademicYear(2026, 1)).toBe("2026/2027 AY Sem 1");
    expect(formatAcademicYear(2026, 2)).toBe("2026/2027 AY Sem 2");
  });
});
```

Create `tests/config/offered-badge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { shouldShowOfferedBadge } from "@/lib/config/offered-badge";

describe("shouldShowOfferedBadge", () => {
  it("only shows when pre-enrollment is closed and the offering is on", () => {
    expect(shouldShowOfferedBadge(false, true)).toBe(true);
    expect(shouldShowOfferedBadge(true, true)).toBe(false);
    expect(shouldShowOfferedBadge(false, 0)).toBe(false);
    expect(shouldShowOfferedBadge(false, undefined)).toBe(false);
  });
});
```

Update `tests/sitemap-data.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAppConfig } = vi.hoisted(() => ({ getAppConfig: vi.fn() }));
vi.mock("@/lib/config/app-config", () => ({ getAppConfig }));

import { buildCatalogSitemap, getSitemapLastModified } from "@/lib/sitemap-data";

describe("sitemap data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppConfig.mockResolvedValue({
      currentYear: 2026,
      currentSem: 1,
      isPreenrollmentOpen: true,
      databaseLastUpdate: "2026-09-01",
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("builds canonical GE catalog URLs without querying the database", async () => {
    const urls = (await buildCatalogSitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://umeh.top/catalog/gecourse");
    expect(urls).toContain("https://umeh.top/catalog/gecourse/GEGA");
  });

  it("uses one stable lastModified value", async () => {
    const entries = await buildCatalogSitemap();
    expect(new Set(entries.map((entry) => entry.lastModified.getTime())).size).toBe(1);
  });

  it("returns the configured last-updated date", async () => {
    await expect(getSitemapLastModified()).resolves.toEqual(new Date("2026-09-01T00:00:00.000Z"));
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/config/term-format.test.ts tests/config/offered-badge.test.ts tests/sitemap-data.test.ts`
Expected: FAIL（模块不存在 / 函数不是 async）

- [ ] **Step 3: 实现两个纯 helper**

Create `lib/config/term-format.ts`:

```ts
export function formatAcademicYear(year: number, sem: number): string {
  return `${year}/${year + 1} AY Sem ${sem}`;
}
```

Create `lib/config/offered-badge.ts`:

```ts
export function shouldShowOfferedBadge(isPreenrollmentOpen: boolean, isOffered: unknown): boolean {
  return !isPreenrollmentOpen && Boolean(isOffered);
}
```

- [ ] **Step 4: 改消费方**

`lib/sitemap-data.ts`：整个文件替换为：

```ts
import { getAppConfig } from "@/lib/config/app-config";
import { faculty, faculty_dept } from "@/lib/consant";

const SITE_URL = "https://umeh.top";

function parseLastModified(value: string | null) {
  if (!value) return new Date("2026-08-15T00:00:00.000Z");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? new Date("2026-08-15T00:00:00.000Z") : parsed;
}

export async function getSitemapLastModified() {
  const { databaseLastUpdate } = await getAppConfig();
  return parseLastModified(databaseLastUpdate);
}

export async function buildCatalogSitemap() {
  const entries: Array<{
    url: string;
    lastModified: Date;
    changeFrequency: "monthly";
    priority: number;
  }> = [];
  const lastModified = await getSitemapLastModified();

  for (const fac of faculty) {
    entries.push({
      url: `${SITE_URL}/catalog/${fac}`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    });

    for (const dept of faculty_dept[fac] ?? []) {
      entries.push({
        url: `${SITE_URL}/catalog/${fac}/${dept}`,
        lastModified,
        changeFrequency: "monthly",
        priority: 0.7,
      });
    }
  }

  return entries;
}
```

`app/sitemap.ts`：把 `getSitemapLastModified()` / `buildCatalogSitemap()` 的调用改成 `await`：

- `fetchCourseSitemap` 里：`lastModified: getSitemapLastModified()` → `lastModified: await getSitemapLastModified()`
- `fetchReviewSitemap` 里：同样加 `await`
- `sitemap()` 里：`const lastModified = getSitemapLastModified();` → `const lastModified = await getSitemapLastModified();`
- `sitemap()` 里：`const catalogSitemap = buildCatalogSitemap();` → `const catalogSitemap = await buildCatalogSitemap();`

`components/search.tsx`：

```tsx
import { formatAcademicYear } from "@/lib/config/term-format";

type SearchCompProps = {
  currentYear: number;
  currentSem: number;
  databaseLastUpdate: string | null;
};

export default function SearchComp({ currentYear, currentSem, databaseLastUpdate }: SearchCompProps) {
```

把卡片 footer 两行改成：

```tsx
<div className=''>{formatAcademicYear(currentYear, currentSem)}</div>
<div className='italic'>Data Source: reg.um.edu.mo</div>
<div className='italic'>Last updated on: {databaseLastUpdate ?? "2026-08-08"}</div>
```

`app/page.tsx`：第 8 行的 `function HomePage() {` 改成 async，并在 `<SearchComp />` 处传 props：

```tsx
// 新增 import
import { getAppConfig } from "@/lib/config/app-config";

// 原：function HomePage() {
async function HomePage() {
  const { currentYear, currentSem, databaseLastUpdate } = await getAppConfig();

  return (
    <>
      {/* 原：<SearchComp /> */}
      <SearchComp
        currentYear={currentYear}
        currentSem={currentSem}
        databaseLastUpdate={databaseLastUpdate}
      />
```

`components/prof-card.tsx`：

在文件顶部 import 区加两行：

```tsx
import { getAppConfig } from "@/lib/config/app-config";
import { shouldShowOfferedBadge } from "@/lib/config/offered-badge";
```

把 `ProfCard`（文件第 7 行起）改成：

```tsx
const ProfCard= async ({data,code}:{data:any,code:any})=>{
    const { isPreenrollmentOpen } = await getAppConfig();
    return(
        <Link href={'/reviews/'+code+'/'+data.prof_id}>
            <Card className='hover:cursor-pointer hover:shadow-lg'>
                <CardHeader className='pb-0.5'>
                    <div className='flex flex-row justify-between'>
                        <div className="break-words">
                            {data.prof_id}
                        </div>
                        <div className='text-white flex flex-col'>
                            {
                                (parseInt(code[4])<=4 && shouldShowOfferedBadge(isPreenrollmentOpen, data.is_offered)) &&
                                    <span className='text-xs font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow font-normal'> Offered</span>
                            }
                        </div>
                    </div>
                </CardHeader>
```

> 只改 `ProfCard`；`ProfCourseCard` 不用动（它本来就没读 `IS_PREENROLLMENT_OPEN`）。

`app/reviews/[code]/[...prof]/page.tsx`：

1. 顶部加 `import { getAppConfig } from "@/lib/config/app-config";`
2. 在 page 组件里（`const timetable = await getScheduleList(code, prof);` 那一行附近）加：

```tsx
const { isPreenrollmentOpen } = await getAppConfig();
```

3. 把下面这段：

```tsx
                                {(
                                    Number(process.env.IS_PREENROLLMENT_OPEN)==0 ?
                                        (is_offered ?
                                            <span className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow font-normal'> Offered</span>
                                            : null
                                            // <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>
                                        )
                                        :
                                        null
                                )}
```

改成：

```tsx
                                {(
                                    !isPreenrollmentOpen ?
                                        (is_offered ?
                                            <span className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow font-normal'> Offered</span>
                                            : null
                                        )
                                        :
                                        null
                                )}
```

- [ ] **Step 5: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/config/term-format.test.ts tests/config/offered-badge.test.ts tests/sitemap-data.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add lib/config/term-format.ts lib/config/offered-badge.ts lib/sitemap-data.ts app/sitemap.ts components/search.tsx app/page.tsx components/prof-card.tsx "app/reviews/[code]/[...prof]/page.tsx" tests/config/term-format.test.ts tests/config/offered-badge.test.ts tests/sitemap-data.test.ts
git commit -m "refactor(config): read current term from app_config"
```

---

### Task 5: 课表硬化迁移

**Files:**
- Create: `supabase/migrations/20260921_timetable_hardening.sql`
- Modify: `supabase/schema.sql`（末尾追加约束/索引/注释快照）
- Test: `tests/database/timetable-hardening-sql.test.ts`

**Interfaces:**
- Produces（供 Task 7 的 `on conflict` 使用）：
  - `time_location_slot_unique_idx (date, times, location)`
  - `offer_section_unique_idx (course_id, section, year, sem)`
  - `schedule_unique_idx (course_id, time_location_id)`

- [ ] **Step 1: 写失败测试**

Create `tests/database/timetable-hardening-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260921_timetable_hardening.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("timetable hardening migration", () => {
  it("normalizes existing values", () => {
    expect(sql).toContain("set date = upper(btrim(date))");
    expect(sql).toContain("replace(btrim(times), ' ', '')");
    expect(sql).toContain("set location = btrim(location)");
    expect(sql).toContain("set section = btrim(section)");
  });

  it("dedupes before adding unique indexes", () => {
    expect(sql).toContain("tmp_time_location_dedupe");
    expect(sql).toContain("tmp_offer_dedupe");
    expect(sql).toContain("tmp_schedule_dedupe");
    expect(sql.indexOf("tmp_time_location_dedupe")).toBeLessThan(sql.indexOf("time_location_slot_unique_idx"));
    expect(sql.indexOf("tmp_offer_dedupe")).toBeLessThan(sql.indexOf("offer_section_unique_idx"));
  });

  it("creates the three unique indexes", () => {
    expect(sql).toContain("unique index if not exists time_location_slot_unique_idx");
    expect(sql).toContain("unique index if not exists offer_section_unique_idx");
    expect(sql).toContain("unique index if not exists schedule_unique_idx");
  });

  it("is reflected in the schema.sql snapshot", () => {
    expect(snapshot).toContain("time_location_slot_unique_idx");
    expect(snapshot).toContain("offer_section_unique_idx");
    expect(snapshot).toContain("schedule_unique_idx");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/database/timetable-hardening-sql.test.ts`
Expected: FAIL（ENOENT）

- [ ] **Step 3: 写迁移**

Create `supabase/migrations/20260921_timetable_hardening.sql`:

```sql
-- 1. 规范化存量值
update public.time_location set date = upper(btrim(date)) where date <> upper(btrim(date));
update public.time_location set times = replace(btrim(times), ' ', '') where times <> replace(btrim(times), ' ', '');
update public.time_location set location = btrim(location) where location <> btrim(location);
update public.offer set section = btrim(section) where section <> btrim(section);

-- 2. time_location dedupe（保留最小 id，改指 schedule.time_location_id）
do $$
begin
  create temporary table tmp_time_location_dedupe on commit drop as
  with ranked as (
    select id, date, times, location,
           row_number() over (partition by date, times, location order by id asc) as rn
    from public.time_location
  )
  select keep.id as keep_id, keep.date, keep.times, keep.location,
         array_agg(drop_row.id order by drop_row.id) as drop_ids
  from ranked keep
  join ranked drop_row
    on keep.date = drop_row.date
   and keep.times = drop_row.times
   and keep.location = drop_row.location
  where keep.rn = 1 and drop_row.rn > 1
  group by keep.id, keep.date, keep.times, keep.location;

  update public.schedule s
  set time_location_id = d.keep_id
  from tmp_time_location_dedupe d
  where s.time_location_id = any(d.drop_ids);

  delete from public.time_location t
  using tmp_time_location_dedupe d
  where t.id = any(d.drop_ids);
end $$;

-- 3. offer dedupe（保留最小 id，改指 schedule.course_id）
do $$
begin
  create temporary table tmp_offer_dedupe on commit drop as
  with ranked as (
    select id, course_id, section, year, sem,
           row_number() over (partition by course_id, section, year, sem order by id asc) as rn
    from public.offer
  )
  select keep.id as keep_id, keep.course_id, keep.section, keep.year, keep.sem,
         array_agg(drop_row.id order by drop_row.id) as drop_ids
  from ranked keep
  join ranked drop_row
    on keep.course_id = drop_row.course_id
   and keep.section = drop_row.section
   and keep.year = drop_row.year
   and keep.sem = drop_row.sem
  where keep.rn = 1 and drop_row.rn > 1
  group by keep.id, keep.course_id, keep.section, keep.year, keep.sem;

  update public.schedule s
  set course_id = d.keep_id
  from tmp_offer_dedupe d
  where s.course_id = any(d.drop_ids);

  delete from public.offer o
  using tmp_offer_dedupe d
  where o.id = any(d.drop_ids);
end $$;

-- 4. schedule dedupe
do $$
begin
  create temporary table tmp_schedule_dedupe on commit drop as
  with ranked as (
    select id, row_number() over (partition by course_id, time_location_id order by id asc) as rn
    from public.schedule
  )
  select id from ranked where rn > 1;

  delete from public.schedule s
  using tmp_schedule_dedupe d
  where s.id = d.id;
end $$;

-- 5. 唯一索引
create unique index if not exists time_location_slot_unique_idx on public.time_location (date, times, location);
create unique index if not exists offer_section_unique_idx on public.offer (course_id, section, year, sem);
create unique index if not exists schedule_unique_idx on public.schedule (course_id, time_location_id);

-- 6. CHECK（NOT VALID：不扫描存量，但约束新写入）
alter table public.time_location drop constraint if exists time_location_date_check;
alter table public.time_location
  add constraint time_location_date_check
  check (date in ('MON','TUE','WED','THU','FRI','SAT','SUN')) not valid;

alter table public.time_location drop constraint if exists time_location_times_check;
alter table public.time_location
  add constraint time_location_times_check
  check (times ~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$') not valid;

-- 7. 语义注释
comment on column public.offer.course_id is 'references prof_with_course.id (NOT course code)';
comment on column public.schedule.course_id is 'references offer.id (NOT course code)';
comment on column public.time_location.date is 'weekday, uppercase MON..SUN';
comment on column public.time_location.times is 'HH:MM-HH:MM';

notify pgrst, 'reload schema';
```

- [ ] **Step 4: 同步 schema.sql 快照**

在 `supabase/schema.sql` 末尾追加**最终结构**（不含 dedupe）：

```sql
--
-- Timetable hardening (migration: 20260921_timetable_hardening.sql)
--

create unique index if not exists time_location_slot_unique_idx on public.time_location (date, times, location);
create unique index if not exists offer_section_unique_idx on public.offer (course_id, section, year, sem);
create unique index if not exists schedule_unique_idx on public.schedule (course_id, time_location_id);

alter table public.time_location drop constraint if exists time_location_date_check;
alter table public.time_location
  add constraint time_location_date_check
  check (date in ('MON','TUE','WED','THU','FRI','SAT','SUN')) not valid;

alter table public.time_location drop constraint if exists time_location_times_check;
alter table public.time_location
  add constraint time_location_times_check
  check (times ~ '^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$') not valid;

comment on column public.offer.course_id is 'references prof_with_course.id (NOT course code)';
comment on column public.schedule.course_id is 'references offer.id (NOT course code)';
comment on column public.time_location.date is 'weekday, uppercase MON..SUN';
comment on column public.time_location.times is 'HH:MM-HH:MM';
```

- [ ] **Step 5: 运行测试并提交**

Run: `npm test -- tests/database/timetable-hardening-sql.test.ts`
Expected: PASS

```bash
git add supabase/migrations/20260921_timetable_hardening.sql supabase/schema.sql tests/database/timetable-hardening-sql.test.ts
git commit -m "feat(db): harden timetable tables with dedupe and unique indexes"
```

---

### Task 6: `get_schedule_list` 服务端按学期过滤

**Files:**
- Create: `supabase/migrations/20260921_get_schedule_list.sql`
- Modify: `supabase/schema.sql`（末尾追加 drop + 新函数）
- Modify: `lib/database/get-schedule-list.ts`
- Test: `tests/database/get-schedule-list-sql.test.ts`
- Test: `tests/database/get-schedule-list.test.ts`

**Interfaces:**
- Consumes: `getAppConfig`（Task 2）
- Produces:
  - `public.get_schedule_list(course_code text, prof text, target_year integer, target_sem integer)`
  - `getScheduleList(code: string, prof: string)` 仍返回 `Array<{ section: string; schedules: Array<{ date, time, location }> }>`

- [ ] **Step 1: 写失败测试**

Create `tests/database/get-schedule-list-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260921_get_schedule_list.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("get_schedule_list rewrite", () => {
  it("drops the old two-arg signature and defines the four-arg one", () => {
    expect(sql).toContain("drop function if exists public.get_schedule_list(text, text)");
    expect(sql).toContain("target_year integer");
    expect(sql).toContain("target_sem integer");
    expect(sql).toContain("where o.year = target_year and o.sem = target_sem");
  });

  it("grants only service_role and reloads the schema cache", () => {
    expect(sql).toContain("grant execute on function public.get_schedule_list(text, text, integer, integer) to service_role");
    expect(sql).toContain("notify pgrst, 'reload schema'");
    expect(snapshot).toContain("target_year integer");
  });
});
```

Create `tests/database/get-schedule-list.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAppConfig, rpc } = vi.hoisted(() => ({ getAppConfig: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/config/app-config", () => ({ getAppConfig }));
vi.mock("@/lib/supabase/server", () => ({ default: { rpc } }));

import getScheduleList from "@/lib/database/get-schedule-list";

describe("getScheduleList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAppConfig.mockResolvedValue({ currentYear: 2026, currentSem: 1 });
  });

  it("passes the current term to the RPC and groups by section", async () => {
    rpc.mockResolvedValue({
      data: [
        { section: "1", date: "MON", times: "09:00-10:15", location: "E1" },
        { section: "1", date: "MON", times: "09:00-10:15", location: "E1" },
        { section: "1", date: "WED", times: "09:00-10:15", location: "E1" },
        { section: "2", date: "FRI", times: "13:00-14:15", location: "E2" },
      ],
      error: null,
    });

    const result = await getScheduleList("ACCT1000", "CHAN Tai Man");

    expect(rpc).toHaveBeenCalledWith("get_schedule_list", {
      course_code: "ACCT1000",
      prof: "CHAN Tai Man",
      target_year: 2026,
      target_sem: 1,
    });
    expect(result).toEqual([
      {
        section: "1",
        schedules: [
          { date: "MON", time: "09:00-10:15", location: "E1" },
          { date: "WED", time: "09:00-10:15", location: "E1" },
        ],
      },
      { section: "2", schedules: [{ date: "FRI", time: "13:00-14:15", location: "E2" }] },
    ]);
  });

  it("returns an empty array on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getScheduleList("ACCT1000", "X")).resolves.toEqual([]);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/database/get-schedule-list-sql.test.ts tests/database/get-schedule-list.test.ts`
Expected: FAIL

- [ ] **Step 3: 写迁移**

Create `supabase/migrations/20260921_get_schedule_list.sql`:

```sql
drop function if exists public.get_schedule_list(text, text);

create or replace function public.get_schedule_list(
  course_code text,
  prof text,
  target_year integer,
  target_sem integer
)
returns table (year integer, sem integer, section text, date text, times text, location text)
language sql
stable
security invoker
set search_path = public
as $function$
  select o.year, o.sem, o.section, tl.date, tl.times, tl.location
  from public.get_offer_list_by_prof(course_code, prof) o
  join public.schedule s on s.course_id = o.id
  join public.time_location tl on tl.id = s.time_location_id
  where o.year = target_year and o.sem = target_sem
  order by o.section, tl.date, tl.times, tl.location;
$function$;

revoke all on function public.get_schedule_list(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_schedule_list(text, text, integer, integer)
  to service_role;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: 同步 snapshot + 改 wrapper**

在 `supabase/schema.sql` 末尾追加与上一步相同的 `drop function` + `create or replace function` + grants（去掉 `notify` 可保留）。

改 `lib/database/get-schedule-list.ts` 为：

```ts
import { getAppConfig } from "@/lib/config/app-config";
import supabaseServer from "@/lib/supabase/server";

type ScheduleEntry = { date: string; time: string; location: string };
type SectionEntry = { section: string; schedules: ScheduleEntry[] };

const getScheduleList = async (code: string, prof: string): Promise<SectionEntry[]> => {
  const { currentYear, currentSem } = await getAppConfig();

  const { data, error } = await supabaseServer.rpc("get_schedule_list", {
    course_code: code,
    prof: prof.replaceAll("%20", " ").replaceAll("$", "/"),
    target_year: currentYear,
    target_sem: currentSem,
  });

  if (error) {
    console.error("[getScheduleList] rpc failed:", error.message);
    return [];
  }

  const sections = new Map<string, SectionEntry>();

  for (const entry of data ?? []) {
    const section = String(entry.section);
    const bucket = sections.get(section) ?? { section, schedules: [] };
    const schedule: ScheduleEntry = { date: entry.date, time: entry.times, location: entry.location };

    if (!bucket.schedules.some((item) =>
      item.date === schedule.date && item.time === schedule.time && item.location === schedule.location
    )) {
      bucket.schedules.push(schedule);
    }

    sections.set(section, bucket);
  }

  return Array.from(sections.values());
};

export default getScheduleList;
```

- [ ] **Step 5: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/database/get-schedule-list-sql.test.ts tests/database/get-schedule-list.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add supabase/migrations/20260921_get_schedule_list.sql supabase/schema.sql lib/database/get-schedule-list.ts tests/database/get-schedule-list-sql.test.ts tests/database/get-schedule-list.test.ts
git commit -m "feat(db): filter get_schedule_list by term server-side"
```

---

### Task 7: 更新流水线 RPC

**Files:**
- Create: `supabase/migrations/20260921_update_rpcs.sql`
- Modify: `supabase/schema.sql`（末尾追加快照）
- Test: `tests/database/update-rpcs-sql.test.ts`

**Interfaces:**
- Consumes: Task 5 的唯一索引（`on conflict` 目标）
- Produces（供 Plan 2 的浏览器调用；全部只授权 `service_role`）：
  - `admin_reset_offered() returns jsonb`
  - `admin_resolve_known_codes(codes text[]) returns text[]`
  - `admin_mark_offered(codes text[]) returns integer`
  - `admin_upsert_offered_courses(payload jsonb) returns jsonb`
  - `admin_apply_schedule(payload jsonb, scope text) returns jsonb`

- [ ] **Step 1: 写失败测试**

Create `tests/database/update-rpcs-sql.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260921_update_rpcs.sql", "utf8");
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("update pipeline RPCs", () => {
  it("defines all five functions as security definer", () => {
    for (const fn of [
      "admin_reset_offered()",
      "admin_resolve_known_codes(codes text[])",
      "admin_mark_offered(codes text[])",
      "admin_upsert_offered_courses(payload jsonb)",
      "admin_apply_schedule(payload jsonb, scope text)",
    ]) {
      expect(sql).toContain(`function public.${fn}`);
    }
    expect((sql.match(/security definer/g) ?? []).length).toBe(5);
  });

  it("uses the hardened unique indexes for idempotent writes", () => {
    expect(sql).toContain("on conflict (\"New_code\") do update set \"Is_Offered\" = 1");
    expect(sql).toContain("on conflict (course_id, prof_id) do update set is_offered = 1");
    expect(sql).toContain("on conflict (date, times, location) do nothing");
    expect(sql).toContain("on conflict (course_id, section, year, sem) do nothing");
    expect(sql).toContain("on conflict (course_id, time_location_id) do nothing");
  });

  it("grants execute to service_role and reloads the schema cache", () => {
    expect(sql).toContain("grant execute on function public.admin_apply_schedule(jsonb, text) to service_role");
    expect(sql).toContain("notify pgrst, 'reload schema'");
    expect(snapshot).toContain("admin_apply_schedule");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/database/update-rpcs-sql.test.ts`
Expected: FAIL（ENOENT）

- [ ] **Step 3: 写迁移**

Create `supabase/migrations/20260921_update_rpcs.sql`：

```sql
create or replace function public.admin_reset_offered()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  course_rows integer;
  prof_rows integer;
begin
  update public.course_noporf set "Is_Offered" = 0 where "New_code" <> '';
  get diagnostics course_rows = row_count;
  update public.prof_with_course set is_offered = 0 where course_id <> '';
  get diagnostics prof_rows = row_count;
  return jsonb_build_object('course_noporf', course_rows, 'prof_with_course', prof_rows);
end;
$function$;

create or replace function public.admin_resolve_known_codes(codes text[])
returns text[]
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(array_agg("New_code"), '{}'::text[])
  from public.course_noporf
  where "New_code" = any(codes);
$function$;

create or replace function public.admin_mark_offered(codes text[])
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  affected integer;
begin
  update public.course_noporf set "Is_Offered" = 1 where "New_code" = any(codes);
  get diagnostics affected = row_count;
  return affected;
end;
$function$;

create or replace function public.admin_upsert_offered_courses(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  upserted integer := 0;
  marked integer := 0;
begin
  insert into public.course_noporf (
    "Offering_Unit", "Offering_Department", "New_code", "Old_code",
    "courseTitleEng", "courseTitleChi", "Credits", "Course_Duration",
    "Medium_of_Instruction", "Is_Offered", "offeringProgLevel", "courseType",
    "suggestedYearOfStudy", "gradingSystem", "courseDescription", ilo
  )
  select
    coalesce(x."Offering_Unit", ''),
    coalesce(x."Offering_Department", ''),
    upper(btrim(x."New_code")),
    coalesce(x."Old_code", ''),
    coalesce(x."courseTitleEng", ''),
    coalesce(x."courseTitleChi", ''),
    coalesce(x."Credits", ''),
    coalesce(x."Course_Duration", ''),
    coalesce(x."Medium_of_Instruction", ''),
    1,
    x."offeringProgLevel",
    x."courseType",
    x."suggestedYearOfStudy",
    x."gradingSystem",
    x."courseDescription",
    x.ilo
  from jsonb_to_recordset(coalesce(payload->'inserts', '[]'::jsonb)) as x(
    "Offering_Unit" text, "Offering_Department" text, "New_code" text, "Old_code" text,
    "courseTitleEng" text, "courseTitleChi" text, "Credits" text, "Course_Duration" text,
    "Medium_of_Instruction" text, "offeringProgLevel" text, "courseType" text,
    "suggestedYearOfStudy" numeric, "gradingSystem" text, "courseDescription" text, ilo text
  )
  where coalesce(x."New_code", '') <> ''
  on conflict ("New_code") do update set "Is_Offered" = 1;
  get diagnostics upserted = row_count;

  update public.course_noporf set "Is_Offered" = 1
  where "New_code" = any (
    select value from jsonb_array_elements_text(coalesce(payload->'offered_codes', '[]'::jsonb))
  );
  get diagnostics marked = row_count;

  return jsonb_build_object('upserted', upserted, 'marked', marked);
end;
$function$;

create or replace function public.admin_apply_schedule(payload jsonb, scope text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_year integer := nullif(payload->>'year', '')::integer;
  target_sem integer := nullif(payload->>'sem', '')::integer;
  tl_rows integer := 0;
  pwc_rows integer := 0;
  offer_rows integer := 0;
  sched_rows integer := 0;
begin
  if scope not in ('time_location', 'prof_course', 'offer', 'all') then
    raise exception 'invalid scope: %', scope;
  end if;

  if scope in ('offer', 'all') and (target_year is null or target_sem is null) then
    raise exception 'year and sem are required for scope %', scope;
  end if;

  with rows as (
    select distinct
      upper(btrim(r->>'day')) as date,
      replace(btrim(r->>'times'), ' ', '') as times,
      btrim(r->>'location') as location
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    where coalesce(r->>'day', '') <> ''
      and coalesce(r->>'times', '') <> ''
      and coalesce(r->>'location', '') <> ''
  ), ins as (
    insert into public.time_location (date, times, location)
    select date, times, location from rows
    on conflict (date, times, location) do nothing
    returning 1
  )
  select count(*) into tl_rows from ins;

  if scope = 'time_location' then
    return jsonb_build_object('time_location', tl_rows);
  end if;

  with rows as (
    select distinct btrim(r->>'code') as course_id, btrim(r->>'prof') as prof_id
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    where coalesce(r->>'code', '') <> '' and coalesce(r->>'prof', '') <> ''
  ), ins as (
    insert into public.prof_with_course (course_id, prof_id, is_offered)
    select course_id, prof_id, 1 from rows
    on conflict (course_id, prof_id) do update set is_offered = 1
    returning 1
  )
  select count(*) into pwc_rows from ins;

  if scope = 'prof_course' then
    return jsonb_build_object('prof_with_course', pwc_rows);
  end if;

  with rows as (
    select distinct p.id as pwc_id, btrim(r->>'section') as section
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    join public.prof_with_course p
      on p.course_id = btrim(r->>'code') and p.prof_id = btrim(r->>'prof')
    where coalesce(r->>'section', '') <> ''
  ), ins as (
    insert into public.offer (course_id, section, year, sem)
    select pwc_id, section, target_year, target_sem from rows
    on conflict (course_id, section, year, sem) do nothing
    returning 1
  )
  select count(*) into offer_rows from ins;

  with rows as (
    select distinct o.id as offer_id, tl.id as tl_id
    from jsonb_array_elements(coalesce(payload->'rows', '[]'::jsonb)) r
    join public.prof_with_course p
      on p.course_id = btrim(r->>'code') and p.prof_id = btrim(r->>'prof')
    join public.offer o
      on o.course_id = p.id and o.section = btrim(r->>'section')
     and o.year = target_year and o.sem = target_sem
    join public.time_location tl
      on tl.date = upper(btrim(r->>'day'))
     and tl.times = replace(btrim(r->>'times'), ' ', '')
     and tl.location = btrim(r->>'location')
    where coalesce(r->>'day', '') <> ''
      and coalesce(r->>'times', '') <> ''
      and coalesce(r->>'location', '') <> ''
  ), ins as (
    insert into public.schedule (course_id, time_location_id)
    select offer_id, tl_id from rows
    on conflict (course_id, time_location_id) do nothing
    returning 1
  )
  select count(*) into sched_rows from ins;

  return jsonb_build_object(
    'time_location', tl_rows,
    'prof_with_course', pwc_rows,
    'offer', offer_rows,
    'schedule', sched_rows
  );
end;
$function$;

revoke all on function public.admin_reset_offered() from public, anon, authenticated;
revoke all on function public.admin_resolve_known_codes(text[]) from public, anon, authenticated;
revoke all on function public.admin_mark_offered(text[]) from public, anon, authenticated;
revoke all on function public.admin_upsert_offered_courses(jsonb) from public, anon, authenticated;
revoke all on function public.admin_apply_schedule(jsonb, text) from public, anon, authenticated;

grant execute on function public.admin_reset_offered() to service_role;
grant execute on function public.admin_resolve_known_codes(text[]) to service_role;
grant execute on function public.admin_mark_offered(text[]) to service_role;
grant execute on function public.admin_upsert_offered_courses(jsonb) to service_role;
grant execute on function public.admin_apply_schedule(jsonb, text) to service_role;

notify pgrst, 'reload schema';
```

- [ ] **Step 4: 同步 schema.sql 快照**

把同一段（函数定义 + revoke/grant）追加到 `supabase/schema.sql` 末尾。

- [ ] **Step 5: 运行测试 + 全量回归并提交**

Run: `npm test -- tests/database/update-rpcs-sql.test.ts`
Expected: PASS

Run: `npm test`
Expected: 全绿

```bash
git add supabase/migrations/20260921_update_rpcs.sql supabase/schema.sql tests/database/update-rpcs-sql.test.ts
git commit -m "feat(db): add update pipeline RPCs"
```

---

## Plan 1 完成标准

- `npm test` 全绿，`npx tsc --noEmit` 无新增错误。
- `supabase/migrations/20260921_{app_config,timetable_hardening,get_schedule_list,update_rpcs}.sql` 存在，且 `supabase/schema.sql` 快照同步。
- `getAppConfig()` 成为 current year/sem / pre-enrollment / last-update 的唯一来源；4 个 env 不再被代码读取。
- 课表三表有唯一索引；`get_schedule_list` 只返回目标学期。
- 5 个 `admin_*` RPC 只授权 `service_role`。

## 上线前手工验证（不在 CI）

1. 在能连 `SUPABASE_DB_URL` 的环境（或走代理）：
   - 备份 → 只读确认 `time_location(date,times,location)`、`offer(course_id,section,year,sem)`、`schedule(course_id,time_location_id)` 的重复数量与规范化后的冲突。
   - 用 `scripts/apply-sql.mjs` 按顺序 apply 4 个迁移。
2. curl 验证只带 `apikey: <SUPABASE_SECRET_KEY>` 能否调通 `admin_resolve_known_codes`（不行则 Plan 2 的 relay 加 `Authorization: Bearer`）。
3. 跑一次 `select * from public.app_config;` 确认单行存在。

## 下一步

Plan 2（`docs/superpowers/plans/2026-09-21-next-web-update-web-pipeline.md`）：透明转发端点 + UM 代理 + 浏览器引擎（relay-client / excel / prof-name / um-api）+ 6 任务 + runner + `/admin/update` UI。
