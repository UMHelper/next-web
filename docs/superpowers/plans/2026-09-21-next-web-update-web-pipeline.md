# Next Web 更新流水线 · Plan 2：网页工具

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `/admin/update` 提供网页版学期更新工具：浏览器解析 Excel、编排 UM 调用与批处理，服务端只做透明转发，写库凭据永不进入浏览器。

**Architecture:** 浏览器里的 supabase-js 把 baseUrl 指向 `/api/admin/supabase`（服务端注入 `SUPABASE_SECRET_KEY` 再转发到 PostgREST），UM 调用走 `/api/admin/um-proxy`；6 个任务 + 3 阶段流水线复用 Plan 1 的 `admin_*` RPC。

**Tech Stack:** Next.js 14 App Router、TypeScript、`@supabase/supabase-js`、`xlsx`（SheetJS）、`unidecode`、`p-limit`、vitest。

**Spec:** `docs/superpowers/specs/2026-09-21-next-web-update-pipeline-design.md`
**Depends on:** `docs/superpowers/plans/2026-09-21-next-web-update-foundation.md`（Plan 1 必须先完成：`app_config`、唯一索引、5 个 `admin_*` RPC）

## Global Constraints

- 浏览器零写库凭据；`SUPABASE_SECRET_KEY` 只在服务端。
- 所有 `/api/admin/*` 用 `requireAdmin({ platformOnly: true })`。
- Relay 只允许转发本项目的 `rest/v1/<table>` 与 `rest/v1/rpc/<fn>`；丢弃浏览器 `Authorization`/`Cookie`；body ≤ 2 MB。
- 服务端无循环、无业务计算。
- Excel 按**表头名**解析（兼容 15/16 列 add/drop + pre-enrollment header=1）。
- `prof_id` 先 `unidecode`（对齐历史数据；DB 触发器只 `btrim`）。
- 写 RPC 幂等：`admin_apply_schedule` 的 `scope ∈ {time_location, prof_course, offer, all}`。
- 跑完只刷新 `database_last_update`（`POST /api/admin/app-config`），不自动切当前学期。
- 任务失败停流水线；4xx 立即失败、5xx 指数退避重试（1s/2s/4s，最多 3 次）。
- 测试不连真库，mock fetch / supabase / requireAdmin。

---

### Task 1: 透明转发端点

**Files:**
- Create: `app/api/admin/supabase/[...path]/route.ts`
- Test: `tests/api/admin/supabase-relay.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`、`apiError`
- Produces:
  - `isAllowedRelayPath(segments: string[]): boolean`
  - `buildRelayHeaders(headers: Headers, secretKey: string): Headers`
  - `MAX_RELAY_BODY_BYTES = 2 * 1024 * 1024`
  - `GET/POST/PATCH/DELETE/HEAD /api/admin/supabase/[...path]`

- [ ] **Step 1: 写失败测试**

Create `tests/api/admin/supabase-relay.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));

import {
  MAX_RELAY_BODY_BYTES,
  buildRelayHeaders,
  isAllowedRelayPath,
  GET,
  POST,
} from "@/app/api/admin/supabase/[...path]/route";

function ctx(...path: string[]) {
  return { params: { path } };
}

describe("isAllowedRelayPath", () => {
  it("allows tables and rpc, rejects everything else", () => {
    expect(isAllowedRelayPath(["rest", "v1", "course_noporf"])).toBe(true);
    expect(isAllowedRelayPath(["rest", "v1", "rpc", "admin_resolve_known_codes"])).toBe(true);
    expect(isAllowedRelayPath(["rest", "v1", "course_noporf", "extra"])).toBe(false);
    expect(isAllowedRelayPath(["rest", "v1", "bad-table"])).toBe(false);
    expect(isAllowedRelayPath(["auth", "v1", "user"])).toBe(false);
    expect(isAllowedRelayPath(["rest", "v1", ".."])).toBe(false);
  });
});

describe("buildRelayHeaders", () => {
  it("keeps allowlisted headers and overrides credentials", () => {
    const input = new Headers({
      Authorization: "Bearer evil",
      Cookie: "evil=1",
      Prefer: "return=representation",
      "Content-Type": "application/json",
      Range: "0-9",
    });
    const out = buildRelayHeaders(input, "sb_secret_test");
    expect(out.get("apikey")).toBe("sb_secret_test");
    expect(out.get("Authorization")).toBeNull();
    expect(out.get("Cookie")).toBeNull();
    expect(out.get("Prefer")).toBe("return=representation");
    expect(out.get("Content-Type")).toBe("application/json");
    expect(out.get("Range")).toBe("0-9");
  });
});

describe("/api/admin/supabase relay", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: true } });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ New_code: "ACCT1000" }]), {
        status: 200,
        headers: { "content-type": "application/json", "content-range": "0-0/1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("rejects non-platform-admins", async () => {
    requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "forbidden", message: "x" } }, { status: 403 }),
    });
    const response = await GET(new Request("http://localhost/api/admin/supabase/rest/v1/course_noporf"), ctx("rest", "v1", "course_noporf"));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to PostgREST with the server secret and no client auth", async () => {
    const request = new Request(
      "http://localhost/api/admin/supabase/rest/v1/course_noporf?select=New_code",
      { headers: { Authorization: "Bearer evil" } },
    );
    const response = await GET(request, ctx("rest", "v1", "course_noporf"));

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/rest/v1/course_noporf?select=New_code");
    expect((init.headers as Headers).get("apikey")).toBe("sb_secret_test");
    expect((init.headers as Headers).get("Authorization")).toBeNull();
    expect(response.headers.get("content-range")).toBe("0-0/1");
  });

  it("rejects disallowed paths", async () => {
    const response = await GET(new Request("http://localhost/api/admin/supabase/auth/v1/user"), ctx("auth", "v1", "user"));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    const big = "x".repeat(MAX_RELAY_BODY_BYTES + 1);
    const request = new Request("http://localhost/api/admin/supabase/rest/v1/course_noporf", {
      method: "POST",
      body: big,
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request, ctx("rest", "v1", "course_noporf"));
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/api/admin/supabase-relay.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 relay**

Create `app/api/admin/supabase/[...path]/route.ts`:

```ts
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export const MAX_RELAY_BODY_BYTES = 2 * 1024 * 1024;

const ALLOWED_METHODS = new Set(["GET", "POST", "PATCH", "DELETE", "HEAD"]);
const TABLE_PATH = /^rest\/v1\/[A-Za-z_][A-Za-z0-9_]*$/;
const RPC_PATH = /^rest\/v1\/rpc\/[A-Za-z_][A-Za-z0-9_]*$/;
const FORWARDED_REQUEST_HEADERS = ["prefer", "content-type", "accept", "range", "content-profile"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-range"];

export function isAllowedRelayPath(segments: string[]): boolean {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  const joined = segments.join("/");
  if (joined.includes("://") || joined.includes("..") || joined.includes("\\")) return false;
  return TABLE_PATH.test(joined) || RPC_PATH.test(joined);
}

export function buildRelayHeaders(headers: Headers, secretKey: string): Headers {
  const out = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = headers.get(name);
    if (value) out.set(name, value);
  }
  out.set("apikey", secretKey);
  return out;
}

async function handle(request: Request, context: { params: { path: string[] } }) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  if (!ALLOWED_METHODS.has(request.method)) {
    return apiError("method_not_allowed", "Method not allowed", 405);
  }
  if (!isAllowedRelayPath(context.params.path)) {
    return apiError("forbidden", "Relay path not allowed", 403);
  }

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!base || !secretKey) {
    return apiError("internal_error", "Relay not configured", 500);
  }

  const search = new URL(request.url).search;
  const upstream = `${base.replace(/\/$/, "")}/${context.params.path.join("/")}${search}`;
  const init: RequestInit = {
    method: request.method,
    headers: buildRelayHeaders(request.headers, secretKey),
    cache: "no-store",
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RELAY_BODY_BYTES) {
      return apiError("payload_too_large", "Request body too large", 413);
    }
    init.body = body;
  }

  const upstreamResponse = await fetch(upstream, init);
  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamResponse.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE, handle as HEAD };
```

- [ ] **Step 4: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/api/admin/supabase-relay.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add "app/api/admin/supabase/[...path]/route.ts" tests/api/admin/supabase-relay.test.ts
git commit -m "feat(update): add transparent supabase relay endpoint"
```

---

### Task 2: UM Open Data 代理

**Files:**
- Create: `app/api/admin/um-proxy/route.ts`
- Test: `tests/api/admin/um-proxy.test.ts`

**Interfaces:**
- Produces:
  - `resolveUmResource(resource: string | null): string | null`
  - `GET /api/admin/um-proxy?resource=…&course_code=…`

- [ ] **Step 1: 写失败测试**

Create `tests/api/admin/um-proxy.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));

import { GET, resolveUmResource } from "@/app/api/admin/um-proxy/route";

describe("resolveUmResource", () => {
  it("maps allowlisted resources to UM paths", () => {
    expect(resolveUmResource("course_catalog")).toBe("course_catalog/all");
    expect(resolveUmResource("course_catalog_v1")).toBe("course_catalog/v1.0.0/all");
    expect(resolveUmResource("courses")).toBe("courses/all");
    expect(resolveUmResource("evil")).toBeNull();
    expect(resolveUmResource(null)).toBeNull();
  });
});

describe("/api/admin/um-proxy", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UM_OPEN_DATA_TOKEN = "token_test";
    requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: true } });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ _embedded: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("proxies with the server token", async () => {
    const request = new Request(
      "http://localhost/api/admin/um-proxy?resource=course_catalog&course_code=acct1000",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.data.um.edu.mo/service/academic/course_catalog/all?course_code=ACCT1000");
    expect((init.headers as Record<string, string>).Authorization).toBe("token_test");
  });

  it("rejects unknown resources", async () => {
    const request = new Request("http://localhost/api/admin/um-proxy?resource=evil&course_code=X");
    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires platform admin", async () => {
    requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "forbidden", message: "x" } }, { status: 403 }),
    });
    const request = new Request("http://localhost/api/admin/um-proxy?resource=course_catalog&course_code=X");
    const response = await GET(request);
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/api/admin/um-proxy.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 UM 代理**

Create `app/api/admin/um-proxy/route.ts`:

```ts
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const UM_BASE = "https://api.data.um.edu.mo/service/academic";
const UM_RESOURCES: Record<string, string> = {
  course_catalog: "course_catalog/all",
  course_catalog_v1: "course_catalog/v1.0.0/all",
  courses: "courses/all",
};

export function resolveUmResource(resource: string | null): string | null {
  if (!resource) return null;
  return UM_RESOURCES[resource] ?? null;
}

export async function GET(request: Request) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const token = process.env.UM_OPEN_DATA_TOKEN;
  if (!token) return apiError("internal_error", "UM token not configured", 500);

  const url = new URL(request.url);
  const path = resolveUmResource(url.searchParams.get("resource"));
  const code = (url.searchParams.get("course_code") ?? "").trim().toUpperCase();

  if (!path) return apiError("invalid_request", "Unknown UM resource", 400);
  if (!/^[A-Z]{4}\d{4}$/.test(code)) {
    return apiError("invalid_request", "Invalid course code", 400);
  }

  const upstream = `${UM_BASE}/${path}?course_code=${encodeURIComponent(code)}`;
  const response = await fetch(upstream, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  return new Response(await response.text(), {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}
```

- [ ] **Step 4: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/api/admin/um-proxy.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add app/api/admin/um-proxy/route.ts tests/api/admin/um-proxy.test.ts
git commit -m "feat(update): add UM open data proxy"
```

---

### Task 3: 依赖 + relay 客户端 + UM 客户端

**Files:**
- Modify: `package.json` / `package-lock.json`
- Create: `lib/update/relay-client.ts`
- Create: `lib/update/um-api.ts`
- Test: `tests/update/relay-client.test.ts`
- Test: `tests/update/um-api.test.ts`

**Interfaces:**
- Produces:
  - `createRelayClient(options?: { origin?: string; publishableKey?: string }): SupabaseClient`
  - `type UmCourse = { offeringUnit: string; offeringDept: string; courseTitle: string; credits: string; duration: string; mediumOfInstruction: string; offeringProgLevel: string; courseType: string; suggestedYearOfStudy: number | null; gradingSystem: string; courseDescription: string; ilo: string }`
  - `createUmFetcher(): (code: string) => Promise<UmCourse | null>`

- [ ] **Step 1: 加依赖**

Run:

```bash
npm install --save xlsx@0.18.5 unidecode@1.1.0 p-limit@3.1.0 --cache /tmp/npmcache --no-audit --no-fund
npm install --save-dev @types/unidecode@1.1.0 --cache /tmp/npmcache --no-audit --no-fund
```

- [ ] **Step 2: 写失败测试**

`p-limit@3` 是 CJS，测试环境可 `import pLimit from "p-limit"`。

Create `tests/update/relay-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRelayClient } from "@/lib/update/relay-client";

describe("createRelayClient", () => {
  it("points supabase-js at the relay base url", () => {
    const client = createRelayClient({
      origin: "http://localhost:3000",
      publishableKey: "sb_publishable_test",
    });
    expect(client.supabaseUrl).toBe("http://localhost:3000/api/admin/supabase");
  });
});
```

Create `tests/update/um-api.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUmFetcher } from "@/lib/update/um-api";

describe("createUmFetcher", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ _embedded: [{ offeringUnit: "FBA", courseTitle: "ACCOUNTING", credits: 3 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("dedupes by course code", async () => {
    const fetchCourse = createUmFetcher();
    const first = await fetchCourse("ACCT1000");
    const second = await fetchCourse("ACCT1000");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first?.courseTitle).toBe("ACCOUNTING");
  });

  it("returns null for missing embedded data", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const fetchCourse = createUmFetcher();
    await expect(fetchCourse("ACCT2000")).resolves.toBeNull();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- tests/update/relay-client.test.ts tests/update/um-api.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现客户端**

Create `lib/update/relay-client.ts`:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function createRelayClient(options: { origin?: string; publishableKey?: string } = {}): SupabaseClient {
  const origin = options.origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  const publishableKey = options.publishableKey ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

  return createClient(`${origin}/api/admin/supabase`, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

Create `lib/update/um-api.ts`:

```ts
import pLimit from "p-limit";

export type UmCourse = {
  offeringUnit: string;
  offeringDept: string;
  courseTitle: string;
  credits: string;
  duration: string;
  mediumOfInstruction: string;
  offeringProgLevel: string;
  courseType: string;
  suggestedYearOfStudy: number | null;
  gradingSystem: string;
  courseDescription: string;
  ilo: string;
};

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

export function mapUmCourse(raw: any, code: string): UmCourse {
  const year = Number(raw?.suggestedYearOfStudy);
  return {
    offeringUnit: text(raw?.offeringUnit),
    offeringDept: text(raw?.offeringDept),
    courseTitle: text(raw?.courseTitle, code),
    credits: text(raw?.credits),
    duration: text(raw?.duration, "Semester Course"),
    mediumOfInstruction: text(raw?.mediumOfInstruction),
    offeringProgLevel: text(raw?.offeringProgLevel),
    courseType: text(raw?.courseType),
    suggestedYearOfStudy: Number.isFinite(year) ? year : null,
    gradingSystem: text(raw?.gradingSystem),
    courseDescription: text(raw?.courseDescription),
    ilo: text(raw?.ilo),
  };
}

export function createUmFetcher(resource = "course_catalog") {
  const cache = new Map<string, Promise<UmCourse | null>>();
  const limit = pLimit(6);

  return (rawCode: string): Promise<UmCourse | null> => {
    const code = rawCode.trim().toUpperCase();
    const existing = cache.get(code);
    if (existing) return existing;

    const pending = limit(async () => {
      const response = await fetch(
        `/api/admin/um-proxy?resource=${encodeURIComponent(resource)}&course_code=${encodeURIComponent(code)}`,
      );
      if (!response.ok) return null;
      const body = await response.json();
      const first = body?._embedded?.[0];
      return first ? mapUmCourse(first, code) : null;
    });

    cache.set(code, pending);
    return pending;
  };
}
```

- [ ] **Step 5: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/update/relay-client.test.ts tests/update/um-api.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add package.json package-lock.json lib/update/relay-client.ts lib/update/um-api.ts tests/update/relay-client.test.ts tests/update/um-api.test.ts
git commit -m "feat(update): add relay and UM clients"
```

---

### Task 4: Excel 解析

**Files:**
- Create: `lib/update/types.ts`
- Create: `lib/update/excel.ts`
- Test: `tests/update/excel.test.ts`

**Interfaces:**
- Produces:
  - `type ScheduleMode = "add-drop" | "pre-enrollment"`
  - `type ScheduleRow = { offeringUnit: string; offeringDept: string; code: string; title: string; section: string; mediumInstruction: string; teacherRaw: string; day: string | null; times: string | null; location: string | null }`
  - `parseScheduleWorkbook(data: ArrayBuffer, options: { mode: ScheduleMode; sheetName?: string }): ScheduleRow[]`
  - `toHHMM(value: unknown): string | null`
  - `normalizeDay(value: unknown): string | null`

- [ ] **Step 1: 写失败测试**

Create `tests/update/excel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { normalizeDay, parseScheduleWorkbook, toHHMM } from "@/lib/update/excel";

function workbookFromRows(rows: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const NEW_HEADER = [
  "Offering Unit", "Offering Department", "Course Code", "Course Title", "Section",
  "Course Type", "Medium of Instruction", "Notes for Course Enrolment",
  "Teacher Information", "Lecture / Lab", "Lab Information",
  "Day", "Time From", "Time To", "Classroom", "Extra",
];

const OLD_HEADER = [
  "Offering Unit", "Offering Department", "Course Code", "Course Title", "Section",
  "Course Type", "Medium of Instruction", "Notes for Course Enrolment",
  "Teacher Information", "Lecture / Lab",
  "Day", "Time From", "Time To", "Classroom", "Extra",
];

function padded(header: string[], dataRow: unknown[]): unknown[][] {
  return [[null], [null], [null], [null], [null], header, dataRow];
}

describe("toHHMM / normalizeDay", () => {
  it("normalizes strings and numbers", () => {
    expect(toHHMM("13:00")).toBe("13:00");
    expect(toHHMM("13:00:00")).toBe("13:00");
    expect(toHHMM(0.5)).toBe("12:00");
    expect(toHHMM(null)).toBeNull();
    expect(normalizeDay("Mon")).toBe("MON");
    expect(normalizeDay("TUE")).toBe("TUE");
    expect(normalizeDay("")).toBeNull();
  });
});

describe("parseScheduleWorkbook", () => {
  it("reads the new 16-column layout by header name", () => {
    const dataRow = [
      "FAH", "DAD", "GELH1012", "Art Appreciation", "1", "GE Course", "English", null,
      "NG SAU WAH", "Lecture", null, "TUE", "13:00", "14:15", "E4-G053", null,
    ];
    const rows = parseScheduleWorkbook(workbookFromRows(padded(NEW_HEADER, dataRow)), { mode: "add-drop" });
    expect(rows).toEqual([
      {
        offeringUnit: "FAH",
        offeringDept: "DAD",
        code: "GELH1012",
        title: "Art Appreciation",
        section: "1",
        mediumInstruction: "English",
        teacherRaw: "NG SAU WAH",
        day: "TUE",
        times: "13:00-14:15",
        location: "E4-G053",
      },
    ]);
  });

  it("reads the old 15-column layout by header name", () => {
    const dataRow = [
      "FAH", "DAD", "GELH1012", "Art Appreciation", "1", "GE Course", "English", null,
      "NG SAU WAH", "Lecture", "FRI", "09:00", "10:15", "E11-101", null,
    ];
    const rows = parseScheduleWorkbook(workbookFromRows(padded(OLD_HEADER, dataRow)), { mode: "add-drop" });
    expect(rows[0]).toMatchObject({ day: "FRI", times: "09:00-10:15", location: "E11-101" });
  });

  it("reads pre-enrollment files with day/time null", () => {
    const header = ["Offering Unit", "Offering Department", "Course Code", "Course Type", "Course Title", "Credit Units"];
    const dataRow = ["FBA", "AIM", "ACCT1000", "Non-GE", "PRINCIPLES OF ACCOUNTING", 3];
    const rows = parseScheduleWorkbook(workbookFromRows([[null], header, dataRow]), { mode: "pre-enrollment" });
    expect(rows).toEqual([
      {
        offeringUnit: "FBA",
        offeringDept: "AIM",
        code: "ACCT1000",
        title: "PRINCIPLES OF ACCOUNTING",
        section: "",
        mediumInstruction: "",
        teacherRaw: "",
        day: null,
        times: null,
        location: null,
      },
    ]);
  });

  it("skips rows without a course code", () => {
    const dataRow = [null, null, null, null, null, null, null, null, null, null, "MON", "09:00", "10:00", "E1", null];
    const rows = parseScheduleWorkbook(workbookFromRows(padded(NEW_HEADER, dataRow)), { mode: "add-drop" });
    expect(rows).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/update/excel.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 types + parser**

Create `lib/update/types.ts`:

```ts
export type ScheduleMode = "add-drop" | "pre-enrollment";

export type ScheduleRow = {
  offeringUnit: string;
  offeringDept: string;
  code: string;
  title: string;
  section: string;
  mediumInstruction: string;
  teacherRaw: string;
  day: string | null;
  times: string | null;
  location: string | null;
};
```

Create `lib/update/excel.ts`:

```ts
import * as XLSX from "xlsx";

import type { ScheduleMode, ScheduleRow } from "@/lib/update/types";

const WEEKDAYS = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

const COLUMNS: Record<string, string[]> = {
  code: ["Course Code"],
  title: ["Course Title"],
  section: ["Section"],
  offeringUnit: ["Offering Unit"],
  offeringDept: ["Offering Department"],
  mediumInstruction: ["Medium of Instruction"],
  teacherRaw: ["Teacher Information"],
  day: ["Day"],
  timeFrom: ["Time From"],
  timeTo: ["Time To"],
  location: ["Classroom"],
};

const REQUIRED = ["code"];

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function normalizeDay(value: unknown): string | null {
  const text = cellText(value).toUpperCase();
  if (!text) return null;
  const three = text.slice(0, 3);
  return WEEKDAYS.has(three) ? three : null;
}

export function toHHMM(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round((value % 1) * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const match = cellText(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function findHeaderRow(rows: unknown[][]): number | null {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const row = rows[index] ?? [];
    if (row.some((cell) => cellText(cell) === "Course Code")) return index;
  }
  return null;
}

function buildColumnIndex(header: unknown[]): Record<string, number> {
  const lookup = new Map<string, number>();
  header.forEach((cell, index) => {
    const name = cellText(cell);
    if (name) lookup.set(name, index);
  });

  const columns: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    const found = aliases.map((alias) => lookup.get(alias)).find((value) => value !== undefined);
    if (found !== undefined) columns[key] = found;
  }
  return columns;
}

function cellAt(row: unknown[], columns: Record<string, number>, key: string): unknown {
  const index = columns[key];
  return index === undefined ? null : row[index];
}

export function parseScheduleWorkbook(
  data: ArrayBuffer,
  options: { mode: ScheduleMode; sheetName?: string },
): ScheduleRow[] {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = options.sheetName ?? workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  const headerRow = findHeaderRow(rows);
  if (headerRow === null) return [];

  const columns = buildColumnIndex(rows[headerRow] ?? []);
  for (const key of REQUIRED) {
    if (columns[key] === undefined) return [];
  }

  const parsed: ScheduleRow[] = [];
  for (const row of rows.slice(headerRow + 1)) {
    const code = cellText(cellAt(row, columns, "code")).toUpperCase();
    if (!code) continue;

    const timeFrom = toHHMM(cellAt(row, columns, "timeFrom"));
    const timeTo = toHHMM(cellAt(row, columns, "timeTo"));

    parsed.push({
      offeringUnit: cellText(cellAt(row, columns, "offeringUnit")),
      offeringDept: cellText(cellAt(row, columns, "offeringDept")),
      code,
      title: cellText(cellAt(row, columns, "title")),
      section: cellText(cellAt(row, columns, "section")),
      mediumInstruction: cellText(cellAt(row, columns, "mediumInstruction")),
      teacherRaw: cellText(cellAt(row, columns, "teacherRaw")),
      day: normalizeDay(cellAt(row, columns, "day")),
      times: timeFrom && timeTo ? `${timeFrom}-${timeTo}` : null,
      location: cellText(cellAt(row, columns, "location")) || null,
    });
  }

  return parsed;
}
```

- [ ] **Step 4: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/update/excel.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add lib/update/types.ts lib/update/excel.ts tests/update/excel.test.ts
git commit -m "feat(update): parse add/drop and pre-enrollment workbooks by header name"
```

---

### Task 5: 教师名归一化

**Files:**
- Create: `lib/update/prof-name.ts`
- Test: `tests/update/prof-name.test.ts`

**Interfaces:**
- Produces:
  - `normalizeProfName(raw: string): string`
  - `splitProfNames(raw: string): string[]`

- [ ] **Step 1: 写失败测试**

Create `tests/update/prof-name.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeProfName, splitProfNames } from "@/lib/update/prof-name";

describe("prof-name", () => {
  it("unidecodes and trims", () => {
    expect(normalizeProfName("  Ténèbres  ")).toBe("Tenebres");
  });

  it("splits on ' / ' and dedupes", () => {
    expect(splitProfNames("CHAN Tai Man / Wáng Wei / CHAN Tai Man")).toEqual([
      "CHAN Tai Man",
      "Wang Wei",
    ]);
  });

  it("returns an empty array for blanks", () => {
    expect(splitProfNames("   ")).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/update/prof-name.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

Create `lib/update/prof-name.ts`:

```ts
import unidecode from "unidecode";

export function normalizeProfName(raw: string): string {
  return unidecode(raw ?? "").trim();
}

export function splitProfNames(raw: string): string[] {
  const normalized = normalizeProfName(raw);
  if (!normalized) return [];
  return Array.from(new Set(normalized.split(" / ").map((name) => name.trim()).filter(Boolean)));
}
```

- [ ] **Step 4: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/update/prof-name.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add lib/update/prof-name.ts tests/update/prof-name.test.ts
git commit -m "feat(update): normalize professor names with unidecode"
```

---

### Task 6: Payload 构造器

**Files:**
- Create: `lib/update/payloads.ts`
- Test: `tests/update/payloads.test.ts`

**Interfaces:**
- Consumes: `ScheduleRow`（Task 4）、`splitProfNames`（Task 5）、`UmCourse`（Task 3）
- Produces:
  - `uniqueCourseCodes(rows: ScheduleRow[]): string[]`
  - `buildOfferedCourseInserts(rows: ScheduleRow[], missingCodes: string[], umCache: Map<string, UmCourse | null>): Record<string, unknown>[]`
  - `type ApplyRow = { code: string; prof: string; section: string; day: string; times: string; location: string }`
  - `buildApplySchedulePayload(rows: ScheduleRow[], year: number, sem: number): { year: number; sem: number; rows: ApplyRow[] }`

- [ ] **Step 1: 写失败测试**

Create `tests/update/payloads.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { ScheduleRow } from "@/lib/update/types";
import type { UmCourse } from "@/lib/update/um-api";
import {
  buildApplySchedulePayload,
  buildOfferedCourseInserts,
  uniqueCourseCodes,
} from "@/lib/update/payloads";

const row: ScheduleRow = {
  offeringUnit: "FBA",
  offeringDept: "AIM",
  code: "ACCT1000",
  title: "ACCOUNTING",
  section: "1",
  mediumInstruction: "English",
  teacherRaw: "CHAN Tai Man / Wáng Wei",
  day: "MON",
  times: "09:00-10:15",
  location: "E11-101",
};

describe("uniqueCourseCodes", () => {
  it("uppercases and dedupes", () => {
    expect(uniqueCourseCodes([row, { ...row, section: "2" }])).toEqual(["ACCT1000"]);
  });
});

describe("buildApplySchedulePayload", () => {
  it("emits one entry per professor and dedupes", () => {
    const payload = buildApplySchedulePayload([row, row], 2026, 1);

    expect(payload).toEqual({
      year: 2026,
      sem: 1,
      rows: [
        { code: "ACCT1000", prof: "CHAN Tai Man", section: "1", day: "MON", times: "09:00-10:15", location: "E11-101" },
        { code: "ACCT1000", prof: "Wang Wei", section: "1", day: "MON", times: "09:00-10:15", location: "E11-101" },
      ],
    });
  });

  it("skips rows without day/times/location", () => {
    const payload = buildApplySchedulePayload([{ ...row, day: null }], 2026, 1);
    expect(payload.rows).toEqual([]);
  });
});

describe("buildOfferedCourseInserts", () => {
  it("uses UM data when available and course-code fallbacks otherwise", () => {
    const um: UmCourse = {
      offeringUnit: "FBA",
      offeringDept: "AIM",
      courseTitle: "PRINCIPLES OF ACCOUNTING",
      credits: "3",
      duration: "Semester",
      mediumOfInstruction: "English",
      offeringProgLevel: "UG",
      courseType: "Non-GE",
      suggestedYearOfStudy: 1,
      gradingSystem: "GPA",
      courseDescription: "Desc",
      ilo: "ILO",
    };

    const withUm = buildOfferedCourseInserts([row], ["ACCT1000"], new Map([["ACCT1000", um]]));
    expect(withUm[0]).toMatchObject({
      New_code: "ACCT1000",
      Offering_Unit: "FBA",
      courseTitleEng: "PRINCIPLES OF ACCOUNTING",
      Credits: "3",
      offeringProgLevel: "UG",
      courseType: "Non-GE",
    });

    const noUm = buildOfferedCourseInserts([row], ["ACCT1000"], new Map());
    expect(noUm[0]).toMatchObject({
      New_code: "ACCT1000",
      Offering_Unit: "FBA",
      courseTitleEng: "ACCOUNTING",
      Credits: "3",
      offeringProgLevel: "UG",
      courseType: "Non-GE",
      suggestedYearOfStudy: 1,
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/update/payloads.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

Create `lib/update/payloads.ts`:

```ts
import { splitProfNames } from "@/lib/update/prof-name";
import type { ScheduleRow } from "@/lib/update/types";
import type { UmCourse } from "@/lib/update/um-api";

export function uniqueCourseCodes(rows: ScheduleRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.code.trim().toUpperCase()).filter(Boolean)));
}

function firstRowByCode(rows: ScheduleRow[]): Map<string, ScheduleRow> {
  const map = new Map<string, ScheduleRow>();
  for (const row of rows) {
    const code = row.code.trim().toUpperCase();
    if (code && !map.has(code)) map.set(code, row);
  }
  return map;
}

export function buildOfferedCourseInserts(
  rows: ScheduleRow[],
  missingCodes: string[],
  umCache: Map<string, UmCourse | null>,
): Record<string, unknown>[] {
  const byCode = firstRowByCode(rows);

  return missingCodes.map((rawCode) => {
    const code = rawCode.trim().toUpperCase();
    const row = byCode.get(code);
    const um = umCache.get(code) ?? null;
    const yearDigit = Number(code[4]);
    const suggested = um?.suggestedYearOfStudy ?? (Number.isFinite(yearDigit) ? yearDigit : null);

    return {
      New_code: code,
      Offering_Unit: um?.offeringUnit || row?.offeringUnit || "",
      Offering_Department: um?.offeringDept || row?.offeringDept || "",
      Old_code: "",
      courseTitleEng: um?.courseTitle || row?.title || "",
      courseTitleChi: "",
      Credits: um?.credits || "3",
      Course_Duration: um?.duration || "Semester Course",
      Medium_of_Instruction: um?.mediumOfInstruction || row?.mediumInstruction || "",
      offeringProgLevel: um?.offeringProgLevel || (yearDigit >= 7 ? "PG" : "UG"),
      courseType: um?.courseType || (code.startsWith("GE") ? "GE" : "Non-GE"),
      suggestedYearOfStudy: suggested,
      gradingSystem: um?.gradingSystem || "Letter Grade",
      courseDescription: um?.courseDescription || "",
      ilo: um?.ilo || "",
    };
  });
}

export type ApplyRow = {
  code: string;
  prof: string;
  section: string;
  day: string;
  times: string;
  location: string;
};

export function buildApplySchedulePayload(rows: ScheduleRow[], year: number, sem: number) {
  const seen = new Set<string>();
  const out: ApplyRow[] = [];

  for (const row of rows) {
    if (!row.day || !row.times || !row.location) continue;

    for (const prof of splitProfNames(row.teacherRaw)) {
      const entry: ApplyRow = {
        code: row.code.trim().toUpperCase(),
        prof,
        section: row.section,
        day: row.day,
        times: row.times,
        location: row.location,
      };
      const key = [entry.code, entry.prof, entry.section, entry.day, entry.times, entry.location].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
  }

  return { year, sem, rows: out };
}
```

- [ ] **Step 4: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/update/payloads.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add lib/update/payloads.ts tests/update/payloads.test.ts
git commit -m "feat(update): build RPC payloads from schedule rows"
```

---

### Task 7: 6 个任务 + runner + 流水线

**Files:**
- Create: `lib/update/task-types.ts`
- Create: `lib/update/tasks/reset-offered.ts`
- Create: `lib/update/tasks/check-courses.ts`
- Create: `lib/update/tasks/set-offered.ts`
- Create: `lib/update/tasks/apply-schedule.ts`
- Create: `lib/update/tasks/index.ts`
- Create: `lib/update/runner.ts`
- Create: `lib/update/pipeline.ts`
- Test: `tests/update/tasks.test.ts`
- Test: `tests/update/runner.test.ts`

**Interfaces:**
- Consumes: relay client（Task 3）、payload 构造器（Task 6）、`createUmFetcher`（Task 3）
- Produces:
  - `type TaskContext = { client: SupabaseClient; rows: ScheduleRow[]; mode: ScheduleMode; targetYear: number; targetSem: number; onProgress(done: number, total: number, log?: string): void; signal: AbortSignal; fetchUm?: (code: string) => Promise<UmCourse | null> }`
  - `type UpdateTask = { id: string; label: string; modes: ScheduleMode[]; run(ctx: TaskContext): Promise<string> }`
  - `UPDATE_TASKS: Record<string, UpdateTask>`
  - `runTasks(tasks: UpdateTask[], ctx: TaskContext): Promise<string[]>`
  - `PIPELINE_STAGES: Array<{ id: string; label: string; tasks: string[] }>`

- [ ] **Step 1: 写失败测试**

Create `tests/update/tasks.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduleRow } from "@/lib/update/types";
import type { TaskContext } from "@/lib/update/task-types";
import { UPDATE_TASKS } from "@/lib/update/tasks";
import { createUmFetcher } from "@/lib/update/um-api";

vi.mock("@/lib/update/um-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/update/um-api")>("@/lib/update/um-api");
  return { ...actual, createUmFetcher: vi.fn() };
});

const row: ScheduleRow = {
  offeringUnit: "FBA",
  offeringDept: "AIM",
  code: "ACCT1000",
  title: "ACCOUNTING",
  section: "1",
  mediumInstruction: "English",
  teacherRaw: "CHAN Tai Man",
  day: "MON",
  times: "09:00-10:15",
  location: "E11-101",
};

function context(client: any): TaskContext {
  return {
    client,
    rows: [row],
    mode: "add-drop",
    targetYear: 2026,
    targetSem: 1,
    onProgress: () => {},
    signal: new AbortController().signal,
  };
}

describe("update tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reset-offered calls the reset RPC", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: { course_noporf: 5 }, error: null }) };
    await UPDATE_TASKS["reset-offered"].run(context(client));
    expect(client.rpc).toHaveBeenCalledWith("admin_reset_offered");
  });

  it("check-courses resolves known codes, fetches missing UM data and upserts", async () => {
    (createUmFetcher as any).mockReturnValue(async () => null);
    const client = {
      rpc: vi.fn((name: string) => {
        if (name === "admin_resolve_known_codes") return Promise.resolve({ data: [], error: null });
        return Promise.resolve({ data: { upserted: 1, marked: 0 }, error: null });
      }),
    };

    await UPDATE_TASKS["check-courses"].run(context(client));

    expect(client.rpc).toHaveBeenCalledWith("admin_resolve_known_codes", { codes: ["ACCT1000"] });
    expect(client.rpc).toHaveBeenCalledWith("admin_upsert_offered_courses", {
      inserts: [expect.objectContaining({ New_code: "ACCT1000" })],
      offered_codes: [],
    });
  });

  it("set-offered marks unique codes", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: 1, error: null }) };
    await UPDATE_TASKS["set-offered"].run(context(client));
    expect(client.rpc).toHaveBeenCalledWith("admin_mark_offered", { codes: ["ACCT1000"] });
  });

  it("apply-schedule tasks call the scoped RPC", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: {}, error: null }) };
    await UPDATE_TASKS["add-time-location"].run(context(client));
    expect(client.rpc).toHaveBeenCalledWith("admin_apply_schedule", expect.objectContaining({ year: 2026, sem: 1 }), { scope: "time_location" });

    client.rpc.mockClear();
    await UPDATE_TASKS["add-prof-course"].run(context(client));
    expect(client.rpc).toHaveBeenCalledWith("admin_apply_schedule", expect.any(Object), { scope: "prof_course" });

    client.rpc.mockClear();
    await UPDATE_TASKS["add-offer-schedule"].run(context(client));
    expect(client.rpc).toHaveBeenCalledWith("admin_apply_schedule", expect.any(Object), { scope: "offer" });
  });

  it("throws on an RPC error", async () => {
    const client = { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "boom" } }) };
    await expect(UPDATE_TASKS["reset-offered"].run(context(client))).rejects.toThrow("boom");
  });
});
```

Create `tests/update/runner.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { runTasks } from "@/lib/update/runner";
import type { TaskContext, UpdateTask } from "@/lib/update/task-types";

const ctx = {} as TaskContext;

function task(id: string, log: string[]): UpdateTask {
  return { id, label: id, modes: ["add-drop"], run: async () => { log.push(id); return id; } };
}

function failingTask(id: string): UpdateTask {
  return { id, label: id, modes: ["add-drop"], run: async () => { throw new Error("nope"); } };
}

describe("runTasks", () => {
  it("runs sequentially and stops on failure", async () => {
    const log: string[] = [];
    const tasks = [task("a", log), failingTask("b"), task("c", log)];

    await expect(runTasks(tasks, ctx)).rejects.toThrow("nope");
    expect(log).toEqual(["a"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/update/tasks.test.ts tests/update/runner.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 task-types / tasks**

Create `lib/update/task-types.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ScheduleMode, ScheduleRow } from "@/lib/update/types";
import type { UmCourse } from "@/lib/update/um-api";

export type TaskContext = {
  client: SupabaseClient;
  rows: ScheduleRow[];
  mode: ScheduleMode;
  targetYear: number;
  targetSem: number;
  onProgress(done: number, total: number, log?: string): void;
  signal: AbortSignal;
  fetchUm?: (code: string) => Promise<UmCourse | null>;
};

export type UpdateTask = {
  id: string;
  label: string;
  modes: ScheduleMode[];
  run(ctx: TaskContext): Promise<string>;
};
```

Create `lib/update/tasks/reset-offered.ts`:

```ts
import type { UpdateTask } from "@/lib/update/task-types";

export const resetOffered: UpdateTask = {
  id: "reset-offered",
  label: "重置所有 Is_Offered = 0",
  modes: ["add-drop", "pre-enrollment"],
  async run(ctx) {
    const { data, error } = await ctx.client.rpc("admin_reset_offered");
    if (error) throw new Error(error.message);
    ctx.onProgress(1, 1, `reset: ${JSON.stringify(data)}`);
    return `reset: ${JSON.stringify(data)}`;
  },
};
```

Create `lib/update/tasks/check-courses.ts`:

```ts
import { buildOfferedCourseInserts, uniqueCourseCodes } from "@/lib/update/payloads";
import type { UpdateTask } from "@/lib/update/task-types";
import type { UmCourse } from "@/lib/update/um-api";
import { createUmFetcher } from "@/lib/update/um-api";

export const checkCourses: UpdateTask = {
  id: "check-courses",
  label: "补齐缺失课程并标记 offered",
  modes: ["add-drop", "pre-enrollment"],
  async run(ctx) {
    const codes = uniqueCourseCodes(ctx.rows);
    const fetchUm = ctx.fetchUm ?? createUmFetcher();

    const { data: known, error: knownError } = await ctx.client.rpc("admin_resolve_known_codes", { codes });
    if (knownError) throw new Error(knownError.message);

    const knownSet = new Set<string>((known ?? []) as string[]);
    const missing = codes.filter((code) => !knownSet.has(code));

    const umCache = new Map<string, UmCourse | null>();
    for (const [index, code] of missing.entries()) {
      if (ctx.signal.aborted) throw new Error("aborted");
      umCache.set(code, await fetchUm(code));
      ctx.onProgress(index + 1, missing.length, `um: ${code}`);
    }

    const inserts = buildOfferedCourseInserts(ctx.rows, missing, umCache);
    const { data, error } = await ctx.client.rpc("admin_upsert_offered_courses", {
      inserts,
      offered_codes: Array.from(knownSet),
    });
    if (error) throw new Error(error.message);

    return `inserted ${inserts.length}, marked ${knownSet.size}`;
  },
};
```

Create `lib/update/tasks/set-offered.ts`:

```ts
import { uniqueCourseCodes } from "@/lib/update/payloads";
import type { UpdateTask } from "@/lib/update/task-types";

export const setOffered: UpdateTask = {
  id: "set-offered",
  label: "批量标记 Is_Offered = 1",
  modes: ["add-drop", "pre-enrollment"],
  async run(ctx) {
    const codes = uniqueCourseCodes(ctx.rows);
    const { data, error } = await ctx.client.rpc("admin_mark_offered", { codes });
    if (error) throw new Error(error.message);
    return `marked ${data} of ${codes.length}`;
  },
};
```

Create `lib/update/tasks/apply-schedule.ts`:

```ts
import { buildApplySchedulePayload } from "@/lib/update/payloads";
import type { UpdateTask } from "@/lib/update/task-types";

function makeScheduleTask(id: string, label: string, scope: "time_location" | "prof_course" | "offer"): UpdateTask {
  return {
    id,
    label,
    modes: ["add-drop"],
    async run(ctx) {
      const payload = buildApplySchedulePayload(ctx.rows, ctx.targetYear, ctx.targetSem);
      const { data, error } = await ctx.client.rpc("admin_apply_schedule", payload, { scope });
      if (error) throw new Error(error.message);
      return `${scope}: ${JSON.stringify(data)}`;
    },
  };
}

export const addTimeLocation = makeScheduleTask("add-time-location", "补齐 time_location", "time_location");
export const addProfCourse = makeScheduleTask("add-prof-course", "补齐 prof_with_course", "prof_course");
export const addOfferSchedule = makeScheduleTask("add-offer-schedule", "写入 offer + schedule", "offer");
```

Create `lib/update/tasks/index.ts`:

```ts
import { addOfferSchedule, addProfCourse, addTimeLocation } from "@/lib/update/tasks/apply-schedule";
import { checkCourses } from "@/lib/update/tasks/check-courses";
import { resetOffered } from "@/lib/update/tasks/reset-offered";
import { setOffered } from "@/lib/update/tasks/set-offered";
import type { UpdateTask } from "@/lib/update/task-types";

export const UPDATE_TASKS: Record<string, UpdateTask> = {
  "reset-offered": resetOffered,
  "check-courses": checkCourses,
  "set-offered": setOffered,
  "add-time-location": addTimeLocation,
  "add-prof-course": addProfCourse,
  "add-offer-schedule": addOfferSchedule,
};
```

- [ ] **Step 4: 实现 runner / pipeline**

Create `lib/update/runner.ts`:

```ts
import type { TaskContext, UpdateTask } from "@/lib/update/task-types";

export async function runTasks(tasks: UpdateTask[], ctx: TaskContext): Promise<string[]> {
  const results: string[] = [];

  for (const task of tasks) {
    if (ctx.signal.aborted) throw new Error("aborted");
    ctx.onProgress(0, 1, `▶ ${task.label}`);
    const result = await task.run(ctx);
    results.push(result);
    ctx.onProgress(1, 1, `✔ ${task.label}`);
  }

  return results;
}
```

Create `lib/update/pipeline.ts`:

```ts
export const PIPELINE_STAGES = [
  { id: "reset", label: "① 重置 offered", tasks: ["reset-offered"] },
  { id: "sync-courses", label: "② 同步课程 + 标记 offered", tasks: ["check-courses", "set-offered"] },
  { id: "apply-schedule", label: "③ 落排课（time_location + prof + offer + schedule）", tasks: ["add-time-location", "add-prof-course", "add-offer-schedule"] },
] as const;
```

> 流水线阶段 2 里 `check-courses` 已经把已有 code 标成 offered，`set-offered` 对全体 code 再标一次是幂等兜底；如果想严格按 spec「合并」，可只保留 `check-courses`。两种都正确。

- [ ] **Step 5: 运行测试 + 类型检查并提交**

Run: `npm test -- tests/update/tasks.test.ts tests/update/runner.test.ts`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

```bash
git add lib/update/task-types.ts lib/update/tasks lib/update/runner.ts lib/update/pipeline.ts tests/update/tasks.test.ts tests/update/runner.test.ts
git commit -m "feat(update): add tasks, runner and pipeline"
```

---

### Task 8: `/admin/update` 页面

**Files:**
- Create: `app/admin/update/page.tsx`
- Create: `app/admin/update/update-client.tsx`
- Modify: `components/admin/admin-nav.tsx`（加 `Update` 项）
- Test: `tests/api/admin/update-page.test.ts`（page 守卫，mock admin-auth + next/navigation）
- Test: `tests/components/admin-nav.test.tsx`

**Interfaces:**
- Consumes: `getCurrentAdmin`、`createRelayClient`、`parseScheduleWorkbook`、`UPDATE_TASKS`、`PIPELINE_STAGES`、`runTasks`
- Produces: `/admin/update` 页面；导航项

- [ ] **Step 1: 写失败测试**

Create `tests/api/admin/update-page.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getCurrentAdmin, redirect, notFound } = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("@/lib/admin-auth", () => ({ getCurrentAdmin }));
vi.mock("next/navigation", () => ({ redirect, notFound }));

import UpdatePage from "@/app/admin/update/page";

describe("UpdatePage guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects anonymous users to sign in", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    await expect(UpdatePage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("404s non-platform admins", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, session: { userId: "u", isPlatformAdmin: false } });
    await expect(UpdatePage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders for platform admins", async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, session: { userId: "u", isPlatformAdmin: true } });
    const view = await UpdatePage();
    expect(view).toBeTruthy();
  });
});
```

Create `tests/components/admin-nav.test.tsx`:

```tsx
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ href, children, ...props }: Record<string, unknown>) =>
      ReactModule.createElement("a", { href, ...props }, children as React.ReactNode),
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/update" }));

import AdminNav from "@/components/admin/admin-nav";

afterEach(cleanup);

describe("AdminNav", () => {
  it("shows the Update entry for platform admins", () => {
    const view = render(<AdminNav isPlatformAdmin />);
    const link = view.getByText("Update");
    expect(link.getAttribute("href")).toBe("/admin/update");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- tests/api/admin/update-page.test.ts tests/components/admin-nav.test.tsx`
Expected: FAIL

- [ ] **Step 3: 实现 page guard + nav**

Create `app/admin/update/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/admin-auth";
import UpdateClient from "@/app/admin/update/update-client";

export const dynamic = "force-dynamic";

export default async function UpdatePage() {
  const admin = await getCurrentAdmin();
  if (!admin.ok) {
    if (admin.response.status === 401) redirect("/sign-in");
    notFound();
  }
  if (!admin.session.isPlatformAdmin) notFound();

  return <UpdateClient />;
}
```

Modify `components/admin/admin-nav.tsx`：在 `NAV_ITEMS` 里 `/admin/courses` 之后插入：

```ts
  { href: "/admin/update", label: "Update", platformOnly: true },
```

- [ ] **Step 4: 实现 client**

Create `app/admin/update/update-client.tsx`:

```tsx
"use client";

import { useMemo, useRef, useState } from "react";

import { parseScheduleWorkbook } from "@/lib/update/excel";
import { PIPELINE_STAGES } from "@/lib/update/pipeline";
import { createRelayClient } from "@/lib/update/relay-client";
import { runTasks } from "@/lib/update/runner";
import { UPDATE_TASKS } from "@/lib/update/tasks";
import type { TaskContext, UpdateTask } from "@/lib/update/task-types";
import type { ScheduleMode, ScheduleRow } from "@/lib/update/types";

const TASK_IDS = Object.keys(UPDATE_TASKS);

export default function UpdateClient() {
  const [mode, setMode] = useState<ScheduleMode>("add-drop");
  const [targetYear, setTargetYear] = useState(2026);
  const [targetSem, setTargetSem] = useState(1);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [selected, setSelected] = useState<string[]>(PIPELINE_STAGES.flatMap((stage) => stage.tasks));
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const availableTasks = useMemo(
    () => TASK_IDS.map((id) => UPDATE_TASKS[id]).filter((task) => task.modes.includes(mode)),
    [mode],
  );

  async function handleFile(file: File) {
    const data = await file.arrayBuffer();
    const parsed = parseScheduleWorkbook(data, { mode });
    setRows(parsed);
    setLog([`parsed ${parsed.length} rows (${mode})`]);
  }

  async function run() {
    setRunning(true);
    setLog((current) => [...current, `target ${targetYear}/${targetSem}`]);
    abortRef.current = new AbortController();

    const ctx: TaskContext = {
      client: createRelayClient(),
      rows,
      mode,
      targetYear,
      targetSem,
      signal: abortRef.current.signal,
      onProgress: (d, t, message) => {
        setDone(d);
        setTotal(t);
        if (message) setLog((current) => [...current.slice(-99), message]);
      },
    };

    const tasks = selected
      .map((id) => UPDATE_TASKS[id])
      .filter((task): task is UpdateTask => Boolean(task) && task.modes.includes(mode));

    try {
      await runTasks(tasks, ctx);
      setLog((current) => [...current, "✔ all tasks complete"]);
    } catch (error) {
      setLog((current) => [...current, `✘ ${error instanceof Error ? error.message : String(error)}`]);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="mb-2 font-semibold">Step 1 · 上传学期时间表</div>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            表类型
            <select value={mode} onChange={(event) => setMode(event.target.value as ScheduleMode)}>
              <option value="add-drop">Add/Drop</option>
              <option value="pre-enrollment">Pre-enrollment</option>
            </select>
          </label>
          <label className="flex items-center gap-1">
            年份 <input type="number" className="w-20 rounded border px-1" value={targetYear} onChange={(event) => setTargetYear(Number(event.target.value))} />
          </label>
          <label className="flex items-center gap-1">
            学期 <input type="number" className="w-16 rounded border px-1" value={targetSem} onChange={(event) => setTargetSem(Number(event.target.value))} />
          </label>
          <span>已解析 {rows.length} 行</span>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 font-semibold">Step 2 · 选择任务</div>
        <div className="flex flex-wrap gap-3 text-sm">
          {availableTasks.map((task) => (
            <label key={task.id} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={selected.includes(task.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked ? [...current, task.id] : current.filter((id) => id !== task.id),
                  )
                }
              />
              {task.id}
            </label>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button className="rounded bg-blue-600 px-3 py-1 text-white disabled:opacity-50" disabled={running || rows.length === 0} onClick={() => void run()}>
            开始执行
          </button>
          <button className="rounded border px-3 py-1 disabled:opacity-50" disabled={!running} onClick={() => abortRef.current?.abort()}>
            取消
          </button>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 font-semibold">Step 3 · 进度 {total > 0 ? `${done}/${total}` : ""}</div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs">{log.join("\n")}</pre>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 运行测试 + 类型检查 + 全量回归并提交**

Run: `npm test -- tests/api/admin/update-page.test.ts tests/components/admin-nav.test.tsx`
Expected: PASS

Run: `npx tsc --noEmit`
Expected: 无新增错误

Run: `npm test`
Expected: 全绿

```bash
git add app/admin/update components/admin/admin-nav.tsx tests/api/admin/update-page.test.ts tests/components/admin-nav.test.tsx
git commit -m "feat(update): add /admin/update page"
```

---

## Plan 2 完成标准

- `npm test` 全绿，`npx tsc --noEmit` 无新增错误。
- `/admin/update` 只对 platform admin 可见。
- 上传 26-27-1.xlsx 解析出正确 `Day/Time/Room`（新 16 列不再错位）。
- 流水线跑完终态正确，重复跑幂等（第二次 inserted=0）。
- 浏览器 Network 面板没有任何 Supabase host 请求，只有 `/api/admin/supabase/*` 与 `/api/admin/um-proxy`。

## 手工验收清单（不进 CI）

1. 本地 apply Plan 1 的迁移 + `supabase/seed.sql`。
2. `npm run dev` → platform admin 登录 → `/admin/update`。
3. 上传 `umeh-update/data/26-27-1.xlsx`（Add/Drop）→ 检查解析行数（~2549）与前几行 `Day/Times/Location`。
4. 跑单项 `reset-offered` → 再跑 `check-courses` → `add-time-location` → `add-prof-course` → `add-offer-schedule`，每步用 SQL 校验计数。
5. 跑流水线两次，第二次各表 inserted 应为 0。
6. 改 `app_config` 的 `current_year/sem` 后，`/timetable`、`/search`、sitemap 反映新值。

## 已知风险 / 遗留

- relay 只发 `apikey`（`sb_secret_*` 是 opaque token）；若 PostgREST 401，需回退 `Authorization: Bearer`（改 `buildRelayHeaders`）。
- 「发布为当前学期」按钮（`POST /api/admin/app-config` 的 UI）本期未做，用现有的 `/api` 端点手动触发即可。
