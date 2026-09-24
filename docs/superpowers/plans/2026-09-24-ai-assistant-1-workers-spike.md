# AI 助手 · 计划 1：Cloudflare Workers 可行性验证（spike）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用一个最小样例回答设计文档 §14 的 5 个问题：CopilotKit 1.73.3 + DeepSeek 能否在 Cloudflare Workers **Free 档**上打包、跑通流式对话和工具调用，CPU 用量是多少，思考模式怎么设，对话能否恢复。产出一份验证报告和一个明确结论（继续 / 升级 Paid / 换 Vercel AI SDK）。

**Architecture:** 在独立 worktree 分支里加一条 token 保护的 `/api/copilotkit` 路由（按请求构造 `BuiltInAgent`，1 个服务端工具 `get_sections`），和一个 `/labs/assistant-spike` 页面（CopilotKit 官方 sidebar + 1 张 shadcn 确认卡）。先在本地 workerd 里跑，再上传为**不上线的预览版本**，在 Free 档上实测 CPU。spike 代码不合并，只合并验证报告。

**Tech Stack:** Next.js 14.2 App Router、`@opennextjs/cloudflare`、wrangler 4、`@copilotkit/react-core@1.73.3`、`@copilotkit/runtime@1.73.3`、`@ai-sdk/deepseek@2`（AI SDK v6）、zod、vitest、shadcn/ui（仓库已有 `Card` / `Button` / `Input`）。

**Spec:** [docs/superpowers/specs/2026-09-24-next-web-ai-timetable-assistant-design.md](../specs/2026-09-24-next-web-ai-timetable-assistant-design.md)（§6.1、§11、§14）

## Global Constraints

- CopilotKit 固定 `1.73.3`，从 `@copilotkit/react-core/v2` 与 `@copilotkit/runtime/v2` 导入。
- 模型层只用 AI SDK v6：`@ai-sdk/deepseek@ai-v6`。**禁止**安装 `ai@7`、`@ai-sdk/openai@4`。
- 模型 `deepseek-flash`；`maxSteps: 5`；`maxOutputTokens: 400`。
- 思考模式只比较两档：`off` = `thinking: { type: "disabled" }`；`low` = `thinking: { type: "enabled" }` + `reasoningEffort: "low"`。
- `BuiltInAgent` 必须按请求构造，不能在模块顶层 `new`（workerd 全局作用域禁止生成 UUID）。
- spike 路由必须 token 保护：`ASSISTANT_SPIKE_TOKEN` 未设置 → 404；请求头 `x-spike-token` 不符 → 401。
- 服务端变量：`AI_API_KEY`、`AI_MODEL`、`ASSISTANT_SPIKE_TOKEN`。禁止 `NEXT_PUBLIC_` 前缀。
- 前端只用 `components/ui/` 已有的 shadcn 组件（`Card`、`Button`、`Input`），本计划不安装新组件。
- 全部改动在 worktree 分支 `spike/assistant-workers` 上；**不 `deploy` 到生产**，只用 `upload` 生成预览版本。
- 不改 Supabase schema，不落库。
- 新文件不引入 `any`；测试放 `tests/` 镜像目录。
- 每个代码 task 结束运行相关测试；Task 5 前运行 `npm run test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`。

---

## File Structure

spike 分支上：

- Create: `lib/assistant-spike/gate.ts` — token 校验（仅服务端）
- Create: `lib/assistant-spike/options.ts` — 请求头常量、思考模式解析与 DeepSeek providerOptions（客户端可引用）
- Create: `lib/assistant-spike/sections.ts` — 把 `getScheduleList` 结果压成一行一时段
- Create: `lib/assistant-spike/agent.ts` — 按请求构造 `BuiltInAgent` + `get_sections` 工具
- Create: `app/api/copilotkit/[[...slug]]/route.ts` — 鉴权后转交 CopilotKit handler
- Create: `app/labs/assistant-spike/page.tsx` — noindex 页面壳
- Create: `components/assistant-spike/spike-panel.tsx` — token 输入、思考档切换、Provider + Sidebar
- Create: `components/assistant-spike/confirm-card.tsx` — shadcn 确认卡
- Modify: `middleware.ts` — `publicRoutes` 加 `"/labs(.*)"`
- Modify: `wrangler.jsonc` — 日志采样改 1；必要时加 `define`
- Modify: `package.json` / `package-lock.json` — 新依赖
- Create: `tests/assistant-spike/gate.test.ts`
- Create: `tests/assistant-spike/options.test.ts`
- Create: `tests/assistant-spike/sections.test.ts`
- Create: `tests/api/copilotkit-spike.test.ts`

合并回 `feat/ai-timetable-agent` 的只有：

- Create: `docs/superpowers/verification/<执行日期>-assistant-workers-spike.md`

---

### Task 0: 提交设计文档，开 spike worktree

**Files:** 无代码改动

- [ ] **Step 1: 在主工作区提交设计文档**

在 `/Users/thomaswu/workspace/next-web`（分支 `feat/ai-timetable-agent`）：

```bash
git add docs/ai-timetable-agent.md \
  docs/superpowers/plans/2026-09-21-next-web-ai-assistant-design.md \
  docs/superpowers/specs/2026-09-24-next-web-ai-timetable-assistant-design.md \
  docs/superpowers/plans/2026-09-24-ai-assistant-1-workers-spike.md
git commit -m "docs: merged AI timetable assistant spec and spike plan"
```

Expected: 一个提交。计划 2（`2026-09-24-ai-assistant-2-timetable-foundations.md`）由另一条线维护，不在这里提交。

- [ ] **Step 2: 按 superpowers:using-git-worktrees 开 worktree**

```bash
git worktree add ../next-web-spike -b spike/assistant-workers feat/ai-timetable-agent
cd ../next-web-spike
npm ci
```

Expected: `npm ci` 成功。之后所有 task 都在 `../next-web-spike` 里做。

- [ ] **Step 3: 基线**

```bash
npm run test && npm run build 2>&1 | tee /tmp/spike-baseline-build.txt
```

Expected: 测试全过；记下 build 输出里 `/`、`/timetable` 的 First Load JS（报告要对比）。

---

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`、`package-lock.json`

- [ ] **Step 1: 安装**

```bash
npm install @copilotkit/react-core@1.73.3 @copilotkit/runtime@1.73.3 @ai-sdk/deepseek@ai-v6
```

- [ ] **Step 2: 确认没有混进 AI SDK v7**

```bash
npm ls ai @ai-sdk/provider @ai-sdk/deepseek @copilotkit/runtime
```

Expected: `ai` 只出现 `6.x`；`@ai-sdk/deepseek` 为 `2.x`。

如果出现 `ai@7.x`，或 `npm install` 因 peer 冲突失败：**停下**，把完整报错贴进报告的「安装」一节，标 BLOCKED，不要加 `--legacy-peer-deps` 硬装。

- [ ] **Step 3: 记录新增依赖体积**

```bash
du -sh node_modules/@copilotkit node_modules/@ai-sdk node_modules/ai
```

记进报告。

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "spike: add copilotkit 1.73.3 and ai-sdk deepseek (ai v6)"
```

---

### Task 2: token 校验、思考模式、时段摘要（纯函数）

**Files:**
- Create: `lib/assistant-spike/gate.ts`
- Create: `lib/assistant-spike/options.ts`
- Create: `lib/assistant-spike/sections.ts`
- Test: `tests/assistant-spike/gate.test.ts`、`tests/assistant-spike/options.test.ts`、`tests/assistant-spike/sections.test.ts`

**Interfaces:**
- Produces:
  - `SPIKE_TOKEN_HEADER = "x-spike-token"`（在 `options.ts`，客户端也要用，不能放进引用 `crypto` 的 `gate.ts`）
  - `checkSpikeToken(request: Request, expected?: string): NextResponse | null`
  - `type ThinkingMode = "off" | "low"`
  - `THINKING_HEADER = "x-spike-thinking"`
  - `parseThinkingMode(value: string | null | undefined): ThinkingMode`
  - `deepseekProviderOptions(mode: ThinkingMode)`
  - `type RawSection = { section: string; schedules: { date: string; time: string; location: string }[] }`
  - `type SectionSummary = { section: string; slots: string[] }`
  - `summarizeSections(rows: RawSection[], limit?: number): SectionSummary[]`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/assistant-spike/gate.test.ts
import { describe, expect, it } from "vitest";

import { checkSpikeToken } from "@/lib/assistant-spike/gate";
import { SPIKE_TOKEN_HEADER } from "@/lib/assistant-spike/options";

function request(token?: string) {
  const headers = new Headers();
  if (token !== undefined) headers.set(SPIKE_TOKEN_HEADER, token);
  return new Request("http://localhost/api/copilotkit", { method: "POST", headers });
}

describe("checkSpikeToken", () => {
  it("returns 404 when the spike token is not configured", () => {
    expect(checkSpikeToken(request("abc"), "")?.status).toBe(404);
    expect(checkSpikeToken(request("abc"), undefined)?.status).toBe(404);
  });

  it("returns 401 when the header is missing", () => {
    expect(checkSpikeToken(request(), "secret-token")?.status).toBe(401);
  });

  it("returns 401 when the header does not match", () => {
    expect(checkSpikeToken(request("secret-tokeN"), "secret-token")?.status).toBe(401);
    expect(checkSpikeToken(request("short"), "secret-token")?.status).toBe(401);
  });

  it("returns null when the header matches", () => {
    expect(checkSpikeToken(request("secret-token"), "secret-token")).toBeNull();
  });
});
```

```ts
// tests/assistant-spike/options.test.ts
import { describe, expect, it } from "vitest";

import { deepseekProviderOptions, parseThinkingMode } from "@/lib/assistant-spike/options";

describe("parseThinkingMode", () => {
  it("defaults to off", () => {
    expect(parseThinkingMode(null)).toBe("off");
    expect(parseThinkingMode(undefined)).toBe("off");
    expect(parseThinkingMode("high")).toBe("off");
  });

  it("accepts low", () => {
    expect(parseThinkingMode("low")).toBe("low");
  });
});

describe("deepseekProviderOptions", () => {
  it("disables thinking for off", () => {
    expect(deepseekProviderOptions("off")).toEqual({
      deepseek: { thinking: { type: "disabled" } },
    });
  });

  it("enables low-effort thinking for low", () => {
    expect(deepseekProviderOptions("low")).toEqual({
      deepseek: { thinking: { type: "enabled" }, reasoningEffort: "low" },
    });
  });
});
```

```ts
// tests/assistant-spike/sections.test.ts
import { describe, expect, it } from "vitest";

import { summarizeSections, type RawSection } from "@/lib/assistant-spike/sections";

const rows: RawSection[] = [
  {
    section: "001",
    schedules: [
      { date: "MON", time: "09:00-10:15", location: "E22-1001" },
      { date: "WED", time: "09:00-10:15", location: "E22-1001" },
    ],
  },
  { section: "002", schedules: [{ date: "TUE", time: "14:00-15:15", location: "" }] },
];

describe("summarizeSections", () => {
  it("flattens each schedule into one line", () => {
    expect(summarizeSections(rows)).toEqual([
      { section: "001", slots: ["MON 09:00-10:15 E22-1001", "WED 09:00-10:15 E22-1001"] },
      { section: "002", slots: ["TUE 14:00-15:15"] },
    ]);
  });

  it("caps the number of sections", () => {
    expect(summarizeSections(rows, 1)).toHaveLength(1);
  });

  it("returns an empty list for no sections", () => {
    expect(summarizeSections([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/assistant-spike`
Expected: FAIL，报 `Cannot find module '@/lib/assistant-spike/...'`

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/assistant-spike/gate.ts
import crypto from "crypto";

import { apiError } from "@/lib/api-response";

import { SPIKE_TOKEN_HEADER } from "./options";

export function checkSpikeToken(request: Request, expected = process.env.ASSISTANT_SPIKE_TOKEN) {
  if (!expected) return apiError("not_found", "Not found", 404);

  const provided = Buffer.from(request.headers.get(SPIKE_TOKEN_HEADER) ?? "", "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (provided.length !== wanted.length || !crypto.timingSafeEqual(provided, wanted)) {
    return apiError("unauthorized", "Invalid spike token", 401);
  }

  return null;
}
```

```ts
// lib/assistant-spike/options.ts
export type ThinkingMode = "off" | "low";

export const SPIKE_TOKEN_HEADER = "x-spike-token";
export const THINKING_HEADER = "x-spike-thinking";

export function parseThinkingMode(value: string | null | undefined): ThinkingMode {
  return value === "low" ? "low" : "off";
}

export function deepseekProviderOptions(mode: ThinkingMode) {
  if (mode === "low") {
    return { deepseek: { thinking: { type: "enabled" as const }, reasoningEffort: "low" as const } };
  }
  return { deepseek: { thinking: { type: "disabled" as const } } };
}
```

```ts
// lib/assistant-spike/sections.ts
export type RawSection = {
  section: string;
  schedules: { date: string; time: string; location: string }[];
};

export type SectionSummary = { section: string; slots: string[] };

export function summarizeSections(rows: RawSection[], limit = 8): SectionSummary[] {
  return rows.slice(0, limit).map((row) => ({
    section: row.section,
    slots: row.schedules.map((slot) => `${slot.date} ${slot.time} ${slot.location}`.trim()),
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/assistant-spike`
Expected: PASS（3 files）

- [ ] **Step 5: Commit**

```bash
git add lib/assistant-spike tests/assistant-spike
git commit -m "spike: token gate, thinking options and section summary"
```

---

### Task 3: agent 工厂与 runtime 路由

**Files:**
- Create: `lib/assistant-spike/agent.ts`
- Create: `app/api/copilotkit/[[...slug]]/route.ts`
- Test: `tests/api/copilotkit-spike.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `checkSpikeToken`、`parseThinkingMode`、`THINKING_HEADER`、`deepseekProviderOptions`、`summarizeSections`；现有 `getScheduleList(code, prof)`（`lib/database/get-schedule-list.ts`）
- Produces:
  - `createSpikeAgent(mode: ThinkingMode): BuiltInAgent`
  - 路由导出 `GET` / `POST` / `PATCH` / `DELETE`，签名 `(request: Request) => Promise<Response>`

- [ ] **Step 1: Write the failing route test**

```ts
// tests/api/copilotkit-spike.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runtimeHandler, createCopilotRuntimeHandler, CopilotRuntime } = vi.hoisted(() => {
  const runtimeHandler = vi.fn(async () => new Response("streamed", { status: 200 }));
  return {
    runtimeHandler,
    createCopilotRuntimeHandler: vi.fn(() => runtimeHandler),
    CopilotRuntime: vi.fn(),
  };
});

vi.mock("@copilotkit/runtime/v2", () => ({ CopilotRuntime, createCopilotRuntimeHandler }));
vi.mock("@/lib/assistant-spike/agent", () => ({ createSpikeAgent: vi.fn() }));

import { POST } from "@/app/api/copilotkit/[[...slug]]/route";

function request(token?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (token) headers.set("x-spike-token", token);
  return new Request("http://localhost/api/copilotkit/agent/default/run", {
    method: "POST",
    headers,
    body: "{}",
  });
}

describe("/api/copilotkit spike route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 404 when the spike is not configured", async () => {
    vi.stubEnv("ASSISTANT_SPIKE_TOKEN", "");
    const response = await POST(request("anything"));
    expect(response.status).toBe(404);
    expect(runtimeHandler).not.toHaveBeenCalled();
  });

  it("returns 401 for a wrong token without touching CopilotKit", async () => {
    vi.stubEnv("ASSISTANT_SPIKE_TOKEN", "secret-token");
    const response = await POST(request("wrong-token!"));
    expect(response.status).toBe(401);
    expect(runtimeHandler).not.toHaveBeenCalled();
  });

  it("passes authorized requests to the CopilotKit handler and builds it once", async () => {
    vi.stubEnv("ASSISTANT_SPIKE_TOKEN", "secret-token");
    const first = await POST(request("secret-token"));
    const second = await POST(request("secret-token"));
    expect(first.status).toBe(200);
    expect(await second.text()).toBe("streamed");
    expect(runtimeHandler).toHaveBeenCalledTimes(2);
    expect(createCopilotRuntimeHandler).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/copilotkit-spike.test.ts`
Expected: FAIL，报找不到 `@/app/api/copilotkit/[[...slug]]/route`

- [ ] **Step 3: Write the agent factory**

```ts
// lib/assistant-spike/agent.ts
import { createDeepSeek } from "@ai-sdk/deepseek";
import { BuiltInAgent, defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";

import getScheduleList from "@/lib/database/get-schedule-list";

import { deepseekProviderOptions, type ThinkingMode } from "./options";
import { summarizeSections } from "./sections";

const SPIKE_PROMPT = [
  "你是 What2Reg 选课助手的技术验证版本。",
  "学生问某门课的 section 或上课时间时，调用 get_sections。",
  "学生要把某个 section 加进课表时，必须调用 confirm_add_course，等学生确认后再回复。",
  "只根据工具结果回答；工具没有返回的数据就说站内没有相关数据。",
  "回复一到两句话，不要复述整张课表。",
].join("\n");

export function createSpikeAgent(mode: ThinkingMode) {
  const deepseek = createDeepSeek({ apiKey: process.env.AI_API_KEY });

  const getSections = defineTool({
    name: "get_sections",
    description: "查询某门课某位教授本学期的 section 与上课时间。",
    parameters: z.object({
      code: z.string().min(1).max(20).describe("课号，例如 ACCT1000"),
      prof: z.string().min(1).max(80).describe("教授英文名，大写，例如 CHAN TAI MAN"),
    }),
    execute: async ({ code, prof }) => summarizeSections(await getScheduleList(code, prof)),
  });

  return new BuiltInAgent({
    model: deepseek(process.env.AI_MODEL ?? "deepseek-flash"),
    prompt: SPIKE_PROMPT,
    tools: [getSections],
    maxSteps: 5,
    maxOutputTokens: 400,
    providerOptions: deepseekProviderOptions(mode),
  });
}
```

- [ ] **Step 4: Write the route**

```ts
// app/api/copilotkit/[[...slug]]/route.ts
import { CopilotRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";

import { createSpikeAgent } from "@/lib/assistant-spike/agent";
import { checkSpikeToken } from "@/lib/assistant-spike/gate";
import { parseThinkingMode, THINKING_HEADER } from "@/lib/assistant-spike/options";

export const dynamic = "force-dynamic";

type Handler = (request: Request) => Promise<Response>;

let cachedHandler: Handler | null = null;

// workerd forbids random/UUID generation at global scope, so everything is built on first request.
function getHandler(): Handler {
  if (cachedHandler) return cachedHandler;

  const runtime = new CopilotRuntime({
    agents: ({ request }: { request: Request }) => ({
      default: createSpikeAgent(parseThinkingMode(request.headers.get(THINKING_HEADER))),
    }),
    afterRequestMiddleware: async ({ threadId, runId, messages }) => {
      console.log(
        "[assistant-spike] after",
        JSON.stringify({ threadId, runId, messageCount: messages?.length ?? 0 }),
      );
    },
  });

  cachedHandler = createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit" });
  return cachedHandler;
}

async function handle(request: Request) {
  const denied = checkSpikeToken(request);
  if (denied) return denied;

  const startedAt = Date.now();
  const response = await getHandler()(request);
  console.log(
    "[assistant-spike] handled",
    JSON.stringify({
      path: new URL(request.url).pathname,
      status: response.status,
      msToHeaders: Date.now() - startedAt,
    }),
  );
  return response;
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
```

- [ ] **Step 5: Run the test and the type check**

Run: `npx vitest run tests/api/copilotkit-spike.test.ts && npx tsc --noEmit`
Expected: 测试 PASS；tsc 无错误。

如果 tsc 报 `agents` 不接受函数，或 `afterRequestMiddleware` 参数名不对：打开 `node_modules/@copilotkit/runtime/dist/v2/runtime/core/runtime.d.mts` 和 `middleware.d.mts`，按实际类型改签名。如果 `agents` 确实不支持工厂函数：改成在 `handle()` 里每次请求 `new CopilotRuntime(...)` + `createCopilotRuntimeHandler(...)`，删掉 `cachedHandler`，同时把测试最后一条断言改为 `toHaveBeenCalledTimes(2)`。在报告「偏离计划」一节写明改了什么。

- [ ] **Step 6: Commit**

```bash
git add lib/assistant-spike/agent.ts "app/api/copilotkit/[[...slug]]/route.ts" tests/api/copilotkit-spike.test.ts
git commit -m "spike: copilotkit runtime route with deepseek agent"
```

---

### Task 4: spike 页面（官方 sidebar + shadcn 确认卡）

**Files:**
- Create: `components/assistant-spike/confirm-card.tsx`
- Create: `components/assistant-spike/spike-panel.tsx`
- Create: `app/labs/assistant-spike/page.tsx`
- Modify: `middleware.ts`

**Interfaces:**
- Consumes: `SPIKE_TOKEN_HEADER`、`THINKING_HEADER`、`ThinkingMode`（Task 2，均来自 `options.ts`）
- Produces: 页面 `/labs/assistant-spike`

- [ ] **Step 1: 确认卡**

```tsx
// components/assistant-spike/confirm-card.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

type ConfirmCardProps = {
  code: string;
  section: string;
  summary: string;
  onRespond?: (confirmed: boolean) => void;
  result?: string;
};

export default function ConfirmCard({ code, section, summary, onRespond, result }: ConfirmCardProps) {
  return (
    <Card className="my-2">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          加入课表：{code} · Section {section}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{summary}</CardContent>
      <CardFooter className="gap-2">
        {onRespond ? (
          <>
            <Button size="sm" onClick={() => onRespond(true)}>
              确认加入
            </Button>
            <Button size="sm" variant="outline" onClick={() => onRespond(false)}>
              取消
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{result ?? "等待中…"}</span>
        )}
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 2: 面板**

```tsx
// components/assistant-spike/spike-panel.tsx
"use client";

import "@copilotkit/react-core/v2/styles.css";

import { ToolCallStatus } from "@copilotkit/react-core";
import {
  CopilotKitProvider,
  CopilotSidebar,
  useAgentContext,
  useHumanInTheLoop,
} from "@copilotkit/react-core/v2";
import { useEffect, useState } from "react";
import { z } from "zod";

import ConfirmCard from "@/components/assistant-spike/confirm-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SPIKE_TOKEN_HEADER, THINKING_HEADER, type ThinkingMode } from "@/lib/assistant-spike/options";

const THREAD_KEY = "assistantSpikeThreadId";

function SpikeTools() {
  useAgentContext({
    description: "学生当前课表摘要，一行一门",
    value: ["ACCT1000 001 MON 09:00-10:15", "MATH1000 002 TUE 14:00-15:15"],
  });

  useHumanInTheLoop(
    {
      name: "confirm_add_course",
      description: "把某门课的某个 section 加入学生课表前，请学生确认。",
      parameters: z.object({
        code: z.string().describe("课号"),
        section: z.string().describe("section 编号"),
        summary: z.string().describe("一句话说明上课时间"),
      }),
      render: ({ args, status, respond, result }) => (
        <ConfirmCard
          code={args.code ?? ""}
          section={args.section ?? ""}
          summary={args.summary ?? ""}
          onRespond={
            status === ToolCallStatus.Executing && respond
              ? (confirmed) => void respond({ confirmed })
              : undefined
          }
          result={result}
        />
      ),
    },
    [],
  );

  return null;
}

export default function SpikePanel() {
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState<ThinkingMode>("off");
  const [threadId, setThreadId] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(THREAD_KEY) ?? crypto.randomUUID();
    sessionStorage.setItem(THREAD_KEY, saved);
    setThreadId(saved);
  }, []);

  function resetThread() {
    const next = crypto.randomUUID();
    sessionStorage.setItem(THREAD_KEY, next);
    setThreadId(next);
  }

  return (
    <div className="mx-auto max-w-screen-md space-y-3 px-4 py-6 text-sm">
      <h1 className="text-lg font-bold">Assistant Workers spike</h1>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="spike token"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button onClick={() => setToken(draft)}>连接</Button>
      </div>
      <div className="flex items-center gap-2">
        <span>思考模式：</span>
        {(["off", "low"] as const).map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={thinking === mode ? "default" : "outline"}
            onClick={() => setThinking(mode)}
          >
            {mode}
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={resetThread}>
          新会话
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">threadId: {threadId ?? "…"}</div>

      {token && threadId ? (
        <CopilotKitProvider
          key={`${token}:${thinking}`}
          runtimeUrl="/api/copilotkit"
          headers={{ [SPIKE_TOKEN_HEADER]: token, [THINKING_HEADER]: thinking }}
        >
          <SpikeTools />
          <CopilotSidebar
            defaultOpen
            threadId={threadId}
            labels={{
              modalHeaderTitle: "选课助手（spike）",
              welcomeMessageText: "试试：「ACCT1000 CHAN TAI MAN 有哪些 section？」",
            }}
          />
        </CopilotKitProvider>
      ) : null}
    </div>
  );
}
```

如果 `ToolCallStatus` 不能从 `@copilotkit/react-core` 导入，改为从 `@copilotkit/react-core/v2` 导入；两处都没有就改成字符串比较 `status === "executing"`，并在报告里记一笔。

- [ ] **Step 3: 页面壳**

```tsx
// app/labs/assistant-spike/page.tsx
import type { Metadata } from "next";

import SpikePanel from "@/components/assistant-spike/spike-panel";

export const metadata: Metadata = {
  title: "Assistant spike",
  robots: { index: false, follow: false },
};

export default function AssistantSpikePage() {
  return <SpikePanel />;
}
```

- [ ] **Step 4: middleware 放行 `/labs`**

`middleware.ts` 的 `publicRoutes` 数组里，在 `"/terms-of-service(.*)",` 后加一行：

```ts
    "/labs(.*)",
```

页面本身不含数据；接口仍由 token 保护。

- [ ] **Step 5: 全量检查**

```bash
npm run test && npm run lint && npx tsc --noEmit && npm run build 2>&1 | tee /tmp/spike-build.txt
```

Expected: 全部通过。从 `/tmp/spike-build.txt` 记下：`/labs/assistant-spike` 的 route size 与 First Load（= CopilotKit 客户端成本）；`/` 与 `/timetable` 的 First Load 应与 Task 0 基线相同。

- [ ] **Step 6: Commit**

```bash
git add components/assistant-spike "app/labs/assistant-spike/page.tsx" middleware.ts
git commit -m "spike: labs page with copilotkit sidebar and shadcn confirm card"
```

---

### Task 5: 本地 workerd 预览（打包 + 全局作用域 + 流式）

**Files:**
- Modify（仅在出错时）: `wrangler.jsonc`
- Create: `.dev.vars`（不提交）

- [ ] **Step 1: 本地变量**

先确认 `.gitignore` 忽略 `.dev.vars`：

```bash
git check-ignore .dev.vars || echo ".dev.vars" >> .gitignore
```

写入 `.dev.vars`（值用真实的 DeepSeek key；token 随便生成一个）：

```bash
AI_API_KEY=sk-...
AI_MODEL=deepseek-flash
ASSISTANT_SPIKE_TOKEN=local-spike-token-123
```

`.env.local` 里的 Supabase / Clerk 变量也要在 `.dev.vars` 里有一份（OpenNext 预览读 `.dev.vars`）。

- [ ] **Step 2: OpenNext 构建 + 本地 workerd**

```bash
npm run preview 2>&1 | tee /tmp/spike-preview.txt
```

Expected: 构建成功，wrangler 打印本地地址。

- [ ] **Step 3: 打开页面跑一轮**

浏览器打开 `http://localhost:8787/labs/assistant-spike`，输入 token，发：

> 站内某门本学期有开课的课号 + 教授名，例如在任意有「Offered」徽章的评价页上抄一个

Expected: sidebar 逐字出现回复；工具 `get_sections` 被调用。

- [ ] **Step 4: 按报错处理已知坑**

| 现象 | 处理 |
|---|---|
| 报错含 `import.meta.url` / `createRequire` / `The argument 'path' must be a file URL` | `wrangler.jsonc` 顶层加 `"define": { "import.meta.url": "\"file:///worker.js\"" },`，重跑 Step 2 |
| 报错含 `Disallowed operation called within global scope` | 检查是否有模块顶层 `new BuiltInAgent` / `new CopilotRuntime`，都挪进 `getHandler()`；重跑 |
| 其它构建或运行错误 | 停下，把完整报错贴进报告，标 BLOCKED |

- [ ] **Step 5: 看流式是否真逐字**

DevTools → Network → 选 `/api/copilotkit/...` 请求 → 看响应是否是 `text/event-stream`，事件是否陆续到达（而不是最后一次性到达）。记进报告。

- [ ] **Step 6: 记录 Worker 体积**

```bash
ls -la .open-next/worker.js
npx wrangler deploy --dry-run --outdir /tmp/spike-dryrun 2>&1 | tee /tmp/spike-dryrun.txt
```

Expected: 输出含 `Total Upload: … KiB / gzip: … KiB`。记进报告；如果 wrangler 报体积超限，标 BLOCKED。

- [ ] **Step 7: Commit（仅当改了 wrangler.jsonc）**

```bash
git add wrangler.jsonc .gitignore
git commit -m "spike: workerd workarounds for copilotkit"
```

---

### Task 6: 上传预览版本，在 Free 档实测 CPU

**Files:**
- Modify: `wrangler.jsonc`（日志采样）

- [ ] **Step 1: 提高日志采样**

`wrangler.jsonc` 里 `observability.head_sampling_rate` 与 `observability.logs.head_sampling_rate` 都改为 `1`，并在顶层加 `"preview_urls": true,`（已有则跳过）。

```bash
git add wrangler.jsonc
git commit -m "spike: full log sampling for measurement"
```

- [ ] **Step 2: 给 Worker 设密钥**

```bash
npx wrangler secret put AI_API_KEY
npx wrangler secret put ASSISTANT_SPIKE_TOKEN
```

注意：`wrangler secret put` 会用**当前生产代码**重新部署一个带新密钥的版本。生产代码不读这两个变量，所以没有行为变化。DeepSeek 账户先只充 $5–10 做 spike。

- [ ] **Step 3: 上传（不上线）**

```bash
npm run upload 2>&1 | tee /tmp/spike-upload.txt
```

Expected: 输出 `Version ID` 和 `Version Preview URL`。生产流量不受影响。

如果没有预览 URL：去 Cloudflare Dashboard → Workers → next-web → Settings → Domains & Routes 打开 Preview URLs，再重跑。

- [ ] **Step 4: 先确认预览域名能打开站点**

浏览器打开 `<预览 URL>/`。如果 Clerk 在 `workers.dev` 域名下导致页面报错白屏，直接打开 `<预览 URL>/labs/assistant-spike` 再试；仍然不行就记进报告，标 BLOCKED（需要另配域名），跳到 Task 8。

- [ ] **Step 5: 开 tail**

另开终端：

```bash
npx wrangler tail next-web --format json \
  | jq -c 'select(.event.request.url // "" | test("/api/copilotkit")) | {url: .event.request.url, outcome, cpuTime, wallTime}' \
  | tee /tmp/spike-tail.jsonl
```

如果 tail 看不到预览版本的请求：改用 Dashboard → Workers → next-web → Observability，按版本 ID 与 URL 含 `/api/copilotkit` 过滤，读每次调用的 CPU time / wall time。

- [ ] **Step 6: 跑 3 段固定对话（思考模式 off）**

在 `<预览 URL>/labs/assistant-spike` 输入 token，思考模式选 `off`，每段对话前点「新会话」：

1. 「<课号> <教授> 有哪些 section？」（1 次工具调用）
2. 接着说「帮我加第一个 section」→ 出确认卡 → 点「确认加入」（前端 HITL）
3. 接着说「再查一下 <另一门课号> <教授>」（同一会话第 2 次工具调用）

每条消息记：tail 里的 `cpuTime`、`wallTime`、`outcome`（`ok` / `exceededCpu` / `exception`）。

- [ ] **Step 7: 同样 3 段对话，思考模式 low**

同上，只把思考模式切到 `low`。额外注意第 3 步：DeepSeek 在带工具的多轮思考中要求回传 `reasoning_content`，缺了会返回 400。记下是否出错与原文。

---

### Task 7: 对话恢复探针

**Files:** 无代码改动

- [ ] **Step 1: 刷新同一会话**

跑完一段对话后**不要**点「新会话」，直接刷新页面（`threadId` 保存在 `sessionStorage`）。记录：历史消息是否还在。

- [ ] **Step 2: 看 afterRequestMiddleware 日志**

tail / Observability 里找 `[assistant-spike] after`，记录每轮的 `threadId`、`messageCount` 是否正确累加（这决定计划 5 能不能在这里落库）。

- [ ] **Step 3: 换浏览器 / 隔 10 分钟再刷新**

用无痕窗口手动把同一个 `threadId` 写进 `sessionStorage`（DevTools → Application → Session Storage → `assistantSpikeThreadId`），或者等 10 分钟让 isolate 回收后刷新。记录历史是否丢失（预期丢失：默认内存 runner 不持久）。

---

### Task 8: 验证报告、结论、清理

**Files:**
- Create（在主工作区 `feat/ai-timetable-agent`）: `docs/superpowers/verification/<执行日期>-assistant-workers-spike.md`

- [ ] **Step 1: 写报告**

把下面整段写进报告文件，填入实测值；没测到的格子写「未测：原因」。

```markdown
# AI 助手 · Workers spike 验证报告 — <执行日期>

## 结论

<继续按设计实施 / 需要升级 Workers Paid / 改用 Vercel AI SDK / BLOCKED>，理由一句话。

## 环境

- 分支：spike/assistant-workers（不合并）
- 依赖：@copilotkit/react-core <版本>、@copilotkit/runtime <版本>、@ai-sdk/deepseek <版本>、ai <版本>
- Cloudflare 档位：Free
- 预览版本 ID：<id>

## 1. 打包

- npm install：<通过 / 报错原文>
- node_modules 增量：<du 输出>
- Worker 体积：Total Upload <x> KiB / gzip <y> KiB
- 需要的 workaround：<无 / define import.meta.url / 其它>
- `/labs/assistant-spike` First Load：<x> kB；`/` 与 `/timetable` 是否不变：<是 / 否>

## 2. CPU（Free 档 10ms）

| 思考 | 对话步骤 | cpuTime (ms) | wallTime (ms) | outcome |
|---|---|---:|---:|---|
| off | 1 查 section |  |  |  |
| off | 2 确认加课 |  |  |  |
| off | 3 第二次查询 |  |  |  |
| low | 1 查 section |  |  |  |
| low | 2 确认加课 |  |  |  |
| low | 3 第二次查询 |  |  |  |

## 3. 流式

- Content-Type：<>
- 是否逐字到达：<是 / 否，现象>

## 4. 对话恢复

- 同一 isolate 刷新：<保留 / 丢失>
- 换 isolate 后：<保留 / 丢失>
- afterRequestMiddleware：<是否触发、messageCount 是否正确>

## 5. 思考模式

- off：<是否稳定>
- low：<是否稳定；多轮工具是否 400，原文>
- 建议默认：<off / low>

## 偏离计划

- <Task 3/4 的签名调整等>
```

- [ ] **Step 2: 按规则给结论**

| 实测 | 结论 |
|---|---|
| 打包通过，所有调用 `outcome=ok`，CPU 都 < 10ms | 继续按设计实施（计划 3 起） |
| 打包通过，但有调用 `exceededCpu` 或 CPU 常 ≥ 10ms | 升级 Workers Paid（$5/月起），和用户确认后再继续 |
| 打包或运行在 Workers 上无法跑通（workaround 无效） | 改用 Vercel AI SDK + shadcn 聊天组件，更新设计文档 §5、§6、§11、§13 |
| 预览域名因 Clerk 无法使用 | BLOCKED：需要给预览版本配一个 Clerk 允许的域名，和用户讨论 |

- [ ] **Step 3: 清理**

```bash
npx wrangler secret delete ASSISTANT_SPIKE_TOKEN
```

删掉 token 后，预览 URL 上的 spike 接口返回 404。`AI_API_KEY` 保留给后续计划。

- [ ] **Step 4: 提交报告（主工作区）**

```bash
cd /Users/thomaswu/workspace/next-web
git add docs/superpowers/verification/<执行日期>-assistant-workers-spike.md
git commit -m "docs: assistant workers spike verification"
```

spike 分支保留不合并：`git worktree remove ../next-web-spike` 可在确认不再需要后执行。

- [ ] **Step 5: 回写设计文档**

在 spec §19「待定事项」里把「何时升级 Workers Paid」和「思考模式默认值」改成实测结论，单独提交：

```bash
git add docs/superpowers/specs/2026-09-24-next-web-ai-timetable-assistant-design.md
git commit -m "docs: record spike results in assistant spec"
```
