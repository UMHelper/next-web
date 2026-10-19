# AI 助手 V1 · Cloudflare Workers 可行性验证（spike）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 回答 V1 设计文档 §13 的 6 个问题：重新核对后的 CopilotKit + DeepSeek 能否在 Next 15.5 + OpenNext + Cloudflare Workers **Free 档**上打包、流式、调工具，CPU 多少，多轮上文是否跨 isolate 保持，思考模式怎么设，`/timetable` 当前基线多大。产出验证报告和一个结论（继续 / 升级 Paid / 换 Vercel AI SDK）。

**Architecture:** 在 `.worktrees/assistant-spike` 的 spike 分支里加一条 token 保护的 `/api/copilotkit` 路由（按请求构造 `BuiltInAgent`，1 个复用 `lib/mcp/data/getCourseSections` 的服务端工具），和一个 `/labs/assistant-spike` 页面（CopilotKit 官方 sidebar + 前端只读工具 `check_plan_conflicts` + 固定课表上下文）。先本地 workerd，再上传**不上线的预览版本**在 Free 档实测。spike 代码不合并，只合并验证报告。

**Tech Stack:** Next.js 15.5 App Router、Clerk 7、`@opennextjs/cloudflare` 1.16、wrangler 4、CopilotKit（版本在 Task 1 核对）、`@ai-sdk/deepseek`（与 CopilotKit 依赖的 AI SDK 大版本对齐）、zod 3、vitest、shadcn/ui（已有 `Button` / `Input`）。

**Spec:** [docs/superpowers/specs/2026-10-17-next-web-ai-timetable-assistant-v1-design.md](../specs/2026-10-17-next-web-ai-timetable-assistant-v1-design.md)（§6、§9、§10、§12、§13）

## Global Constraints

- 只读：spike 里没有任何写课表、写数据库的代码。
- CopilotKit 从 `@copilotkit/react-core/v2` 与 `@copilotkit/runtime/v2` 导入；版本以 Task 1 核对结果为准，装完后 `ai` 只能有一个大版本。
- 模型默认 `deepseek-flash`（Task 1 核对后可改，由 `AI_MODEL` 控制）；`maxSteps: 5`；`maxOutputTokens: 400`。
- 思考模式只比较两档：`off` = `thinking: { type: "disabled" }`；`low` = `thinking: { type: "enabled" }` + `reasoningEffort: "low"`。
- `BuiltInAgent` / `CopilotRuntime` 必须在请求内构造，不能在模块顶层 `new`（workerd 全局作用域禁止生成随机数 / UUID）。
- spike 路由必须 token 保护：`ASSISTANT_SPIKE_TOKEN` 未设置 → 404；请求头 `x-spike-token` 不符 → 401。
- 服务端变量：`AI_API_KEY`、`AI_MODEL`、`ASSISTANT_SPIKE_TOKEN`。禁止 `NEXT_PUBLIC_` 前缀。
- 服务端工具只经 `lib/mcp/data/*`，不直接查 Supabase。
- 不改 `middleware.ts`（`clerkMiddleware()` 默认不拦页面）；不改 Supabase schema；不落库。
- 不 `deploy` 到生产，只用 `npm run upload` 生成预览版本。
- 新文件不引入 `any`；测试放 `tests/` 镜像目录。
- Task 5 前运行 `npm run test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`。

---

## File Structure

spike 分支 `spike/assistant-v1-workers` 上：

- Create: `lib/assistant-spike/options.ts` — 请求头常量、思考模式解析、DeepSeek providerOptions（客户端可引用）
- Create: `lib/assistant-spike/gate.ts` — token 校验（仅服务端）
- Create: `lib/assistant-spike/check-plan-conflicts.ts` — 纯函数：候选 section 与课表的冲突
- Create: `lib/assistant-spike/agent.ts` — 按请求构造 `BuiltInAgent` + `get_course_sections` 工具
- Create: `app/api/copilotkit/[[...slug]]/route.ts` — token 校验后转交 CopilotKit handler
- Create: `app/labs/assistant-spike/page.tsx` — noindex 页面壳
- Create: `components/assistant-spike/spike-panel.tsx` — token 输入、思考档切换、Provider + Sidebar + 前端工具 + 固定上下文
- Modify: `wrangler.jsonc` — 日志采样改 1；必要时加 `define`
- Modify: `.gitignore` — 忽略 `.dev.vars`
- Modify: `package.json` / `package-lock.json` — 新依赖
- Create: `tests/assistant-spike/gate.test.ts`、`tests/assistant-spike/options.test.ts`、`tests/assistant-spike/check-plan-conflicts.test.ts`、`tests/api/copilotkit-spike.test.ts`

合并回 `feat/ai-timetable-agent` 的只有：

- Create: `docs/superpowers/verification/<执行日期>-assistant-v1-workers-spike.md`
- Modify: V1 spec 的待定结论（Task 8）

---

### Task 0: 开 spike worktree，量基线

**Files:** 无代码改动

- [ ] **Step 1: 按 superpowers:using-git-worktrees 开 worktree**

在 `/Users/thomaswu/workspace/next-web`（分支 `feat/ai-timetable-agent`，工作区干净）：

```bash
git worktree add .worktrees/assistant-spike -b spike/assistant-v1-workers feat/ai-timetable-agent
cd .worktrees/assistant-spike
cp ../../.env.local .env.local
npm ci
```

Expected: `npm ci` 成功。之后所有 task 都在 `.worktrees/assistant-spike` 里做（`.worktrees` 已被 `.gitignore` 忽略）。

- [ ] **Step 2: 基线测试与构建（§13 第 6 问）**

```bash
npm run test && npm run build 2>&1 | tee /tmp/spike-baseline-build.txt
```

Expected: 测试全过；从输出记下 `/`、`/timetable`、`/course/[code]` 的 Size 与 First Load JS，写进报告「基线」一节。

---

### Task 1: 核对版本并安装依赖

**Files:**
- Modify: `package.json`、`package-lock.json`

- [ ] **Step 1: 查 CopilotKit 当前版本与它依赖的 AI SDK**

```bash
npm view @copilotkit/runtime version
npm view @copilotkit/react-core version
npm view @copilotkit/runtime@latest dependencies --json | jq '{ai: .ai, provider: .["@ai-sdk/provider"]}'
npm view @ai-sdk/deepseek dist-tags --json
```

按结果定版本，全部写进报告「环境」一节：

| 情况 | 处理 |
|---|---|
| `@copilotkit/runtime` latest 仍是 1.x，依赖 `ai` 6.x | `COPILOTKIT=<latest>`，`DEEPSEEK_TAG=ai-v6` |
| latest 是 1.x，依赖 `ai` 7.x | `COPILOTKIT=<latest>`，`DEEPSEEK_TAG=latest` |
| latest 已是 2.x 或以上 | 停下，标 BLOCKED，问用户是否改用 2.x（导入路径与 API 需重新确认） |

- [ ] **Step 2: 核对 DeepSeek 文档**

打开 DeepSeek 官方 API 文档（`https://api-docs.deepseek.com/`）的模型与价格页、思考模式页，记下：当前 Flash 模型的 API 名、`thinking` 与 `reasoning_effort` 参数名和取值、带工具多轮是否要求回传 `reasoning_content`、高峰 / 低谷价格。若模型名不是 `deepseek-flash`，后续 `.dev.vars` 与 secret 里的 `AI_MODEL` 用新名字；若思考参数名变了，Task 2 的 `deepseekProviderOptions` 与测试按新名字写，并在报告「偏离计划」记一笔。

- [ ] **Step 3: 安装**

```bash
npm install @copilotkit/react-core@$COPILOTKIT @copilotkit/runtime@$COPILOTKIT @ai-sdk/deepseek@$DEEPSEEK_TAG
```

如果 `npm install` 因 peer 冲突失败：**停下**，把完整报错贴进报告「打包」一节，标 BLOCKED，不要加 `--legacy-peer-deps`。

- [ ] **Step 4: 确认只有一个 AI SDK 大版本、v2 入口存在**

```bash
npm ls ai @ai-sdk/provider @ai-sdk/deepseek @copilotkit/runtime @copilotkit/react-core
node -e "for (const p of ['@copilotkit/runtime','@copilotkit/react-core']) console.log(p, Object.keys(require('./node_modules/'+p+'/package.json').exports).filter(k=>k.includes('v2')))"
```

Expected: `ai` 只出现一个大版本；两个包的 exports 都含 `./v2`。否则停下标 BLOCKED。

- [ ] **Step 5: 记录依赖体积并提交**

```bash
du -sh node_modules/@copilotkit node_modules/@ai-sdk node_modules/ai
git add package.json package-lock.json
git commit -m "spike: add copilotkit and ai-sdk deepseek"
```

---

### Task 2: token 校验、思考模式、冲突检查（纯函数）

**Files:**
- Create: `lib/assistant-spike/options.ts`
- Create: `lib/assistant-spike/gate.ts`
- Create: `lib/assistant-spike/check-plan-conflicts.ts`
- Test: `tests/assistant-spike/options.test.ts`、`tests/assistant-spike/gate.test.ts`、`tests/assistant-spike/check-plan-conflicts.test.ts`

**Interfaces:**
- Consumes: 现有 `detectScheduleConflicts`（`lib/timetable/conflicts.ts`）、`normalizePlanSection`、`normalizeSection`、`PlanSection`（`lib/timetable/schema.ts`）
- Produces:
  - `SPIKE_TOKEN_HEADER = "x-spike-token"`、`THINKING_HEADER = "x-spike-thinking"`（`options.ts`，客户端也用）
  - `type ThinkingMode = "off" | "low"`
  - `parseThinkingMode(value: string | null | undefined): ThinkingMode`
  - `deepseekProviderOptions(mode: ThinkingMode)`
  - `checkSpikeToken(request: Request, expected?: string): Response | null`
  - `type CatalogSection = { section: string; schedules: PlanSection["schedules"] }`
  - `type PlanConflictResult = { found: false } | { found: true; conflicts: Array<{ with: string; day: string }> }`
  - `checkPlanConflicts(plan: PlanSection[], input: { code: string; instructor: string; section: string }, sections: CatalogSection[]): PlanConflictResult`

- [ ] **Step 1: Write the failing tests**

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
// tests/assistant-spike/check-plan-conflicts.test.ts
import { describe, expect, it } from "vitest";

import {
  checkPlanConflicts,
  type CatalogSection,
} from "@/lib/assistant-spike/check-plan-conflicts";
import { normalizePlanSection } from "@/lib/timetable/schema";

const plan = [
  normalizePlanSection({
    code: "EDUC1001",
    prof: "CHAN TAI MAN",
    section: "001",
    schedules: [{ date: "MON", time: "09:00-10:15", location: "E22-1001" }],
  }),
  normalizePlanSection({
    code: "MATH1000",
    prof: "WONG",
    section: "002",
    schedules: [{ date: "TUE", time: "14:00-15:15", location: "" }],
  }),
];

const sections: CatalogSection[] = [
  { section: "001", schedules: [{ date: "MON", time: "10:00-11:15", location: "" }] },
  { section: "002", schedules: [{ date: "MON", time: "10:15-11:30", location: "" }] },
  {
    section: "003",
    schedules: [
      { date: "MON", time: "09:00-09:30", location: "" },
      { date: "MON", time: "09:45-10:00", location: "" },
    ],
  },
];

const input = (section: string) => ({ code: "econ1001", instructor: "LEE", section });

describe("checkPlanConflicts", () => {
  it("reports the plan section that overlaps", () => {
    expect(checkPlanConflicts(plan, input("001"), sections)).toEqual({
      found: true,
      conflicts: [{ with: "EDUC1001-001", day: "MON" }],
    });
  });

  it("does not count end-to-start as a conflict", () => {
    expect(checkPlanConflicts(plan, input("002"), sections)).toEqual({
      found: true,
      conflicts: [],
    });
  });

  it("reports each clashing section once per day", () => {
    expect(checkPlanConflicts(plan, input("003"), sections)).toEqual({
      found: true,
      conflicts: [{ with: "EDUC1001-001", day: "MON" }],
    });
  });

  it("ignores other sections of the same course already in the plan", () => {
    const withSameCourse = [
      ...plan,
      normalizePlanSection({
        code: "ECON1001",
        prof: "LEE",
        section: "009",
        schedules: [{ date: "MON", time: "10:00-11:00", location: "" }],
      }),
    ];
    expect(checkPlanConflicts(withSameCourse, input("002"), sections)).toEqual({
      found: true,
      conflicts: [],
    });
  });

  it("returns found false when the section does not exist", () => {
    expect(checkPlanConflicts(plan, input("099"), sections)).toEqual({ found: false });
  });

  it("matches the section id case- and space-insensitively", () => {
    expect(checkPlanConflicts(plan, input(" 001 "), sections)).toMatchObject({ found: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/assistant-spike`
Expected: FAIL，报 `Cannot find module '@/lib/assistant-spike/...'`

- [ ] **Step 3: Write minimal implementation**

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
// lib/assistant-spike/check-plan-conflicts.ts
import { detectScheduleConflicts } from "@/lib/timetable/conflicts";
import { normalizePlanSection, normalizeSection, type PlanSection } from "@/lib/timetable/schema";

export type CatalogSection = { section: string; schedules: PlanSection["schedules"] };

export type PlanConflictResult =
  | { found: false }
  | { found: true; conflicts: Array<{ with: string; day: string }> };

export function checkPlanConflicts(
  plan: PlanSection[],
  input: { code: string; instructor: string; section: string },
  sections: CatalogSection[],
): PlanConflictResult {
  const wanted = normalizeSection(input.section);
  const match = sections.find((entry) => normalizeSection(entry.section) === wanted);
  if (!match) return { found: false };

  const candidate = normalizePlanSection({
    code: input.code,
    prof: input.instructor,
    section: match.section,
    schedules: match.schedules,
  });
  const others = plan.filter((item) => item.courseCode !== candidate.courseCode);

  const seen = new Set<string>();
  const conflicts: Array<{ with: string; day: string }> = [];
  for (const conflict of detectScheduleConflicts([...others, candidate])) {
    if (conflict.a.key !== candidate.key && conflict.b.key !== candidate.key) continue;
    const other = conflict.a.key === candidate.key ? conflict.b : conflict.a;
    const label = `${other.courseCode}-${other.section}`;
    const id = `${label}|${conflict.date}`;
    if (seen.has(id)) continue;
    seen.add(id);
    conflicts.push({ with: label, day: conflict.date });
  }

  return { found: true, conflicts };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/assistant-spike`
Expected: PASS（3 files）

- [ ] **Step 5: Commit**

```bash
git add lib/assistant-spike tests/assistant-spike
git commit -m "spike: token gate, thinking options and plan conflict check"
```

---

### Task 3: agent 工厂与 runtime 路由

**Files:**
- Create: `lib/assistant-spike/agent.ts`
- Create: `app/api/copilotkit/[[...slug]]/route.ts`
- Test: `tests/api/copilotkit-spike.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `checkSpikeToken`、`parseThinkingMode`、`THINKING_HEADER`、`deepseekProviderOptions`、`ThinkingMode`；现有 `getCourseSections(input: GetCourseSectionsInput)`（`lib/mcp/data/get-course-sections.ts`）与 `getCourseSectionsInputSchema`（`lib/mcp/schemas.ts`）
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

import { getCourseSections } from "@/lib/mcp/data/get-course-sections";
import { getCourseSectionsInputSchema } from "@/lib/mcp/schemas";

import { deepseekProviderOptions, type ThinkingMode } from "./options";

const SPIKE_PROMPT = [
  "你是 What2Reg 选课助手的技术验证版本，只读，不能修改课表。",
  "学生问某门课某位教授的 section 或上课时间时，调用 get_course_sections。",
  "学生问某个 section 会不会和自己的课表冲突时，调用 check_plan_conflicts。",
  "学生要求加课时，说明请用左侧规划栏添加。",
  "只根据工具结果回答；工具没有返回的数据就说站内没有相关数据。",
  "回复一到两句话，保留工具返回的 https://umeh.top 链接。",
].join("\n");

export function createSpikeAgent(mode: ThinkingMode) {
  const deepseek = createDeepSeek({ apiKey: process.env.AI_API_KEY });

  const getSections = defineTool({
    name: "get_course_sections",
    description: "查询某门课某位教授本学期的 section 与上课时间。",
    parameters: z.object({
      code: z.string().min(1).max(20).describe("课号，例如 ACCT1000"),
      instructor: z.string().min(1).max(80).describe("教授英文名，例如 CHAN TAI MAN"),
    }),
    execute: async (args) => getCourseSections(getCourseSectionsInputSchema.parse(args)),
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

如果 tsc 报 `defineTool` / `BuiltInAgent` 的选项名不对、`agents` 不接受函数，或 `afterRequestMiddleware` 参数名不对：打开 `node_modules/@copilotkit/runtime/dist/v2/` 下对应的 `.d.mts`，按实际类型改签名。如果 `agents` 不支持工厂函数：改成在 `handle()` 里每次请求 `new CopilotRuntime(...)` + `createCopilotRuntimeHandler(...)`，删掉 `cachedHandler`，同时把测试最后一条断言改为 `expect(createCopilotRuntimeHandler).toHaveBeenCalledTimes(2)`。在报告「偏离计划」写明改了什么。

- [ ] **Step 6: Commit**

```bash
git add lib/assistant-spike/agent.ts "app/api/copilotkit/[[...slug]]/route.ts" tests/api/copilotkit-spike.test.ts
git commit -m "spike: copilotkit runtime route with deepseek agent"
```

---

### Task 4: spike 页面（官方 sidebar + 前端只读工具 + 固定课表上下文）

**Files:**
- Create: `components/assistant-spike/spike-panel.tsx`
- Create: `app/labs/assistant-spike/page.tsx`

**Interfaces:**
- Consumes: Task 2 的 `SPIKE_TOKEN_HEADER`、`THINKING_HEADER`、`ThinkingMode`、`checkPlanConflicts`；现有 `getSections(code, prof)`（`lib/timetable/catalog-client.ts`，需要登录）、`normalizePlanSection`
- Produces: 页面 `/labs/assistant-spike`

- [ ] **Step 1: 面板**

```tsx
// components/assistant-spike/spike-panel.tsx
"use client";

import "@copilotkit/react-core/v2/styles.css";

import {
  CopilotKitProvider,
  CopilotSidebar,
  useAgentContext,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkPlanConflicts } from "@/lib/assistant-spike/check-plan-conflicts";
import { SPIKE_TOKEN_HEADER, THINKING_HEADER, type ThinkingMode } from "@/lib/assistant-spike/options";
import { getSections } from "@/lib/timetable/catalog-client";
import { normalizePlanSection } from "@/lib/timetable/schema";

const FIXED_PLAN = [
  normalizePlanSection({
    code: "EDUC1001",
    prof: "CHAN TAI MAN",
    section: "001",
    schedules: [{ date: "MON", time: "09:00-10:15", location: "E22-1001" }],
  }),
  normalizePlanSection({
    code: "MATH1000",
    prof: "WONG",
    section: "002",
    schedules: [{ date: "TUE", time: "14:00-15:15", location: "" }],
  }),
];

const PLAN_SUMMARY = FIXED_PLAN.map(
  (item) =>
    `${item.courseCode}-${item.section} (${item.prof}) ${item.schedules
      .map((slot) => `${slot.date} ${slot.time}`)
      .join(", ")}`,
);

function SpikeTools() {
  useAgentContext({
    description: "学生当前课表方案，一行一个 section",
    value: PLAN_SUMMARY,
  });

  useFrontendTool(
    {
      name: "check_plan_conflicts",
      description: "检查某门课某位教授的某个 section 是否与学生当前课表时间冲突。只读。",
      parameters: z.object({
        code: z.string().describe("课号，例如 ECON1001"),
        instructor: z.string().describe("教授英文名"),
        section: z.string().describe("section 编号，例如 001"),
      }),
      handler: async ({ code, instructor, section }) => {
        try {
          const { sections } = await getSections(code, instructor);
          return checkPlanConflicts(FIXED_PLAN, { code, instructor, section }, sections);
        } catch (error) {
          return { found: false, error: error instanceof Error ? error.message : "request_failed" };
        }
      },
    },
    [],
  );

  return null;
}

export default function SpikePanel() {
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState<ThinkingMode>("off");
  const [session, setSession] = useState(0);

  return (
    <div className="mx-auto max-w-screen-md space-y-3 px-4 py-6 text-sm">
      <h1 className="text-lg font-bold">Assistant V1 Workers spike</h1>
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
        <Button size="sm" variant="outline" onClick={() => setSession((value) => value + 1)}>
          新会话
        </Button>
      </div>
      <pre className="text-xs text-muted-foreground">{PLAN_SUMMARY.join("\n")}</pre>

      {token ? (
        <CopilotKitProvider
          key={`${token}:${thinking}:${session}`}
          runtimeUrl="/api/copilotkit"
          headers={{ [SPIKE_TOKEN_HEADER]: token, [THINKING_HEADER]: thinking }}
        >
          <SpikeTools />
          <CopilotSidebar
            defaultOpen
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

如果 `useFrontendTool` 不存在或参数名不同（例如 `handler` 叫 `execute`）：查 `node_modules/@copilotkit/react-core/dist/v2/` 下的 `.d.mts`，按实际导出改；若只有 `useCopilotAction`，用它注册同名工具、同样的参数与处理函数。`useAgentContext` 同理。改动记进报告「偏离计划」。

- [ ] **Step 2: 页面壳**

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

`middleware.ts` 是无参数的 `clerkMiddleware()`，页面默认公开，不用改。页面本身不含数据，接口由 token 保护。

- [ ] **Step 3: 全量检查**

```bash
npm run test && npm run lint && npx tsc --noEmit && npm run build 2>&1 | tee /tmp/spike-build.txt
```

Expected: 全部通过。从 `/tmp/spike-build.txt` 记下：`/labs/assistant-spike` 的 Size 与 First Load（= CopilotKit 客户端成本）；`/`、`/timetable`、`/course/[code]` 的 First Load 应与 Task 0 基线相同。

- [ ] **Step 4: Commit**

```bash
git add components/assistant-spike "app/labs/assistant-spike/page.tsx"
git commit -m "spike: labs page with copilotkit sidebar and read-only conflict tool"
```

---

### Task 5: 本地 workerd 预览（打包 + 全局作用域 + 流式）

**Files:**
- Modify: `.gitignore`
- Modify（仅在出错时）: `wrangler.jsonc`
- Create: `.dev.vars`（不提交）

- [ ] **Step 1: 本地变量**

`.dev.vars` 目前没被忽略，先加：

```bash
git check-ignore .dev.vars || echo ".dev.vars" >> .gitignore
```

写入 `.dev.vars`：把 `.env.local` 里的 Supabase / Clerk 变量整份复制进来，再加：

```bash
AI_API_KEY=sk-...
AI_MODEL=deepseek-flash
ASSISTANT_SPIKE_TOKEN=local-spike-token-123
```

（`AI_MODEL` 用 Task 1 Step 2 核对后的名字。）

- [ ] **Step 2: OpenNext 构建 + 本地 workerd**

```bash
npm run preview 2>&1 | tee /tmp/spike-preview.txt
```

Expected: 构建成功，wrangler 打印本地地址。

- [ ] **Step 3: 打开页面跑一轮**

先在 `http://localhost:8787/sign-in` 登录（`check_plan_conflicts` 调的 sections 接口要登录），再打开 `http://localhost:8787/labs/assistant-spike`，输入 token，依次发：

1. 「<课号> <教授> 有哪些 section？」——课号和教授从任意有「Offered」徽章的评价页抄
2. 「第一个 section 跟我的课表冲突吗？」

Expected: 回复逐字出现；第 1 条调用 `get_course_sections`，第 2 条调用 `check_plan_conflicts` 并按返回结果作答。

- [ ] **Step 4: 按报错处理已知坑**

| 现象 | 处理 |
|---|---|
| 报错含 `import.meta.url` / `createRequire` / `The argument 'path' must be a file URL` | `wrangler.jsonc` 顶层加 `"define": { "import.meta.url": "\"file:///worker.js\"" },`，重跑 Step 2 |
| 报错含 `Disallowed operation called within global scope` | 检查模块顶层是否有 `new BuiltInAgent` / `new CopilotRuntime`，都挪进 `getHandler()`；重跑 |
| 其它构建或运行错误 | 停下，把完整报错贴进报告，标 BLOCKED |

- [ ] **Step 5: 看流式是否真逐字（§13 第 3 问）**

DevTools → Network → 选 `/api/copilotkit/...` 请求 → 看 `Content-Type` 是否 `text/event-stream`，事件是否陆续到达（不是最后一次性到达）。记进报告。

- [ ] **Step 6: 记录 Worker 体积（§13 第 1 问）**

```bash
ls -la .open-next/worker.js
npx wrangler deploy --dry-run --outdir /tmp/spike-dryrun 2>&1 | tee /tmp/spike-dryrun.txt
```

Expected: 输出含 `Total Upload: … KiB / gzip: … KiB`。记进报告；wrangler 报体积超限则标 BLOCKED。

- [ ] **Step 7: Commit**

```bash
git add .gitignore wrangler.jsonc
git commit -m "spike: ignore .dev.vars and add workerd workarounds"
```

（`wrangler.jsonc` 没改时只提交 `.gitignore`。）

---

### Task 6: 上传预览版本，在 Free 档实测 CPU 与思考模式

**Files:**
- Modify: `wrangler.jsonc`（日志采样）

- [ ] **Step 1: 提高日志采样**

`wrangler.jsonc` 里 `observability.head_sampling_rate` 与 `observability.logs.head_sampling_rate` 都改为 `1`，顶层加 `"preview_urls": true,`。

```bash
git add wrangler.jsonc
git commit -m "spike: full log sampling for measurement"
```

- [ ] **Step 2: 给 Worker 设密钥（需要用户在自己终端操作）**

```bash
npx wrangler secret put AI_API_KEY
npx wrangler secret put AI_MODEL
npx wrangler secret put ASSISTANT_SPIKE_TOKEN
```

注意：`wrangler secret put` 会用**当前生产代码**重新部署一个带新密钥的版本。生产代码不读这三个变量，所以没有行为变化。DeepSeek 账户先只充 $5–10 做 spike。

- [ ] **Step 3: 上传（不上线）**

```bash
npm run upload 2>&1 | tee /tmp/spike-upload.txt
```

Expected: 输出 `Version ID` 和 `Version Preview URL`。生产流量不受影响。

没有预览 URL：Cloudflare Dashboard → Workers → next-web → Settings → Domains & Routes 打开 Preview URLs，再重跑。

- [ ] **Step 4: 确认预览域名能打开**

打开 `<预览 URL>/labs/assistant-spike`。生产 Clerk key 在 `workers.dev` 域名下多半无法登录：这只影响 `check_plan_conflicts`（会返回 `found: false` + `HTTP 401`），不影响服务端 CPU 测量，继续即可，并在报告记一笔。页面整体白屏打不开才标 BLOCKED（需要另配域名），跳到 Task 8。

- [ ] **Step 5: 开 tail**

另开终端：

```bash
npx wrangler tail next-web --format json \
  | jq -c 'select(.event.request.url // "" | test("/api/copilotkit")) | {url: .event.request.url, outcome, cpuTime, wallTime, logs: [.logs[]?.message]}' \
  | tee /tmp/spike-tail.jsonl
```

tail 看不到预览版本请求时：Dashboard → Workers → next-web → Observability，按版本 ID 与 URL 含 `/api/copilotkit` 过滤，读每次调用的 CPU time / wall time。

- [ ] **Step 6: 固定三轮对话，思考 off（§13 第 2 问）**

页面输入 token，思考选 `off`，点「新会话」，同一会话依次发：

1. 「<课号A> <教授> 有哪些 section？」（服务端工具）
2. 「第一个 section 跟我的课表冲突吗？」（前端工具）
3. 「我第一个问的是哪门课？再查一下 <课号B> <教授>」（检验上文 + 第二次服务端工具）

每条消息记 tail 里的 `cpuTime`、`wallTime`、`outcome`（`ok` / `exceededCpu` / `exception`）。

- [ ] **Step 7: 同样三轮，思考 low（§13 第 5 问）**

切到 `low`，点「新会话」，重复 Step 6。注意第 3 轮：DeepSeek 带工具的多轮思考要求回传 `reasoning_content`，缺了会 400。记下是否出错与原文。

---

### Task 7: 多轮上文是否跨 isolate 保持（§13 第 4 问）

**Files:** 无代码改动

- [ ] **Step 1: 看客户端每轮发了什么**

在 Task 6 的预览页面，DevTools → Network → 选第 3 轮的 `/api/copilotkit/...` run 请求 → Payload，数 `messages` 数组长度，记下第 1、2、3 轮各自的长度。

判断：第 3 轮 `messages` 含前两轮的用户消息、助手回复与工具结果 → 客户端每次带完整历史，isolate 无关；只有当前一条 → 依赖服务端内存 runner。

- [ ] **Step 2: 对照服务端日志**

tail / Observability 里找 `[assistant-spike] after`，记每轮 `threadId`、`messageCount` 是否累加且一致。

- [ ] **Step 3: 强制换 isolate 再续聊**

在一段已跑两轮的会话里，等 10 分钟（让 isolate 回收），或在另一个终端用 `npm run upload` 重新上传一次再回到同一页面（不刷新），发第 3 轮「我刚才问的第一门课是什么？」。记录模型是否答对。

- [ ] **Step 4: 刷新页面**

刷新后记录历史是否消失（V1 设计如此，预期消失）。

---

### Task 8: 验证报告、结论、清理

**Files:**
- Create（主工作区 `feat/ai-timetable-agent`）: `docs/superpowers/verification/<执行日期>-assistant-v1-workers-spike.md`
- Modify（主工作区）: `docs/superpowers/specs/2026-10-17-next-web-ai-timetable-assistant-v1-design.md`

- [ ] **Step 1: 写报告**

把下面整段写进报告文件，填入实测值；没测到的格子写「未测：原因」。

```markdown
# AI 助手 V1 · Workers spike 验证报告 — <执行日期>

## 结论

<继续按设计实施 / 需要升级 Workers Paid / 改用 Vercel AI SDK / BLOCKED>，理由一句话。

## 环境

- 分支：spike/assistant-v1-workers（不合并）
- 依赖：@copilotkit/react-core <版本>、@copilotkit/runtime <版本>、@ai-sdk/deepseek <版本>、ai <版本>
- DeepSeek：模型 <API 名>；思考参数 <名与取值>；价格 <高峰 / 低谷，日期>
- Cloudflare 档位：Free
- 预览版本 ID：<id>

## 0. 基线（§13-6）

| 路由 | Size | First Load JS |
|---|---:|---:|
| `/` |  |  |
| `/timetable` |  |  |
| `/course/[code]` |  |  |

## 1. 打包（§13-1）

- npm install：<通过 / 报错原文>
- node_modules 增量：<du 输出>
- Worker 体积：Total Upload <x> KiB / gzip <y> KiB
- 需要的 workaround：<无 / define import.meta.url / 其它>
- `/labs/assistant-spike` First Load：<x> kB；基线三页是否不变：<是 / 否>

## 2. CPU（§13-2，Free 档 10ms）

| 思考 | 轮次 | cpuTime (ms) | wallTime (ms) | outcome |
|---|---|---:|---:|---|
| off | 1 查 section |  |  |  |
| off | 2 问冲突 |  |  |  |
| off | 3 上文 + 再查 |  |  |  |
| low | 1 查 section |  |  |  |
| low | 2 问冲突 |  |  |  |
| low | 3 上文 + 再查 |  |  |  |

## 3. 流式（§13-3）

- Content-Type：<>
- 是否逐字到达：<是 / 否，现象>

## 4. 多轮上文（§13-4）

- 每轮请求 `messages` 长度：<1 轮 / 2 轮 / 3 轮>
- 客户端是否带完整历史：<是 / 否>
- afterRequestMiddleware：<是否触发、messageCount 是否正确>
- 换 isolate 后第 3 轮：<答对 / 丢上文>
- 刷新后：<历史消失 / 保留>

## 5. 思考模式（§13-5）

- off：<是否稳定>
- low：<是否稳定；多轮工具是否 400，原文>
- 建议默认：<off / low>

## 偏离计划

- <Task 1/3/4 的版本与签名调整等>
```

- [ ] **Step 2: 按规则给结论**

| 实测 | 结论 |
|---|---|
| 打包通过，所有调用 `outcome=ok`，CPU 都 < 10ms，换 isolate 不丢上文 | 继续按设计实施 |
| 打包通过，但换 isolate 丢上文 | 继续，但 V1 实施计划加一项「客户端带完整历史 / 无状态 runner」 |
| 有调用 `exceededCpu` 或 CPU 常 ≥ 10ms | 升级 Workers Paid（$5/月起），和用户确认后再继续 |
| 打包或运行在 Workers 上跑不通（workaround 无效） | 改用 Vercel AI SDK + shadcn 聊天组件，更新 V1 spec §5、§13、§15 |
| 预览页面整体打不开 | BLOCKED：需要给预览版本配可用域名，和用户讨论 |

- [ ] **Step 3: 清理**

```bash
npx wrangler secret delete ASSISTANT_SPIKE_TOKEN
```

删掉 token 后，预览 URL 上的 spike 接口返回 404。`AI_API_KEY`、`AI_MODEL` 保留给 V1 实施。

- [ ] **Step 4: 提交报告与 spec 回写（主工作区）**

在 V1 spec 里：§10 的版本 / 模型名 / 价格改成核对值，`AI_THINKING` 默认值改成实测建议，§13 末尾加一行「结果：见 verification/<执行日期>-assistant-v1-workers-spike.md」。

```bash
cd /Users/thomaswu/workspace/next-web
git add docs/superpowers/verification/<执行日期>-assistant-v1-workers-spike.md \
  docs/superpowers/specs/2026-10-17-next-web-ai-timetable-assistant-v1-design.md
git commit -m "docs: record assistant V1 workers spike results"
```

spike 分支保留不合并；确认不再需要后 `git worktree remove .worktrees/assistant-spike`。
