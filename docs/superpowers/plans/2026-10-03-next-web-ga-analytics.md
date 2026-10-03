# next-web GA 埋点实施计划（Phase 1：埋点基础层 + 浏览类事件）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 next-web 的浏览类业务事件（搜索提交、搜索结果、筛选、列表点击）经**唯一出口** `emit()` 进入 GTM dataLayer，并交付可由脚本生成、有人工照抄步骤的 GTM/GA4 配置清单；软导航的 `page_view` 交给 GTM 负责，代码不接管。

**Architecture:** 数据层三层分离——`registry-data.mjs`（事件字典的物理数据源，纯 ESM，运行时代码与 Node 生成脚本读同一份）→ `registry.ts`（类型化再导出）→ `data-layer.ts` 的 `emit()`（SSR 守卫、注册表校验、值归一、dev 日志、全仓唯一的 `dataLayer.push`）→ `events.ts` 的语义函数（`trackSearch` 等，调用点只写产品语义）→ `components/analytics/*` 两个只收**可序列化 props** 的客户端叶子（`TrackedItemLink`、`TrackSearchResults`，因为调用方是 server component）。GTM 侧由**一个**自定义事件触发器（事件名恒为 `um_event`）+ **一个** GA4 事件标签（Event Name = `{{DL - um_name}}`）承载全部事件，因此新增事件不需要再改容器。

**Tech Stack:** Next.js 14.2 App Router（`reactStrictMode: true`）、React 18、TypeScript 5.2（strict，`allowJs: true`）、Vitest 2（`tests/components/**` 走 jsdom，其余走 node）、@testing-library/react 16 + `fireEvent`（仓库未装 `user-event`）、GTM 容器 `GTM-KGF3BFS` / GA4 `G-V1KZT6Q50E`。

**Spec:** `docs/superpowers/specs/2026-10-03-next-web-ga-analytics-design.md`

## Global Constraints

- **唯一出口**：只有 `lib/analytics/data-layer.ts` 允许出现 `window.dataLayer` 写入；业务代码只能调用 `lib/analytics/events.ts` 的语义函数；全仓不得出现 `gtag(`。
- **payload 形状恒定**：`{ event: "um_event", um_name: "<事件名>", ...params }`，参数**扁平**挂在根上（GTM 里一个参数一个数据层变量）。
- **零新依赖**：不新增任何 npm 包；不改 `next.config.js` / `tsconfig.json` / `package-lock.json`（除 `package.json` 增加一条 script）。
- **SSR 安全**：无 `window` 时 `emit()` 直接 return，不 push、不抛错。
- **命名约束**：事件名与参数名满足 `^[a-z][a-z0-9_]*$`、≤40 字符、不以 `ga_` / `google_` / `firebase_` 开头；单事件参数 ≤25。
- **值归一**：布尔 → `1`/`0`；数字保持 number 且必须有限；字符串截断到 100 字符（可用 `maxLength` 覆盖）。
- **禁止 PII**：禁止键清单见 `FORBIDDEN_PARAM_NAMES`（`email`、`user_id`、`content`、`url` 等），任何事件都不得注册它们。
- **RSC 边界**：客户端上报叶子组件**只接收可序列化 props**，不得接回调函数（`CourseCard` / `ProfCard` / 讲师搜索页都是 server component）。
- **不改既有行为**：除必要的 client 包装、新增可选 prop、把内联筛选循环替换为等价纯函数外，不改动任何既有 UI 行为、DOM 结构、文案与样式。
- **每个 task 结束**：`npx vitest run <该 task 的相关测试>` 通过后再单独 commit（提交信息见各 task）；最后一 task 跑全量 `npm run test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`。
- **本计划只做 Phase 1**（`search` / `view_search_results` / `filter_apply` / `select_item`）；Phase 2（转化类 8 个事件）另起计划，定义见 spec §6.3。

---

## File Structure

**Create**

- `lib/analytics/registry-data.mjs` — 事件字典物理数据源（纯数据、无 import、无副作用）
- `lib/analytics/registry.ts` — 类型化再导出 + 禁止项清单
- `lib/analytics/data-layer.ts` — `emit()`：SSR 守卫、注册表校验、归一、dev 日志、唯一 push（**唯一允许写 `window.dataLayer` 的文件**）
- `lib/analytics/events.ts` — Phase 1 的 4 个语义函数
- `lib/course-filters.ts` — 从 `CourseFilter` 抽出的纯函数：`COURSE_FILTER_KEYS` / `createInitialFilterState` / `nextFilterState` / `applyCourseFilters`
- `components/analytics/tracked-link.tsx` — `'use client'`，导出 `TrackedItemLink`
- `components/analytics/track-search-results.tsx` — `'use client'`，导出 `TrackSearchResults`
- `scripts/print-analytics-manifest.mjs` — 从数据源生成 `docs/analytics/gtm-setup.md`，支持 `--check`
- `docs/analytics/gtm-setup.md` — 生成的 GTM/GA4 手工配置清单（人工不得手改）
- `tests/analytics/registry.test.ts`、`tests/analytics/data-layer.test.ts`、`tests/analytics/events.test.ts`、`tests/analytics/wiring.test.ts`
- `tests/course-filters.test.ts`
- `tests/components/tracked-item-link.test.tsx`、`tests/components/track-search-results.test.tsx`、`tests/components/course-card-analytics.test.tsx`、`tests/components/course-filter-analytics.test.tsx`

**Modify**

- `components/search/search-form.tsx` — `onSubmit` 上报 `search`
- `components/course-card.tsx` — `<Link>` → `<TrackedItemLink>`，新增 `listName` / `position` prop
- `components/prof-card.tsx` — `ProfCard` / `ProfCourseCard` 同上
- `components/course-filter.tsx` — 新增 `listName` / `trackResults` prop，筛选逻辑改调纯函数，上报 `filter_apply` 与 `view_search_results`
- `components/course/course-instructors.tsx`、`app/professor/[...name]/page.tsx`、`app/search/instructor/[...name]/page.tsx`、`app/catalog/[...departments]/page.tsx`、`app/search/course/[code]/page.tsx` — 传 `listName` / `position` / `trackResults`，讲师搜索结果页上报 `view_search_results`
- `tests/components/search-form.test.tsx` — **扩展**（不新建重复文件）
- `package.json` — 增加 `analytics:manifest` script

---

### Task 1: GTM 冒烟验证（人工，可与后续任务并行）

**Files:**
- 记录位置：R1 的冒烟验证结论写入 `docs/superpowers/verification/2026-10-03-next-web-ga-analytics.md`（Task 11 创建）；**不要**写进生成物 `docs/analytics/gtm-setup.md`

**Interfaces:**
- Produces: 桥 A 成立与否的结论（决定后续 GTM 配置是"通用事件标签"还是"Custom HTML 桥"）。**代码侧不依赖该结论**：`emit()` 与事件字典在两种桥下完全一致。

- [ ] **Step 1: 在 GTM 里配一个最小标签**

GTM → 容器 `GTM-KGF3BFS` → 标签 → 新建：
- 类型：`Google Analytics: GA4 事件`
- Measurement ID：`G-V1KZT6Q50E`
- **Event Name：点输入框右侧的变量选择器 → 新建变量 → 类型"数据层变量" → 数据层变量名称填 `um_name`（版本 2）→ 保存 → 在这个字段选中它**（这一步就是在验证"Event Name 能否填变量"，即 spec 的 R1）
- 事件参数：新增一行，参数名 `search_term`，值 → 变量 → 数据层变量 `search_term`
- 触发条件：新建触发器 → `自定义事件` → 事件名称**精确匹配** `um_event`
- 保存（先不要提交/发布）

- [ ] **Step 2: 起本地站点并用 GTM Preview 验证**

```bash
cd next-web
npm run dev
```

浏览器打开 `http://localhost:3000`，开 GTM Preview（Tag Assistant），连接该页面，然后在浏览器控制台执行：

```js
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ event: "um_event", um_name: "search", search_term: "SMOKE" });
```

Expected：Tag Assistant 里出现 `um_event` 事件 → 上面那个标签被触发 → 点开标签详情，GA4 事件名显示 `search`（而不是空、也不是 `{{DL - um_name}}` 字面量），且 `search_term = SMOKE`。

- [ ] **Step 3: 记录结论**

把结论写到 **Task 11 的验证文档** `docs/superpowers/verification/2026-10-03-next-web-ga-analytics.md` 里（不是 `docs/analytics/gtm-setup.md` —— 后者是脚本生成物，`--check` 做逐字比对，手工追加会让守卫测试失败；见 Ruling R16）：

```markdown
## 冒烟验证（R1：Event Name 能否填变量）

- 日期：YYYY-MM-DD
- 结论：桥 A 成立 / 桥 A 不成立（GTM 拒绝变量）
- 证据：Tag Assistant 截图或文字记录（事件名 = search，search_term = SMOKE）
```

- **若桥 A 成立**：按本计划继续，第 10 个 task 按"通用 GA4 事件标签"出清单。
- **若桥 A 不成立**：**代码侧一切照做**（本计划的 Task 2–9、11 全部不变），只把 Task 10 的清单换成"桥 C"：1 个触发器（`um_event`）+ 1 个 Custom JavaScript 变量（返回 dataLayer 的 `um_event` 对象）+ 1 个 Custom HTML 标签（`gtag('event', p.um_name, params)`，其中 params 为去掉 `event`/`um_name` 后的对象，并对 `window.gtag` 做存在性守卫）。此时 spec 的 §9.1 表格按桥 C 改写。

- [ ] **Step 4: Commit**

```bash
git add docs/analytics/gtm-setup.md
git commit -m "docs(analytics): record the GTM bridge smoke test result"
```

---

### Task 2: 事件注册表（数据源 + 类型化导出）

**Files:**
- Create: `lib/analytics/registry-data.mjs`
- Create: `lib/analytics/registry.ts`
- Test: `tests/analytics/registry.test.ts`

**Interfaces:**
- Produces:
  - `ANALYTICS_EVENTS: Record<EventName, EventSpec>`（`EventName = "search" | "view_search_results" | "filter_apply" | "select_item"`）
  - `FORBIDDEN_PARAM_NAMES: readonly string[]`
  - `type ParamSpec = { type: "string" | "number"; required: boolean; maxLength?: number; note: string }`
  - `type EventSpec = { ga4: "recommended" | "custom"; purpose: string; wiring: string; params: Record<string, ParamSpec> }`
  - `lib/analytics/registry-data.mjs` 可被 `node` 直接 import（无 import/require 语句）

- [ ] **Step 1: Write the failing test**

`tests/analytics/registry.test.ts`：

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ANALYTICS_EVENTS, FORBIDDEN_PARAM_NAMES } from "@/lib/analytics/registry";

const NAME_PATTERN = /^[a-z][a-z0-9_]*$/;
const RESERVED_PREFIXES = ["ga_", "google_", "firebase_"];
const RECOMMENDED_WHITELIST = ["search", "view_search_results", "select_item", "login"];
const PHASE_1_EVENTS = ["search", "view_search_results", "filter_apply", "select_item"];

describe("analytics registry", () => {
  it("declares the phase 1 events", () => {
    expect(Object.keys(ANALYTICS_EVENTS).sort()).toEqual([...PHASE_1_EVENTS].sort());
  });

  it("keeps every event and parameter name ga4-compatible", () => {
    for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
      expect(eventName, eventName).toMatch(NAME_PATTERN);
      expect(eventName.length, eventName).toBeLessThanOrEqual(40);
      for (const prefix of RESERVED_PREFIXES) {
        expect(eventName.startsWith(prefix), eventName).toBe(false);
      }
      expect(Object.keys(spec.params).length, eventName).toBeLessThanOrEqual(25);

      for (const [paramName, param] of Object.entries(spec.params)) {
        expect(paramName, `${eventName}.${paramName}`).toMatch(NAME_PATTERN);
        expect(paramName.length, `${eventName}.${paramName}`).toBeLessThanOrEqual(40);
        expect(["string", "number"], `${eventName}.${paramName}`).toContain(param.type);
        expect(typeof param.required, `${eventName}.${paramName}`).toBe("boolean");
        expect(param.note.length, `${eventName}.${paramName}`).toBeGreaterThan(0);
      }
    }
  });

  it("never registers a forbidden pii parameter", () => {
    for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
      for (const paramName of Object.keys(spec.params)) {
        expect(FORBIDDEN_PARAM_NAMES, `${eventName}.${paramName}`).not.toContain(paramName);
      }
    }
  });

  it("only uses whitelisted ga4 recommended event names", () => {
    for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
      if (spec.ga4 === "recommended") {
        expect(RECOMMENDED_WHITELIST, eventName).toContain(eventName);
      }
    }
  });

  it("points every event at wiring files that exist", () => {
    for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
      const files = spec.wiring.split(",").map((value) => value.trim());
      expect(files.length, eventName).toBeGreaterThan(0);
      for (const file of files) {
        expect(existsSync(join(process.cwd(), file)), `${eventName} → ${file}`).toBe(true);
      }
    }
  });

  it("keeps the data source importable by plain node", () => {
    const source = readFileSync(join(process.cwd(), "lib/analytics/registry-data.mjs"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/require\(/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analytics/registry.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/analytics/registry"`.

- [ ] **Step 3: Write minimal implementation**

`lib/analytics/registry-data.mjs`：

```js
/**
 * 事件字典的物理数据源。
 *
 * 这个文件必须是**纯数据 + 纯 ESM**：Node 生成脚本
 * （scripts/print-analytics-manifest.mjs）与运行时代码读的是同一份数据，
 * 因此 GTM 清单不可能与代码漂移。不要在这里 import 任何东西。
 */

export const ANALYTICS_EVENTS = {
  search: {
    ga4: "recommended",
    purpose: "用户主动提交搜索：记录搜了什么、按课程还是讲师、从哪个入口进来",
    wiring: "components/search/search-form.tsx",
    params: {
      search_term: {
        type: "string",
        required: true,
        note: "用户输入的关键词（表单已用 zod 校验 4-30 字符）",
      },
      search_scope: { type: "string", required: true, note: "course 或 instructor" },
      entry_point: {
        type: "string",
        required: true,
        note: "SearchForm 的 variant：hero（首页）/ header（搜索页顶栏）/ dialog（顶栏弹窗）/ inline",
      },
    },
  },

  view_search_results: {
    ga4: "recommended",
    purpose: "搜索结果页展示：结果数，尤其是 0 结果（教务库缺口信号）",
    wiring: "components/course-filter.tsx, app/search/instructor/[...name]/page.tsx",
    params: {
      search_term: { type: "string", required: true, note: "本次搜索的关键词" },
      search_scope: { type: "string", required: true, note: "course 或 instructor" },
      result_count: {
        type: "number",
        required: true,
        note: "服务端返回的原始结果条数（课程=课程数，讲师=讲师数），不受用户后续筛选影响",
      },
      has_results: { type: "number", required: true, note: "1 = 有结果，0 = 无结果（布尔在代码里归一为 1/0）" },
    },
  },

  filter_apply: {
    ga4: "custom",
    purpose: "课程列表的筛选使用情况：用户真正在意哪个维度、筛完还剩多少条",
    wiring: "components/course-filter.tsx",
    params: {
      filter_name: {
        type: "string",
        required: true,
        note: "筛选维度内部键名，如 Offering_Department / Is_Offered / Credits",
      },
      filter_value: { type: "string", required: true, note: "用户选择的值；All 表示清除该维度" },
      result_count: { type: "number", required: true, note: "应用这次筛选之后的列表条数" },
    },
  },

  select_item: {
    ga4: "recommended",
    purpose: "从列表进入详情的点击：来源列表、点击位置（列表 CTR）",
    wiring: "components/course-card.tsx, components/prof-card.tsx",
    params: {
      item_id: { type: "string", required: true, note: "课程号（如 COMP1001）或讲师 id（prof_id）" },
      item_list_name: {
        type: "string",
        required: true,
        note: "catalog / search_course / search_instructor / course_instructors / professor_courses",
      },
      position: { type: "number", required: true, note: "该条目在列表数组里的下标（广告位不占号）" },
      faculty: {
        type: "string",
        required: false,
        note: "Offering_Unit；数据里没有该字段时省略此参数，不硬凑",
      },
    },
  },
};

/** 任何事件都不得注册这些参数名（PII / 登录态 / 自由文本 / URL）。 */
export const FORBIDDEN_PARAM_NAMES = [
  "email",
  "user_id",
  "userid",
  "full_name",
  "name",
  "clerk_user_id",
  "content",
  "details",
  "comment",
  "reply_text",
  "url",
  "token",
  "share_url",
  "ip",
];
```

`lib/analytics/registry.ts`：

```ts
import {
  ANALYTICS_EVENTS as RAW_EVENTS,
  FORBIDDEN_PARAM_NAMES as RAW_FORBIDDEN_PARAM_NAMES,
} from "./registry-data.mjs";

export type ParamType = "string" | "number";

export type ParamSpec = {
  type: ParamType;
  required: boolean;
  /** 覆盖默认的 100 字符上限（GA4 对字符串参数的限制）。 */
  maxLength?: number;
  note: string;
};

export type EventSpec = {
  ga4: "recommended" | "custom";
  purpose: string;
  /** 一个或多个接线文件路径（逗号分隔），测试会断言它们真实存在。 */
  wiring: string;
  params: Record<string, ParamSpec>;
};

/** 事件名的类型从数据源推断，因此新增事件会自动出现在类型里。 */
export type EventName = keyof typeof RAW_EVENTS & string;

/**
 * 数据源是 .mjs（为了让 Node 脚本与运行时读同一份物理数据），TypeScript 只能从
 * JS 字面量推断出 `ga4: string` 这种宽类型，所以这里必须断言一次。真正的形状保证
 * 来自 tests/analytics/registry.test.ts 的运行时校验。
 */
export const ANALYTICS_EVENTS = RAW_EVENTS as unknown as Record<EventName, EventSpec>;

export const FORBIDDEN_PARAM_NAMES: readonly string[] = RAW_FORBIDDEN_PARAM_NAMES;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/analytics/registry.test.ts`
Expected: PASS（6 tests）。

顺带确认类型断言没有引入类型错误：

Run: `npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/registry-data.mjs lib/analytics/registry.ts tests/analytics/registry.test.ts
git commit -m "feat(analytics): event registry as the single source of truth"
```

---

### Task 3: `emit()` —— 唯一的数据层出口

**Files:**
- Create: `lib/analytics/data-layer.ts`
- Test: `tests/analytics/data-layer.test.ts`

**Interfaces:**
- Consumes: `ANALYTICS_EVENTS`（Task 2）
- Produces:
  - `emit(name: string, params?: Record<string, string | number | boolean | null | undefined>): void`
  - `type AnalyticsParamValue = string | number | boolean | null | undefined`
  - 副作用：`window.dataLayer.push({ event: "um_event", um_name: name, ...params })`；dev 下额外 `console.debug("[analytics]", name, payload)`

- [ ] **Step 1: Write the failing test**

`tests/analytics/data-layer.test.ts`（`tests/analytics/**` 默认是 node 环境，所以用文件头声明 jsdom）：

```ts
/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emit } from "@/lib/analytics/data-layer";

type Payload = Record<string, unknown>;

function layer(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

beforeEach(() => {
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SEARCH = { search_term: "ACCT1000", search_scope: "course", entry_point: "hero" };

describe("emit", () => {
  it("pushes the canonical payload shape", () => {
    emit("search", SEARCH);
    expect(layer()).toEqual([{ event: "um_event", um_name: "search", ...SEARCH }]);
  });

  it("initialises window.dataLayer when it is missing", () => {
    delete (window as unknown as { dataLayer?: Payload[] }).dataLayer;
    emit("search", SEARCH);
    expect(layer()).toHaveLength(1);
  });

  it("does nothing without a window (server rendering)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => emit("search", SEARCH)).not.toThrow();
  });

  it("rejects unknown events in development", () => {
    expect(() => emit("not_registered", {})).toThrow(/unknown event/);
    expect(layer()).toHaveLength(0);
  });

  it("rejects unregistered parameters in development", () => {
    expect(() => emit("search", { ...SEARCH, nope: "x" })).toThrow(/not registered/);
    expect(layer()).toHaveLength(0);
  });

  it("rejects missing required parameters in development", () => {
    expect(() => emit("search", { search_term: "ACCT1000" })).toThrow(/missing required parameter/);
    expect(layer()).toHaveLength(0);
  });

  it("rejects reserved parameter names", () => {
    expect(() => emit("search", { ...SEARCH, um_name: "hijack" })).toThrow(/reserved/);
    expect(layer()).toHaveLength(0);
  });

  it("drops and warns once instead of throwing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    emit("production_drop_probe", {});
    emit("production_drop_probe", {});
    expect(layer()).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("normalises booleans to 1/0 and keeps numbers as numbers", () => {
    emit("view_search_results", {
      search_term: "ACCT1000",
      search_scope: "course",
      result_count: 3,
      has_results: true,
    });
    expect(layer()[0]).toMatchObject({ result_count: 3, has_results: 1 });

    emit("view_search_results", {
      search_term: "NOPE",
      search_scope: "course",
      result_count: 0,
      has_results: false,
    });
    expect(layer()[1]).toMatchObject({ result_count: 0, has_results: 0 });
  });

  it("omits undefined and null parameters", () => {
    emit("select_item", { item_id: "COMP1001", item_list_name: "catalog", position: 0, faculty: undefined });
    expect(layer()[0]).not.toHaveProperty("faculty");
  });

  it("truncates long string values to 100 characters", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    emit("search", { search_term: "x".repeat(140), search_scope: "course", entry_point: "hero" });
    expect((layer()[0].search_term as string).length).toBe(100);
    expect(warn).toHaveBeenCalled();
  });

  it("stays silent in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    emit("search", SEARCH);
    expect(debug).not.toHaveBeenCalled();
    expect(layer()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analytics/data-layer.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/analytics/data-layer"`.

- [ ] **Step 3: Write minimal implementation**

`lib/analytics/data-layer.ts`：

```ts
import { ANALYTICS_EVENTS, type EventSpec } from "./registry";

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

const MAX_PARAM_NAME_LENGTH = 40;
const MAX_STRING_VALUE_LENGTH = 100;
const RESERVED_PARAM_NAMES = ["event", "um_name"];

/**
 * 构建期的静态字面量：Next 在客户端 bundle 里会把它替换成 "production"，
 * 因此浏览器里这一支是可靠的默认值。
 */
const BUILD_ENV = process.env.NODE_ENV;

/** 已经警告过的原因（同一个原因只警告一次，避免刷屏）。 */
const warned = new Set<string>();

/**
 * 运行时读取（而不是直接用 `process.env.NODE_ENV` 字面量），这样测试可以用
 * `vi.stubEnv` 覆盖；浏览器里没有 `process`，退回到构建期常量。
 */
function isDev(): boolean {
  const runtimeEnv = globalThis.process?.env?.NODE_ENV;
  return (runtimeEnv ?? BUILD_ENV) !== "production";
}

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[analytics] ${message}`);
}

/**
 * 开发环境直接抛错（测试与本地立刻暴露问题），生产环境丢弃这次上报。
 * 丢弃是必须的：宁可少一条数据，也不要往 GA4 塞形状不对的事件污染报表。
 */
function drop(reason: string, key: string): void {
  if (isDev()) throw new Error(`[analytics] ${reason}`);
  warnOnce(key, `dropped event: ${reason}`);
}

export type AnalyticsParamValue = string | number | boolean | null | undefined;

/**
 * 把一条业务事件推进 GTM dataLayer。全仓唯一的 dataLayer 写入口。
 *
 * payload 形状恒定：{ event: "um_event", um_name: <事件名>, ...params }。
 * `um_event` 是 GTM 触发器的唯一锚点，因此新增事件永远不需要改容器。
 */
export function emit(name: string, params: Record<string, AnalyticsParamValue> = {}): void {
  if (typeof window === "undefined") return;

  // `emit` 必须接受任意字符串：未知事件名要在运行时被拒绝并给出可读错误，因此
  // 这里对注册表做一次局部收窄断言（注册表的公开类型是窄的 Record<EventName,
  // EventSpec>，直接用 string 下标会触发 TS7053）。真正的守卫是紧随其后的运行时
  // 校验与单测，不是这个断言。
  const spec = (ANALYTICS_EVENTS as Record<string, EventSpec | undefined>)[name];
  if (!spec) {
    drop(`unknown event "${name}" — 先在 lib/analytics/registry-data.mjs 里登记它`, `event:${name}`);
    return;
  }

  const payload: Record<string, string | number> = { event: "um_event", um_name: name };

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (RESERVED_PARAM_NAMES.includes(key) || key.startsWith("um_") || key.startsWith("gtm")) {
      drop(`reserved parameter name "${key}"`, `reserved:${key}`);
      return;
    }
    if (key.length > MAX_PARAM_NAME_LENGTH) {
      drop(`parameter name "${key}" is longer than ${MAX_PARAM_NAME_LENGTH} characters`, `long-name:${key}`);
      return;
    }

    const paramSpec = spec.params[key];
    if (!paramSpec) {
      drop(
        `parameter "${key}" is not registered for event "${name}" — 未注册的参数不会出现在 GA4 里`,
        `param:${name}.${key}`,
      );
      return;
    }

    if (typeof value === "boolean") {
      payload[key] = value ? 1 : 0;
      continue;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        drop(`parameter "${key}" must be a finite number`, `number:${name}.${key}`);
        return;
      }
      payload[key] = value;
      continue;
    }
    if (typeof value === "string") {
      const limit = paramSpec.maxLength ?? MAX_STRING_VALUE_LENGTH;
      if (value.length > limit) {
        warnOnce(`truncate:${name}.${key}`, `parameter "${key}" truncated to ${limit} characters`);
        payload[key] = value.slice(0, limit);
        continue;
      }
      payload[key] = value;
      continue;
    }

    drop(`parameter "${key}" has unsupported type "${typeof value}"`, `type:${name}.${key}`);
    return;
  }

  for (const [key, paramSpec] of Object.entries(spec.params)) {
    if (paramSpec.required && payload[key] === undefined) {
      drop(`missing required parameter "${key}" for event "${name}"`, `missing:${name}.${key}`);
      return;
    }
  }

  const dataLayer = (window.dataLayer ??= []);
  dataLayer.push(payload);

  if (isDev()) console.debug("[analytics]", name, payload);
}
```

- [ ] **Step 4: Run test to verify it passes**

> **实施记录（2026-10-03，事后追加）**：本步骤落地后，代码评审发现两个真实缺陷并已修复，因此上面这段实现**已被取代**，请以仓库现状为准：① 注册表查找必须用 own-property 判定（`Object.prototype.hasOwnProperty.call`）——否则 `constructor` / `toString` / `__proto__` 这类名字会顺着原型链命中 `Object.prototype` 成员，绕过 `!spec` 守卫并在生产环境抛未捕获的 `TypeError`，而不是"丢弃 + warn"；② 必须按注册表声明的 `paramSpec.type` 强制值类型（`number` 参数接受有限数字或布尔→1/0，`string` 参数只接受字符串），因为 spec §5.2 的校验契约明确包含"值类型合规"。相关提交：`842838f`（两项硬化）、`1d3cb76`（改用 ES5 安全的 `hasOwnProperty.call`）。最终 `tests/analytics` 为 27 个用例。

Run: `npx vitest run tests/analytics/data-layer.test.ts`
Expected: PASS（修复轮后为 20 tests；`tests/analytics` 合计 27 tests）。

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/data-layer.ts tests/analytics/data-layer.test.ts
git commit -m "feat(analytics): single dataLayer emit with registry validation"
```

---

### Task 4: Phase 1 语义事件函数

**Files:**
- Create: `lib/analytics/events.ts`
- Test: `tests/analytics/events.test.ts`

**Interfaces:**
- Consumes: `emit`（Task 3）、`EventName`（Task 2）
- Produces:
  - `type SearchScope = "course" | "instructor"`
  - `type SearchEntryPoint = "hero" | "header" | "dialog" | "inline"`
  - `type ItemListName = "catalog" | "search_course" | "search_instructor" | "course_instructors" | "professor_courses"`
  - `trackSearch(input: { term: string; scope: SearchScope; entryPoint: SearchEntryPoint }): void`
  - `trackSearchResults(input: { term: string; scope: SearchScope; resultCount: number }): void`
  - `trackFilterApply(input: { name: string; value: string; resultCount: number }): void`
  - `trackSelectItem(input: { itemId: string; listName: ItemListName; position: number; faculty?: string }): void`

- [ ] **Step 1: Write the failing test**

`tests/analytics/events.test.ts`：

```ts
/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  trackFilterApply,
  trackSearch,
  trackSearchResults,
  trackSelectItem,
} from "@/lib/analytics/events";
import { ANALYTICS_EVENTS } from "@/lib/analytics/registry";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

let debug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
  // emit() 在 dev 下会打一行 console.debug：测试里既屏蔽它的 stdout 噪声，
  // 又借此断言"dev 可观测"这条被 spec 写明的行为确实存在。
  debug = vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
  debug.mockRestore();
});

describe("analytics events", () => {
  it("maps search arguments onto ga4 parameters", () => {
    trackSearch({ term: "ACCT1000", scope: "course", entryPoint: "hero" });
    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "search",
        search_term: "ACCT1000",
        search_scope: "course",
        entry_point: "hero",
      },
    ]);
  });

  it("logs one readable line in development", () => {
    trackSearch({ term: "ACCT1000", scope: "course", entryPoint: "hero" });
    expect(debug).toHaveBeenCalledWith(
      "[analytics]",
      "search",
      expect.objectContaining({ um_name: "search" }),
    );
  });

  it("maps instructor search scope and the header entry point", () => {
    trackSearch({ term: "CHAN TAI MAN", scope: "instructor", entryPoint: "header" });
    expect(pushed()[0]).toMatchObject({ search_scope: "instructor", entry_point: "header" });
  });

  it("reports zero results as has_results = 0", () => {
    trackSearchResults({ term: "NOPE", scope: "instructor", resultCount: 0 });
    expect(pushed()[0]).toMatchObject({ result_count: 0, has_results: 0 });
  });

  it("reports non-zero results as has_results = 1", () => {
    trackSearchResults({ term: "ACCT1000", scope: "course", resultCount: 7 });
    expect(pushed()[0]).toMatchObject({ result_count: 7, has_results: 1 });
  });

  it("maps filter arguments", () => {
    trackFilterApply({ name: "Offering_Department", value: "FAH", resultCount: 12 });
    expect(pushed()[0]).toMatchObject({
      um_name: "filter_apply",
      filter_name: "Offering_Department",
      filter_value: "FAH",
      result_count: 12,
    });
  });

  it("omits the optional faculty parameter when it is absent", () => {
    trackSelectItem({ itemId: "COMP1001", listName: "catalog", position: 3 });
    expect(pushed()[0]).not.toHaveProperty("faculty");
  });

  it("includes faculty when it is provided", () => {
    trackSelectItem({ itemId: "COMP1001", listName: "catalog", position: 3, faculty: "FST" });
    expect(pushed()[0]).toMatchObject({ item_id: "COMP1001", item_list_name: "catalog", position: 3, faculty: "FST" });
  });

  it("only ever emits parameters that the registry knows", () => {
    // emit() 在 dev 下会对未注册参数抛错，因此这一条同时守住"语义函数的参数名与注册表一致"。
    trackSearch({ term: "ACCT1000", scope: "course", entryPoint: "hero" });
    trackSearchResults({ term: "ACCT1000", scope: "course", resultCount: 1 });
    trackFilterApply({ name: "Credits", value: "3", resultCount: 1 });
    trackSelectItem({ itemId: "COMP1001", listName: "professor_courses", position: 0 });

    const payloads = pushed();
    expect(payloads.map((payload) => payload.um_name)).toEqual([
      "search",
      "view_search_results",
      "filter_apply",
      "select_item",
    ]);

    for (const payload of payloads) {
      const spec = ANALYTICS_EVENTS[payload.um_name as keyof typeof ANALYTICS_EVENTS];
      expect(spec, String(payload.um_name)).toBeTruthy();
      for (const key of Object.keys(payload)) {
        if (key === "event" || key === "um_name") continue;
        expect(Object.keys(spec.params), `${String(payload.um_name)}.${key}`).toContain(key);
      }
      for (const [paramName, paramSpec] of Object.entries(spec.params)) {
        if (!paramSpec.required) continue;
        expect(payload, `${String(payload.um_name)}.${paramName}`).toHaveProperty(paramName);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analytics/events.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/analytics/events"`.

- [ ] **Step 3: Write minimal implementation**

`lib/analytics/events.ts`：

```ts
import { emit } from "./data-layer";

export type SearchScope = "course" | "instructor";

/** 与 SearchForm 的 `variant` 取值一一对应。 */
export type SearchEntryPoint = "hero" | "header" | "dialog" | "inline";

export type ItemListName =
  | "catalog"
  | "search_course"
  | "search_instructor"
  | "course_instructors"
  | "professor_courses";

export function trackSearch(input: {
  term: string;
  scope: SearchScope;
  entryPoint: SearchEntryPoint;
}): void {
  emit("search", {
    search_term: input.term,
    search_scope: input.scope,
    entry_point: input.entryPoint,
  });
}

export function trackSearchResults(input: {
  term: string;
  scope: SearchScope;
  resultCount: number;
}): void {
  emit("view_search_results", {
    search_term: input.term,
    search_scope: input.scope,
    result_count: input.resultCount,
    has_results: input.resultCount > 0,
  });
}

export function trackFilterApply(input: {
  name: string;
  value: string;
  resultCount: number;
}): void {
  emit("filter_apply", {
    filter_name: input.name,
    filter_value: input.value,
    result_count: input.resultCount,
  });
}

export function trackSelectItem(input: {
  itemId: string;
  listName: ItemListName;
  position: number;
  faculty?: string;
}): void {
  const params: Record<string, string | number> = {
    item_id: input.itemId,
    item_list_name: input.listName,
    position: input.position,
  };

  if (input.faculty) params.faculty = input.faculty;

  emit("select_item", params);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/analytics/events.test.ts`
Expected: PASS（8 tests）。

- [ ] **Step 5: Commit**

```bash
git add lib/analytics/events.ts tests/analytics/events.test.ts
git commit -m "feat(analytics): semantic event functions for the phase 1 events"
```

---

### Task 5: 把筛选逻辑抽成纯函数

**Files:**
- Create: `lib/course-filters.ts`
- Test: `tests/course-filters.test.ts`
- Modify: `components/course-filter.tsx`（只替换筛选实现，行为不变）

**Interfaces:**
- Produces:
  - `COURSE_FILTER_KEYS: readonly string[]`（9 个维度的顺序与既有 UI 一致）
  - `type CourseFilterState = Record<string, string | number | undefined>`（值类型含 `undefined`，用于表达"该维度未设置"；见 Step 3 的注释）
  - `createInitialFilterState(): CourseFilterState`
  - `nextFilterState(current: CourseFilterState, key: string, value: string): CourseFilterState`（含 `Is_Offered` 的 `Offered → 1` / `Not Offered → 0` 映射）
  - `applyCourseFilters<T extends Record<string, unknown>>(data: T[], filter: CourseFilterState): T[]`

- [ ] **Step 1: Write the failing test**

`tests/course-filters.test.ts`：

```ts
import { describe, expect, it } from "vitest";

import {
  COURSE_FILTER_KEYS,
  applyCourseFilters,
  createInitialFilterState,
  nextFilterState,
} from "@/lib/course-filters";

const COURSES = [
  { New_code: "COMP1001", Offering_Department: "CIS", Offering_Unit: "FST", Credits: "3", Is_Offered: 1 },
  { New_code: "COMP2001", Offering_Department: "CIS", Offering_Unit: "FST", Credits: "3", Is_Offered: 0 },
  { New_code: "ACCT1000", Offering_Department: "ACC", Offering_Unit: "FBA", Credits: "3", Is_Offered: 1 },
];

describe("course filters", () => {
  it("keeps the nine filter state dimensions in their existing order", () => {
    expect(COURSE_FILTER_KEYS).toEqual([
      "Medium_of_Instruction",
      "Offering_Department",
      "Course_Duration",
      "Credits",
      "Is_Offered",
      "Offering_Unit",
      "courseType",
      "offeringProgLevel",
      "suggestedYearOfStudy",
    ]);
  });

  it("starts with every dimension set to All", () => {
    const state = createInitialFilterState();
    expect(Object.keys(state)).toEqual([...COURSE_FILTER_KEYS]);
    expect(Object.values(state).every((value) => value === "All")).toBe(true);
  });

  it("treats All as no filtering", () => {
    expect(applyCourseFilters(COURSES, createInitialFilterState())).toHaveLength(3);
  });

  it("filters by a plain string dimension", () => {
    const state = nextFilterState(createInitialFilterState(), "Offering_Department", "CIS");
    expect(applyCourseFilters(COURSES, state).map((course) => course.New_code)).toEqual([
      "COMP1001",
      "COMP2001",
    ]);
  });

  it("maps Offered and Not Offered onto 1 and 0 for Is_Offered", () => {
    const offered = nextFilterState(createInitialFilterState(), "Is_Offered", "Offered");
    expect(offered.Is_Offered).toBe(1);
    expect(applyCourseFilters(COURSES, offered).map((course) => course.New_code)).toEqual([
      "COMP1001",
      "ACCT1000",
    ]);

    const notOffered = nextFilterState(createInitialFilterState(), "Is_Offered", "Not Offered");
    expect(notOffered.Is_Offered).toBe(0);
    expect(applyCourseFilters(COURSES, notOffered).map((course) => course.New_code)).toEqual(["COMP2001"]);
  });

  it("clears a dimension when All is chosen again", () => {
    const filtered = nextFilterState(createInitialFilterState(), "Offering_Department", "CIS");
    const cleared = nextFilterState(filtered, "Offering_Department", "All");
    expect(cleared.Offering_Department).toBe("All");
    expect(applyCourseFilters(COURSES, cleared)).toHaveLength(3);
  });

  it("combines dimensions with AND", () => {
    const first = nextFilterState(createInitialFilterState(), "Offering_Unit", "FST");
    const both = nextFilterState(first, "Is_Offered", "Offered");
    expect(applyCourseFilters(COURSES, both).map((course) => course.New_code)).toEqual(["COMP1001"]);
  });

  it("does not mutate the input array or the previous state", () => {
    const state = createInitialFilterState();
    const next = nextFilterState(state, "Credits", "3");
    const snapshot = [...COURSES];
    applyCourseFilters(COURSES, next);
    expect(state.Credits).toBe("All");
    expect(COURSES).toEqual(snapshot);
  });

  it("returns an empty list when nothing matches", () => {
    const state = nextFilterState(createInitialFilterState(), "Offering_Department", "NOPE");
    expect(applyCourseFilters(COURSES, state)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/course-filters.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/course-filters"`.

- [ ] **Step 3: Write minimal implementation**

`lib/course-filters.ts`：

```ts
/**
 * CourseFilter 的筛选语义，从组件里抽出来的纯函数。
 *
 * 抽出来的理由不只是"可测试"：埋点 `filter_apply` 需要**在事件处理函数里同步**
 * 知道"应用这次筛选之后还剩多少条"，而在 state 更新的 useEffect 里事后补报会与
 * 事件错一拍。纯函数让两处用同一份逻辑。
 */

export const COURSE_FILTER_KEYS = [
  "Medium_of_Instruction",
  "Offering_Department",
  "Course_Duration",
  "Credits",
  "Is_Offered",
  "Offering_Unit",
  "courseType",
  "offeringProgLevel",
  "suggestedYearOfStudy",
] as const;

export type CourseFilterKey = (typeof COURSE_FILTER_KEYS)[number];

/**
 * 筛选状态。`undefined` 显式写进值类型：`applyCourseFilters` 用它判断"该维度未
 * 设置"，也让 `value === undefined` 这类比较在 strict 下不触发 TS2367。
 *
 * 注意：状态有 9 个维度，但 UI 只渲染 6 个（`courseKeysToCount`：Credits /
 * Is_Offered / Offering_Department / Offering_Unit / courseType /
 * offeringProgLevel）。剩下 3 个（Course_Duration、Medium_of_Instruction、
 * suggestedYearOfStudy）当前不可选，但仍是状态的一部分，保持与既有代码一致。
 */
export type CourseFilterState = Record<string, string | number | undefined>;

export const ALL_FILTERS = "All";

export function createInitialFilterState(): CourseFilterState {
  return Object.fromEntries(COURSE_FILTER_KEYS.map((key) => [key, ALL_FILTERS]));
}

/** 把一次下拉选择转成新的筛选状态。`Is_Offered` 的三态映射沿用既有语义。 */
export function nextFilterState(
  current: CourseFilterState,
  key: string,
  value: string,
): CourseFilterState {
  const next: CourseFilterState = { ...current };

  if (key === "Is_Offered") {
    if (value === "Offered") next.Is_Offered = 1;
    else if (value === "Not Offered") next.Is_Offered = 0;
    else next.Is_Offered = ALL_FILTERS;
    return next;
  }

  next[key] = value;
  return next;
}

/** 纯函数：`All` 表示该维度不参与过滤；多个维度之间是 AND。 */
export function applyCourseFilters<T extends Record<string, unknown>>(
  data: T[],
  filter: CourseFilterState,
): T[] {
  let result = [...data];

  for (const key of COURSE_FILTER_KEYS) {
    const value = filter[key];
    if (value === undefined || value === ALL_FILTERS) continue;
    result = result.filter((course) => course[key] === value);
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/course-filters.test.ts`
Expected: PASS（9 tests）。

- [ ] **Step 5: Wire the component onto the pure functions**

`components/course-filter.tsx` 的两处替换（行为必须与替换前完全一致）：

1) 把内联的初始 state

```tsx
    const [filter, setFilter] = useState<any>({
        'Medium_of_Instruction': 'All',
        ... 
        'suggestedYearOfStudy': 'All'
    })
```

换成

```tsx
    const [filter, setFilter] = useState<CourseFilterState>(createInitialFilterState)
```

2) 把 effect 里的内联筛选循环

```tsx
        let curCourseList = [...data]
        for (const key in filter) {
            if (filter[key] !== 'All') {
                curCourseList = curCourseList.filter((course) => {
                    return course[key] === filter[key]
                })
            }
        }
        setCurrentCourseList([...curCourseList])
```

换成

```tsx
        setCurrentCourseList(applyCourseFilters(data, filter))
```

3) 文件顶部加入 import：

```tsx
import {
    applyCourseFilters,
    createInitialFilterState,
    type CourseFilterState,
} from "@/lib/course-filters"
```

- [ ] **Step 6: Verify the refactor did not change behaviour**

Run: `npx vitest run tests/course-filters.test.ts tests/ads tests/components`

Expected: PASS（既有广告与会话相关测试全绿，说明改动没有波及别处）。

Run: `npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 7: Commit**

```bash
git add lib/course-filters.ts tests/course-filters.test.ts components/course-filter.tsx
git commit -m "refactor(catalog): extract course filtering into pure functions"
```

---

### Task 6: 客户端上报叶子组件

**Files:**
- Create: `components/analytics/tracked-link.tsx`
- Create: `components/analytics/track-search-results.tsx`
- Test: `tests/components/tracked-item-link.test.tsx`
- Test: `tests/components/track-search-results.test.tsx`

**Interfaces:**
- Consumes: `trackSelectItem`、`trackSearchResults`、`ItemListName`、`SearchScope`（Task 4）
- Produces:
  - `TrackedItemLink(props: { href: string; children: ReactNode; itemId: string; listName: ItemListName; position: number; faculty?: string })` — `'use client'`
  - `TrackSearchResults(props: { term: string; scope: SearchScope; resultCount: number })` — `'use client'`
  - 两个组件都**只接收可序列化 props**（调用方是 server component，RSC 边界不能传函数）

- [ ] **Step 1: Write the failing tests**

`tests/components/tracked-item-link.test.tsx`：

```tsx
import React from "react";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import { TrackedItemLink } from "@/components/analytics/tracked-link";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

beforeEach(() => {
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
  push.mockClear();
});

afterEach(cleanup);

describe("TrackedItemLink", () => {
  it("keeps the destination href untouched", () => {
    render(
      <TrackedItemLink href="/course/COMP1001" itemId="COMP1001" listName="catalog" position={2}>
        COMP1001
      </TrackedItemLink>,
    );
    expect(screen.getByRole("link").getAttribute("href")).toBe("/course/COMP1001");
  });

  it("reports select_item with the list and position on click", () => {
    render(
      <TrackedItemLink
        href="/course/COMP1001"
        itemId="COMP1001"
        listName="catalog"
        position={2}
        faculty="FST"
      >
        COMP1001
      </TrackedItemLink>,
    );
    fireEvent.click(screen.getByRole("link"));

    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "select_item",
        item_id: "COMP1001",
        item_list_name: "catalog",
        position: 2,
        faculty: "FST",
      },
    ]);
  });

  it("omits faculty when the caller does not have it", () => {
    render(
      <TrackedItemLink href="/reviews/COMP1001/CHAN" itemId="CHAN" listName="professor_courses" position={0}>
        CHAN
      </TrackedItemLink>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(pushed()[0]).not.toHaveProperty("faculty");
  });

  it("does not block the default navigation", () => {
    render(
      <TrackedItemLink href="/course/COMP1001" itemId="COMP1001" listName="catalog" position={0}>
        COMP1001
      </TrackedItemLink>,
    );
    const link = screen.getByRole("link") as HTMLAnchorElement;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("reports once per click, not twice under StrictMode", () => {
    render(
      <React.StrictMode>
        <TrackedItemLink href="/course/COMP1001" itemId="COMP1001" listName="catalog" position={0}>
          COMP1001
        </TrackedItemLink>
      </React.StrictMode>,
    );
    fireEvent.click(screen.getByRole("link"));
    expect(pushed()).toHaveLength(1);
  });
});
```

`tests/components/track-search-results.test.tsx`：

```tsx
import React from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TrackSearchResults } from "@/components/analytics/track-search-results";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

beforeEach(() => {
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
});

afterEach(cleanup);

describe("TrackSearchResults", () => {
  it("reports the result count once on mount", () => {
    render(<TrackSearchResults term="ACCT1000" scope="course" resultCount={7} />);
    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "view_search_results",
        search_term: "ACCT1000",
        search_scope: "course",
        result_count: 7,
        has_results: 1,
      },
    ]);
  });

  it("reports zero results", () => {
    render(<TrackSearchResults term="NOPE" scope="instructor" resultCount={0} />);
    expect(pushed()[0]).toMatchObject({ result_count: 0, has_results: 0 });
  });

  it("renders nothing", () => {
    const { container } = render(<TrackSearchResults term="ACCT1000" scope="course" resultCount={1} />);
    expect(container.innerHTML).toBe("");
  });

  it("does not report twice under StrictMode", () => {
    render(
      <React.StrictMode>
        <TrackSearchResults term="ACCT1000" scope="course" resultCount={7} />
      </React.StrictMode>,
    );
    expect(pushed()).toHaveLength(1);
  });

  it("does not report again when the result count changes", () => {
    const { rerender } = render(<TrackSearchResults term="ACCT1000" scope="course" resultCount={7} />);
    rerender(<TrackSearchResults term="ACCT1000" scope="course" resultCount={2} />);
    expect(pushed()).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/tracked-item-link.test.tsx tests/components/track-search-results.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/analytics/tracked-link"` / `.../track-search-results"`.

- [ ] **Step 3: Write minimal implementation**

`components/analytics/tracked-link.tsx`：

```tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { trackSelectItem, type ItemListName } from "@/lib/analytics/events";

type TrackedItemLinkProps = {
  href: string;
  children: ReactNode;
  itemId: string;
  listName: ItemListName;
  /** 该条目在列表数组里的下标；广告位不占号。 */
  position: number;
  faculty?: string;
};

/**
 * 列表卡片的链接叶子：点击时上报 `select_item`，然后放行 next/link 的默认导航。
 *
 * 只接收可序列化 props（数据，不是回调）：调用方 CourseCard / ProfCard 是
 * server component，React Server Component 边界不允许把函数当 prop 传过来。
 */
export function TrackedItemLink({
  href,
  children,
  itemId,
  listName,
  position,
  faculty,
}: TrackedItemLinkProps) {
  return (
    <Link
      href={href}
      onClick={() => {
        trackSelectItem({ itemId, listName, position, faculty });
      }}
    >
      {children}
    </Link>
  );
}
```

`components/analytics/track-search-results.tsx`：

```tsx
"use client";

import { useEffect, useRef } from "react";

import { trackSearchResults, type SearchScope } from "@/lib/analytics/events";

type TrackSearchResultsProps = {
  term: string;
  scope: SearchScope;
  resultCount: number;
};

/**
 * 搜索结果页的"结果已展示"上报点。挂在服务端拿到的结果数组旁边即可，
 * 只接收可序列化 props（讲师搜索页是 server component）。
 *
 * `resultCount` 后续变化（例如客户端筛选）不会重复上报：口径是"这次搜索返回了多少条"。
 */
export function TrackSearchResults({ term, scope, resultCount }: TrackSearchResultsProps) {
  const reported = useRef(false);

  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    trackSearchResults({ term, scope, resultCount });
  }, [term, scope, resultCount]);

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/tracked-item-link.test.tsx tests/components/track-search-results.test.tsx`
Expected: PASS（5 + 5 tests）。

- [ ] **Step 5: Commit**

```bash
git add components/analytics/tracked-link.tsx components/analytics/track-search-results.tsx tests/components/tracked-item-link.test.tsx tests/components/track-search-results.test.tsx
git commit -m "feat(analytics): client tracking leaves for card clicks and search results"
```

---

### Task 7: 接线 `SearchForm`（`search` 事件）

**Files:**
- Modify: `components/search/search-form.tsx:60-63`（`onSubmit`）
- Test: `tests/components/search-form.test.tsx`（**扩展既有文件**，不新建重复文件）

**Interfaces:**
- Consumes: `trackSearch`（Task 4）
- Produces: 每次成功提交搜索都会推一条 `um_name = "search"` 的事件；**校验失败不推**

- [ ] **Step 1: Extend the existing test file with failing analytics assertions**

在 `tests/components/search-form.test.tsx` 顶部（`import SearchForm` 之前）加入 dataLayer 辅助函数，并在 `describe("SearchForm", ...)` 内新增三个用例。新文件内容应为：

```tsx
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

import SearchForm from "@/components/search/search-form";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

describe("SearchForm", () => {
  beforeEach(() => {
    push.mockClear();
    (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
  });

  it("submits course search by default", async () => {
    render(<SearchForm variant="inline" />);
    fireEvent.change(screen.getByPlaceholderText(/ACCT1000/i), {
      target: { value: "acct1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/search/course/ACCT1000"));
  });

  it("submits instructor search when switch is enabled", async () => {
    render(<SearchForm variant="inline" defaultMode="instructor" defaultCode="CHAN TAI MAN" />);
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/search/instructor/CHAN%20TAI%20MAN"));
  });

  it("reports the submitted course search with its entry point", async () => {
    render(<SearchForm variant="inline" />);
    fireEvent.change(screen.getByPlaceholderText(/ACCT1000/i), {
      target: { value: "acct1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(pushed()).toHaveLength(1));
    expect(pushed()[0]).toEqual({
      event: "um_event",
      um_name: "search",
      // 口径说明：search_term 由 trackSearch 统一转大写，与结果页 view_search_results 的 term（来自 URL）对齐。
      search_term: "ACCT1000",
      search_scope: "course",
      entry_point: "inline",
    });
  });

  it("reports the instructor scope for the hero entry point", async () => {
    render(<SearchForm variant="hero" defaultMode="instructor" defaultCode="CHAN TAI MAN" />);
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(pushed()).toHaveLength(1));
    expect(pushed()[0]).toMatchObject({
      um_name: "search",
      search_scope: "instructor",
      entry_point: "hero",
    });
  });

  it("reports nothing when the form is invalid", async () => {
    render(<SearchForm variant="inline" />);
    fireEvent.change(screen.getByPlaceholderText(/ACCT1000/i), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(screen.getByText(/at least 4 characters/i)).toBeTruthy());
    expect(pushed()).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify the new cases fail**

Run: `npx vitest run tests/components/search-form.test.tsx`
Expected: FAIL — 新增的 3 个用例失败（`pushed()` 为空数组），既有的 2 个用例仍然通过。

- [ ] **Step 3: Write minimal implementation**

`components/search/search-form.tsx`：顶部 import 区加入

```tsx
import { trackSearch } from "@/lib/analytics/events";
```

把 `onSubmit` 改成

```tsx
  function onSubmit(values: z.infer<typeof formSchema>) {
    trackSearch({
      term: values.code,
      scope: values.is_prof ? "instructor" : "course",
      entryPoint: variant,
    });
    router.push(buildSearchPath(values.is_prof ? "instructor" : "course", values.code));
    onSubmitted?.();
  }
```

`variant` 的类型 `SearchFormVariant`（`"hero" | "header" | "inline" | "dialog"`）与 `SearchEntryPoint` 完全一致，无需断言或转换。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/search-form.test.tsx`
Expected: PASS（5 tests）。

- [ ] **Step 5: Commit**

```bash
git add components/search/search-form.tsx tests/components/search-form.test.tsx
git commit -m "feat(analytics): report search submissions with their entry point"
```

---

### Task 8: 接线列表卡片（`select_item` 事件）

**Files:**
- Modify: `components/course-card.tsx`（整文件重写，见下）
- Modify: `components/prof-card.tsx`（`ProfCard` 与 `ProfCourseCard`）
- Modify: `components/course-filter.tsx:103-109`（`renderItem` 传 `listName` / `position`）
- Modify: `app/search/instructor/[...name]/page.tsx:44-51`（`renderItem` 传 `listName` / `position`）
- Modify: `components/course/course-instructors.tsx:29-35`
- Modify: `app/professor/[...name]/page.tsx:33`
- Test: `tests/components/course-card-analytics.test.tsx`

**Interfaces:**
- Consumes: `TrackedItemLink`（Task 6）
- Produces:
  - `CourseCard(props: { data: any; listName: ItemListName; position: number })`
  - `ProfCard(props: { data: any; code: any; listName: ItemListName; position: number })`
  - `ProfCourseCard(props: { data: any; code: any; listName: ItemListName; position: number })`

- [ ] **Step 1: Write the failing test**

`tests/components/course-card-analytics.test.tsx`：

```tsx
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import CourseCard from "@/components/course-card";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

const COURSE = {
  New_code: "COMP1001",
  courseTitleEng: "Intro to Computing",
  courseTitleChi: "計算機導論",
  Credits: "3",
  Offering_Unit: "FST",
  Offering_Department: "CIS",
  Is_Offered: 1,
};

beforeEach(() => {
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
});

afterEach(cleanup);

describe("CourseCard analytics", () => {
  it("keeps linking to the course page", () => {
    render(<CourseCard data={COURSE} listName="catalog" position={4} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/course/COMP1001");
  });

  it("reports select_item with the list name, position and faculty", () => {
    render(<CourseCard data={COURSE} listName="search_course" position={4} />);
    fireEvent.click(screen.getByRole("link"));

    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "select_item",
        item_id: "COMP1001",
        item_list_name: "search_course",
        position: 4,
        faculty: "FST",
      },
    ]);
  });

  it("omits faculty when the course row has no Offering_Unit", () => {
    render(<CourseCard data={{ ...COURSE, Offering_Unit: undefined }} listName="catalog" position={0} />);
    fireEvent.click(screen.getByRole("link"));
    expect(pushed()[0]).not.toHaveProperty("faculty");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/course-card-analytics.test.tsx`
Expected: FAIL — `CourseCard` 目前不接受 `listName` / `position`，点击也不会推事件（TypeScript 报错 + 断言失败）。

- [ ] **Step 3: Write minimal implementation**

`components/course-card.tsx`（**完整文件**：只有最外层 `<Link>` 换成 `TrackedItemLink`、函数签名多两个 prop、import 两行，卡片内部一字不动）：

```tsx
import {Card, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import { TrackedItemLink } from "@/components/analytics/tracked-link";
import type { ItemListName } from "@/lib/analytics/events";


const CourseCard=({data, listName, position}:{data:any; listName: ItemListName; position: number})=>{
    return(
        <TrackedItemLink
            href={'/course/'+data.New_code}
            itemId={String(data.New_code ?? data.courseCode)}
            listName={listName}
            position={position}
            faculty={data.Offering_Unit ? String(data.Offering_Unit) : undefined}
        >
            <Card className='hover:cursor-pointer hover:shadow-lg mx-auto'>
                <CardHeader className='pb-2 flex-row flex justify-between align-middle'>
                    <div className=" space-y-1">
                        <CardTitle className='flex space-x-4'>

                                <div className="text-xl">
                                {data.New_code}
                                </div>
                                {
                                    parseInt(data.New_code[4])<=4 && (data.Is_Offered===1 ?
                                        <span className='text-success-foreground text-xs rounded-3xl bg-gradient-to-r from-success to-success h-fit py-0.5 px-2 shadow font-normal'> Offered</span>
                                        : null)
                                        // <div className='text-white text-xs rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>)
                                }
                            
                        </CardTitle>
                        <CardTitle className='text-base'>{data.courseTitleEng}</CardTitle>
                        <CardDescription>{data.courseTitleChi}</CardDescription>
                    </div>
                </CardHeader>
                <CardFooter className='bg-surface-subtle pt-2 pb-3'>
                    <div className='flex flex-row text-sm space-x-2 mb-0'>
                        <div>
                            <div className='font-light text-muted-foreground text-xs'>
                                Credits
                            </div>
                            <div>
                                {data.Credits}
                            </div>
                        </div>

                        {data.Offering_Department && (
                            <div>
                                <div className='font-light text-muted-foreground text-xs'>
                                    Dept.
                                </div>
                                <div>
                                    {data.Offering_Department}
                                </div>
                            </div>
                        )}

                        <div>
                            <div className='font-light text-muted-foreground text-xs'>
                                Faculty
                            </div>
                            <div>
                                {data.Offering_Unit}
                            </div>
                        </div>

                        <div>
                            <div className='font-light text-muted-foreground text-xs'>
                                Language
                            </div>
                            <div>
                                {data.Medium_of_Instruction}
                            </div>
                        </div>
                    </div>
                </CardFooter>
            </Card>
        </TrackedItemLink>
    )
}

export default CourseCard
```

`components/prof-card.tsx`（**完整文件**）：`import Link from "next/link";` 删掉，两个组件的外层 `<Link>` 换成 `TrackedItemLink` 并各加两个 prop；`ProfCard` 用 `itemId={String(data.prof_id)}`，`ProfCourseCard` 用 `itemId={String(data.course_id)}`，两者都**不带** `faculty`（讲师卡数据里没有学院字段）：

```tsx
import { TrackedItemLink } from "@/components/analytics/tracked-link";
import { RatingStatsCard } from "@/components/course/rating-stats-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ItemListName } from "@/lib/analytics/events";
import { getAppConfig } from "@/lib/config/app-config";
import { shouldShowOfferedBadge } from "@/lib/config/offered-badge";

function OfferedBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-success-foreground text-xs font-semibold rounded-3xl bg-gradient-to-r from-success to-success h-fit py-0.5 px-2 shadow font-normal">
      {children}
    </span>
  );
}

const ProfCard = async ({
  data,
  code,
  listName,
  position,
}: {
  data: any;
  code: any;
  listName: ItemListName;
  position: number;
}) => {
  const { isPreenrollmentOpen } = await getAppConfig();
  return (
    <TrackedItemLink
      href={"/reviews/" + code + "/" + data.prof_id}
      itemId={String(data.prof_id)}
      listName={listName}
      position={position}
    >
      <Card className="hover:cursor-pointer hover:shadow-lg">
        <CardHeader className="pb-0.5">
          <div className="flex flex-row justify-between">
            <div className="break-words">{data.prof_id}</div>
            <div className="text-white flex flex-col">
              {parseInt(code[4]) <= 4 &&
                shouldShowOfferedBadge(isPreenrollmentOpen, data.is_offered) && (
                  <OfferedBadge>Offered</OfferedBadge>
                )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RatingStatsCard stats={data} />
        </CardContent>
      </Card>
    </TrackedItemLink>
  );
};

export const ProfCourseCard = async ({
  data,
  code,
  listName,
  position,
}: {
  data: any;
  code: any;
  listName: ItemListName;
  position: number;
}) => {
  return (
    <TrackedItemLink
      href={"/reviews/" + code + "/" + data.prof_id}
      itemId={String(data.course_id)}
      listName={listName}
      position={position}
    >
      <Card className="hover:cursor-pointer hover:shadow-lg">
        <CardHeader className="pb-0.5">
          <div className="flex flex-row justify-between">
            <div className="break-words">{data.course_id}</div>
            <div className="text-white flex flex-col">
              {parseInt(code[4]) <= 4 &&
                (data.is_offered ? (
                  <OfferedBadge>Offered</OfferedBadge>
                ) : (
                  <div className="text-xs font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow">
                    Not Offered
                  </div>
                ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RatingStatsCard
            stats={data}
            labels={{ hard: "Easy", reward: "Outcome" }}
          />
        </CardContent>
      </Card>
    </TrackedItemLink>
  );
};

export default ProfCard;
```

四个调用点：

`components/course-filter.tsx`

```tsx
                {withAdSlots(currentCourseList, {
                    getKey: (course: any) => String(course.New_code ?? course.courseCode),
                    renderItem: (course: any, index: number) => (
                        <CourseCard
                            data={course}
                            key={course.New_code ?? course.courseCode}
                            listName={listName}
                            position={index}
                        />
                    ),
                    ads,
                })}
```

`app/search/instructor/[...name]/page.tsx`

```tsx
                                        renderItem: (course: any, index: number) => (
                                            <CourseCard data={course} key={index} listName="search_instructor" position={index} />
                                        ),
```

`components/course/course-instructors.tsx`

```tsx
          renderItem: (data, index) => (
            <ProfCard key={index} data={data} code={code} listName="course_instructors" position={index} />
          ),
```

`app/professor/[...name]/page.tsx`

```tsx
                        <ProfCourseCard
                            key={index}
                            data={course}
                            code={course.course_id}
                            listName="professor_courses"
                            position={index}
                        />
```

注意：`withAdSlots` 的 `renderItem(item, index)` 给的 `index` 是**原始数组下标**，广告位不会让它错位——这正是 `position` 的口径。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/course-card-analytics.test.tsx tests/components/tracked-item-link.test.tsx tests/ads tests/components`
Expected: PASS（含既有广告测试与瀑布流测试，确认没有回归）。

Run: `npx tsc --noEmit`
Expected: exit 0（四个调用点都补齐了 `listName` / `position`）。

- [ ] **Step 5: Commit**

```bash
git add components/course-card.tsx components/prof-card.tsx components/course-filter.tsx components/course/course-instructors.tsx "app/professor/[...name]/page.tsx" "app/search/instructor/[...name]/page.tsx" tests/components/course-card-analytics.test.tsx
git commit -m "feat(analytics): report card clicks with list name and position"
```

---

### Task 9: 接线 `CourseFilter` 与搜索结果页（`filter_apply` / `view_search_results`）

**Files:**
- Modify: `components/course-filter.tsx`（新增两个 prop、上报筛选、渲染结果上报组件）
- Modify: `app/catalog/[...departments]/page.tsx:47`
- Modify: `app/search/course/[code]/page.tsx:24`
- Modify: `app/search/instructor/[...name]/page.tsx`（两个分支都渲染 `TrackSearchResults`）
- Test: `tests/components/course-filter-analytics.test.tsx`

**Interfaces:**
- Consumes: `trackFilterApply`、`nextFilterState`、`applyCourseFilters`、`TrackSearchResults`、`ItemListName`、`SearchScope`
- Produces:
  - `CourseFilter(props: { data: any[]; ads: AdConfig | null; listName: ItemListName; trackResults?: { term: string; scope: SearchScope } })`

- [ ] **Step 1: Write the failing test**

`tests/components/course-filter-analytics.test.tsx`：

```tsx
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import CourseFilter from "@/components/course-filter";
import { courseKeysToCount } from "@/lib/count-unique-values";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

const CIS_COURSE = {
  New_code: "COMP1001",
  courseTitleEng: "A",
  courseTitleChi: "A",
  Credits: "3",
  Offering_Unit: "FST",
  Offering_Department: "CIS",
  Medium_of_Instruction: "English",
  Is_Offered: 1,
};

const ACC_COURSE = {
  New_code: "ACCT1000",
  courseTitleEng: "B",
  courseTitleChi: "B",
  Credits: "3",
  Offering_Unit: "FBA",
  Offering_Department: "ACC",
  Medium_of_Instruction: "Chinese",
  Is_Offered: 0,
};

/** Radix Select 需要这几个 DOM API 才能在 jsdom 里交互。 */
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
});

afterEach(cleanup);

/** 下拉的渲染顺序由 courseKeysToCount 决定（组件里就是按它 map 的）。 */
function openSelectFor(key: string): void {
  const combos = screen.getAllByRole("combobox") as HTMLButtonElement[];
  const combo = combos[courseKeysToCount.indexOf(key as (typeof courseKeysToCount)[number])];
  expect(combo, `combobox for ${key}`).toBeTruthy();
  fireEvent.click(combo);
}

describe("CourseFilter analytics", () => {
  it("reports filter_apply with the post-filter result count", async () => {
    render(<CourseFilter data={[CIS_COURSE, ACC_COURSE]} ads={null} listName="search_course" />);

    openSelectFor("Offering_Department");
    const option = (await screen.findAllByRole("option")).find((item) => item.textContent === "ACC");
    expect(option).toBeTruthy();
    fireEvent.click(option!);

    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "filter_apply",
        filter_name: "Offering_Department",
        filter_value: "ACC",
        result_count: 1,
      },
    ]);
    // 行为也真的生效了：只剩 ACC 那门课
    expect(screen.queryByText("COMP1001")).toBeNull();
    expect(screen.queryByText("ACCT1000")).toBeTruthy();
  });

  it("reports filter_apply when a dimension is cleared back to All", async () => {
    render(<CourseFilter data={[CIS_COURSE, ACC_COURSE]} ads={null} listName="search_course" />);

    openSelectFor("Offering_Department");
    fireEvent.click((await screen.findAllByRole("option")).find((item) => item.textContent === "ACC")!);

    openSelectFor("Offering_Department");
    fireEvent.click((await screen.findAllByRole("option")).find((item) => item.textContent === "All")!);

    expect(pushed()[1]).toMatchObject({
      filter_name: "Offering_Department",
      filter_value: "All",
      result_count: 2,
    });
  });

  it("reports the search results once when trackResults is provided", () => {
    render(
      <CourseFilter
        data={[CIS_COURSE, ACC_COURSE]}
        ads={null}
        listName="search_course"
        trackResults={{ term: "CIS", scope: "course" }}
      />,
    );

    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "view_search_results",
        search_term: "CIS",
        search_scope: "course",
        result_count: 2,
        has_results: 1,
      },
    ]);
  });

  it("reports zero results for an empty result set", () => {
    render(
      <CourseFilter data={[]} ads={null} listName="search_course" trackResults={{ term: "NOPE", scope: "course" }} />,
    );

    expect(pushed()).toHaveLength(1);
    expect(pushed()[0]).toMatchObject({ result_count: 0, has_results: 0 });
  });

  it("stays silent on the catalog page (no trackResults)", () => {
    render(<CourseFilter data={[CIS_COURSE, ACC_COURSE]} ads={null} listName="catalog" />);
    expect(pushed()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/course-filter-analytics.test.tsx`
Expected: FAIL — 组件还不接受 `listName` / `trackResults`，且不会推任何事件。

- [ ] **Step 3: Write minimal implementation**

`components/course-filter.tsx`（**完整文件**：新增两个 prop、状态改用纯函数、`onValueChange` 上报、顶部渲染结果上报组件；下拉的 JSX 结构与文案一字不动）：

```tsx
'use client'
import { useEffect, useState } from "react"
import { Masonry } from "@/components/masonry"
import CourseCard from "@/components/course-card"
import { TrackSearchResults } from "@/components/analytics/track-search-results"
import { trackFilterApply, type ItemListName, type SearchScope } from "@/lib/analytics/events"
import { withAdSlots, type AdConfig } from "@/lib/ads/ad-slots"
import { countUniqueValues, courseKeysToCount, CourseFilterName } from "@/lib/count-unique-values"
import {
    applyCourseFilters,
    createInitialFilterState,
    nextFilterState,
    type CourseFilterState,
} from "@/lib/course-filters"
import { SelectValue, Select, SelectTrigger, SelectContent, SelectGroup, SelectItem } from "@/components/ui/select"

type CourseFilterProps = {
    data: any[]
    ads: AdConfig | null
    listName: ItemListName
    /** 只有搜索结果页会传：传了就上报一次 view_search_results（目录页不传，因此不上报）。 */
    trackResults?: { term: string; scope: SearchScope }
}

export default function CourseFilter({ data, ads, listName, trackResults }: CourseFilterProps) {
    const [option, setOption] = useState<any>({})

    const [currentCourseList, setCurrentCourseList] = useState(data)

    const [filter, setFilter] = useState<CourseFilterState>(createInitialFilterState)

    useEffect(() => {
        const option = countUniqueValues(data, courseKeysToCount)
        //console.log(option.Offering_Unit)
        setOption(option)
    }, [data])

    useEffect(() => {
        setCurrentCourseList(applyCourseFilters(data, filter))

        if (typeof window === "undefined") return
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(filter)) {
            if (value !== "All") params.set(key, String(value))
        }
        const query = params.toString()
        window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname)
    }, [data, filter])


    return (
        <div>
            {trackResults ? (
                <TrackSearchResults
                    term={trackResults.term}
                    scope={trackResults.scope}
                    resultCount={data.length}
                />
            ) : null}
            <div className="grid grid-cols-2 md:grid-cols-6 my-4 gap-2">
                {
                    option[courseKeysToCount[0]] && courseKeysToCount.map((key, index) => {
                        return (
                            <div key={index} className="text-sm text-muted-foreground">
                                <div className="pb-1">
                                    {CourseFilterName[key]}
                                </div>
                                <Select disabled={option[key]?.length === 1} defaultValue={option[key][0]} onValueChange={(value) => {
                                    const next = nextFilterState(filter, key, value)
                                    trackFilterApply({
                                        name: key,
                                        value,
                                        resultCount: applyCourseFilters(data, next).length,
                                    })
                                    setFilter(next)
                                }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={CourseFilterName[key]} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            {
                                                option[key]?.length === 1 ? (
                                                    <SelectItem value={option[key][0]}>{option[key][0]}</SelectItem>
                                                ) : (
                                                    option[key]?.map((value: any, index: number) => {
                                                        return <SelectItem value={value} key={index}>{value}</SelectItem>
                                                    })
                                                )
                                            }
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                        )
                    })
                }
            </div>
            <Masonry col={3} className="mx-auto">
                {withAdSlots(currentCourseList, {
                    getKey: (course: any) => String(course.New_code ?? course.courseCode),
                    renderItem: (course: any, index: number) => (
                        <CourseCard
                            data={course}
                            key={course.New_code ?? course.courseCode}
                            listName={listName}
                            position={index}
                        />
                    ),
                    ads,
                })}
            </Masonry>
        </div>
    )
}
```

`app/catalog/[...departments]/page.tsx`

```tsx
                <CourseFilter data={courseList} ads={ads} listName="catalog" />
```

`app/search/course/[code]/page.tsx`

```tsx
    return(
        <div>
            <CourseFilter
                data={courseList}
                ads={ads}
                listName="search_course"
                trackResults={{ term: code, scope: "course" }}
            />
        </div>
    )
```

`app/search/instructor/[...name]/page.tsx`：在 `InstructorSearchResults` 里算出上报元素并在**两个分支**都渲染它：

```tsx
async function InstructorSearchResults({ name }: { name: string }) {
    const data = await fetchInstructorFuzzySearch(name)
    const trackResults = (
        <TrackSearchResults term={name} scope="instructor" resultCount={data.length} />
    )

    if (data.length === 0) {
        return (
            <div className="mt-20">
                {trackResults}
                <div className="text-xl font-semibold">No result found :(</div>
            </div>
        )
    }

    const ads = createAdConfig()

    return (
        <>
            {trackResults}
            <Accordion type="single" collapsible className="w-full">
                {/* …原有 Accordion 内容，卡片处按 Task 8 传入 listName="search_instructor" position={index}… */}
            </Accordion>
        </>
    )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/course-filter-analytics.test.tsx tests/course-filters.test.ts tests/components/course-card-analytics.test.tsx`
Expected: PASS（5 + 9 + 3 tests）。

- [ ] **Step 5: Commit**

```bash
git add components/course-filter.tsx "app/catalog/[...departments]/page.tsx" "app/search/course/[code]/page.tsx" "app/search/instructor/[...name]/page.tsx" tests/components/course-filter-analytics.test.tsx
git commit -m "feat(analytics): report filter changes and search result counts"
```

---

### Task 10: GTM 清单生成脚本与接线守卫

**Files:**
- Create: `scripts/print-analytics-manifest.mjs`
- Create: `docs/analytics/gtm-setup.md`（**完全由脚本生成，逐字比对**；不含任何手工追加内容）
- Test: `tests/analytics/wiring.test.ts`
- Modify: `package.json`（新增 script）

**Interfaces:**
- Consumes: `lib/analytics/registry-data.mjs`（Task 2）
- Produces:
  - `node scripts/print-analytics-manifest.mjs` → 写 `docs/analytics/gtm-setup.md`
  - `node scripts/print-analytics-manifest.mjs --check` → 不一致时 exit 1（防漂移测试用它）
  - `npm run analytics:manifest`

- [ ] **Step 1: Write the failing guard test**

`tests/analytics/wiring.test.ts`：

```ts
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DATA_LAYER_OWNER = "lib/analytics/data-layer.ts";

/**
 * GTM 引导脚本自身必然会引用 dataLayer 这个字面量（`dl=l!='dataLayer'`、
 * `})(window,document,'script','dataLayer',…)`），属于既有代码，不在守卫范围内。
 */
const DATA_LAYER_ALLOWED = [DATA_LAYER_OWNER, "app/layout.tsx"];

const CARD_FILES = ["components/course-card.tsx", "components/prof-card.tsx"];

const LIST_CALLERS = [
  "components/course-filter.tsx",
  "components/course/course-instructors.tsx",
  "app/professor/[...name]/page.tsx",
  "app/search/instructor/[...name]/page.tsx",
];

function source(file: string): string {
  return readFileSync(file, "utf8");
}

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

function allSourceFiles(): string[] {
  return [...collectSourceFiles("app"), ...collectSourceFiles("components"), ...collectSourceFiles("lib")];
}

describe("analytics wiring", () => {
  it("writes to the data layer from exactly one module", () => {
    const offenders = allSourceFiles()
      .filter((file) => !DATA_LAYER_ALLOWED.includes(file))
      .filter((file) => source(file).includes("dataLayer"));

    expect(offenders).toEqual([]);
  });

  it("never calls gtag directly", () => {
    const offenders = allSourceFiles().filter((file) => /\bgtag\s*\(/.test(source(file)));
    expect(offenders).toEqual([]);
  });

  it("routes every card link through the tracked link", () => {
    for (const file of CARD_FILES) {
      const text = source(file);
      expect(text, file).toContain("TrackedItemLink");
      expect(text, `${file} 不应再直接用 next/link`).not.toMatch(/from ["']next\/link["']/);
    }
  });

  it("passes a list name to every card list", () => {
    for (const file of LIST_CALLERS) {
      expect(source(file), file).toContain("listName");
    }
  });

  it("reports search results from both result surfaces", () => {
    expect(source("components/course-filter.tsx")).toContain("TrackSearchResults");
    expect(source("app/search/instructor/[...name]/page.tsx")).toContain("TrackSearchResults");
  });

  it("keeps the client tracking leaves free of callback props", () => {
    // server component 不能把函数当 prop 传给 client component，因此这两个叶子
    // 只能接收数据。出现 onClick 之类的回调 prop 说明设计被改坏了。
    for (const file of ["components/analytics/tracked-link.tsx", "components/analytics/track-search-results.tsx"]) {
      const text = source(file);
      expect(text, file).toContain('"use client"');
      expect(text, `${file} 不应声明回调 prop`).not.toMatch(/on[A-Z][A-Za-z]*\??:/);
    }
  });

  it("keeps the gtm manifest in sync with the registry", () => {
    const output = execFileSync(process.execPath, ["scripts/print-analytics-manifest.mjs", "--check"], {
      encoding: "utf8",
    });
    expect(output).toContain("in sync");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/analytics/wiring.test.ts`
Expected: FAIL — `scripts/print-analytics-manifest.mjs` 不存在（`execFileSync` 抛错），其余若干断言可能已通过。

- [ ] **Step 3: Write the manifest generator**

`scripts/print-analytics-manifest.mjs`：

```js
#!/usr/bin/env node
/**
 * 从 lib/analytics/registry-data.mjs 生成 GTM / GA4 手工配置清单。
 *
 * 用途：桥 A 唯一的静默失败点是"参数没在 GTM 容器里声明就丢失"，所以清单必须
 * 由注册表生成，而不是人手维护。`--check` 供 tests/analytics/wiring.test.ts 做
 * 防漂移断言（退出码 1 = 文档与注册表不一致）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ANALYTICS_EVENTS } from "../lib/analytics/registry-data.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = join(ROOT, "docs/analytics/gtm-setup.md");
const MEASUREMENT_ID = "G-V1KZT6Q50E";
const CONTAINER_ID = "GTM-KGF3BFS";

function variables() {
  const names = new Set(["um_name"]);
  for (const spec of Object.values(ANALYTICS_EVENTS)) {
    for (const [paramName, param] of Object.entries(spec.params)) {
      names.add(`${paramName}:${param.type === "number" ? "number" : "string"}`);
    }
  }
  return [...names].sort();
}

export function renderManifest() {
  const lines = [];

  lines.push("# GTM / GA4 手工配置清单（由脚本生成，勿手改）");
  lines.push("");
  lines.push(`> 生成命令：\`node scripts/print-analytics-manifest.mjs\`（校验：\`--check\`）`);
  lines.push(`> 数据源：\`lib/analytics/registry-data.mjs\`　容器：\`${CONTAINER_ID}\`　Measurement ID：\`${MEASUREMENT_ID}\``);
  lines.push("");
  lines.push("## 1. GTM 变量（变量 → 新建 → 数据层变量）");
  lines.push("");
  lines.push("| 变量名 | 数据层变量名称 | 类型 |");
  lines.push("|---|---|---|");
  for (const entry of variables()) {
    const [name, type] = entry.split(":");
    lines.push(`| \`DL - ${name}\` | \`${name}\` | ${type === "number" ? "数字" : "字符串"} |`);
  }
  lines.push("");
  lines.push("> 内置变量（变量 → 配置）需启用：`Page URL`、`Page Title`、`History Source`。");
  lines.push("");
  lines.push("## 2. GTM 触发器");
  lines.push("");
  lines.push("| 名称 | 类型 | 条件 |");
  lines.push("|---|---|---|");
  lines.push("| `Trigger - um_event` | 自定义事件 | 事件名称 **精确等于** `um_event` |");
  lines.push("| `Trigger - History Change` | 历史记录更改 | 附加上游过滤：`History Source` 不等于 `replaceState`（即 pushState 与 popstate 都触发；只写「等于 pushState」会丢掉浏览器后退/前进的 page_view，R17） |");
  lines.push("");
  lines.push("## 3. GTM 标签");
  lines.push("");
  lines.push("| 名称 | 类型 | 关键配置 | 触发器 |");
  lines.push("|---|---|---|---|");
  lines.push(`| \`GA4 Event - um_event\` | Google Analytics: GA4 事件 | Measurement ID = \`${MEASUREMENT_ID}\`；Event Name = \`{{DL - um_name}}\`；事件参数见下表；发送电子商务数据 **关闭** | \`Trigger - um_event\` |`);
  lines.push(`| \`Google Tag - SPA update\` | Google 标签 | ID = \`${MEASUREMENT_ID}\`；配置参数 \`page_location={{Page URL}}\`、\`page_title={{Page Title}}\`、\`update=true\` | \`Trigger - History Change\` |`);
  lines.push("");
  lines.push("## 4. GA4 事件标签的参数行（逐行照抄）");
  lines.push("");
  lines.push("| 参数名 | 值 |");
  lines.push("|---|---|");
  const paramNames = [...new Set(
    Object.values(ANALYTICS_EVENTS).flatMap((spec) => Object.keys(spec.params)),
  )].sort();
  for (const paramName of paramNames) {
    lines.push(`| \`${paramName}\` | \`{{DL - ${paramName}}}\` |`);
  }
  lines.push("");
  lines.push("## 5. GA4 后台");
  lines.push("");
  lines.push("1. 关闭 `管理 → 数据收集和修改 → 数据流 → 增强衡量 → 网页浏览 → 基于浏览器历史事件的页面变化`（否则与 §3 的 Google Tag 双计 page_view）。");
  lines.push("2. `管理 → 自定义定义 → 自定义维度`：把上表每个参数注册为**事件级**自定义维度（不注册则只能在 DebugView 看到）。");
  lines.push("3. 可选：把关键事件标记为转化。");
  lines.push("");
  lines.push("## 6. 事件字典（代码里的注册表）");
  lines.push("");
  for (const [eventName, spec] of Object.entries(ANALYTICS_EVENTS)) {
    lines.push(`### \`${eventName}\`（${spec.ga4 === "recommended" ? "GA4 推荐事件" : "自定义事件"}）`);
    lines.push("");
    lines.push(`- 目的：${spec.purpose}`);
    lines.push(`- 接线：${spec.wiring}`);
    lines.push("");
    lines.push("| 参数 | 类型 | 必需 | 说明 |");
    lines.push("|---|---|---|---|");
    for (const [paramName, param] of Object.entries(spec.params)) {
      lines.push(`| \`${paramName}\` | ${param.type} | ${param.required ? "是" : "否"} | ${param.note} |`);
    }
    lines.push("");
  }
  lines.push("## 7. 验收");
  lines.push("");
  lines.push("1. GTM 预览里逐条触发四个事件，确认标签被触发、`um_name` 解析成正确的事件名。");
  lines.push("2. GA4 DebugView 逐参数核对：每个参数都有值，**没有 not set**。");
  lines.push("3. 首屏 1 条 `page_view`；点课程卡后第 2 条；改筛选下拉**不产生** `page_view`；浏览器后退产生 1 条。");
  lines.push("4. 提交并**发布**容器版本后再回到线上复验一次。");
  lines.push("");

  return `${lines.join("\n")}\n`;
}

function main() {
  const rendered = renderManifest();
  const check = process.argv.includes("--check");

  if (check) {
    let current = "";
    try {
      current = readFileSync(TARGET, "utf8");
    } catch {
      console.error(`[analytics] ${TARGET} 不存在，请先运行 node scripts/print-analytics-manifest.mjs`);
      process.exit(1);
    }
    if (current !== rendered) {
      console.error("[analytics] docs/analytics/gtm-setup.md 与注册表不一致，请重新生成。");
      process.exit(1);
    }
    console.log("[analytics] gtm-setup.md is in sync with the registry");
    return;
  }

  writeFileSync(TARGET, rendered);
  console.log(`[analytics] wrote ${TARGET}`);
}

main();
```

- [ ] **Step 4: Generate the manifest and verify the guard passes**

Run: `mkdir -p docs/analytics && node scripts/print-analytics-manifest.mjs`
Expected: 输出 `[analytics] wrote …/docs/analytics/gtm-setup.md`。

生成的 `docs/analytics/gtm-setup.md` 不得手工追加任何内容（`--check` 逐字比对）；R1 的冒烟验证结论记录在 Task 11 的验证文档里。然后：

Run: `npx vitest run tests/analytics/wiring.test.ts`
Expected: PASS（7 tests）。

Run: `npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 5: Register the npm script and commit**

`package.json` 的 `scripts` 中，在 `"sync:um"` 之后加入：

```json
    "analytics:manifest": "node scripts/print-analytics-manifest.mjs"
```

Run: `npm run analytics:manifest`
Expected: 再次写出清单（幂等），`git status` 里 `docs/analytics/gtm-setup.md` 无变化。

```bash
git add scripts/print-analytics-manifest.mjs docs/analytics/gtm-setup.md tests/analytics/wiring.test.ts package.json
git commit -m "feat(analytics): generate the gtm manifest from the registry with drift guards"
```

---

### Task 11: 收尾验收（全量测试、构建、bundle 基线、验证文档）

**Files:**
- Create: `docs/superpowers/verification/2026-10-03-next-web-ga-analytics.md`

**Interfaces:**
- Consumes: 前 10 个 task 的全部产物
- Produces: 一份带证据的验证记录；Phase 1 可交付状态

- [ ] **Step 1: Run the full suite**

```bash
npm run test
```
Expected: 全绿；文件数 = 105 + 9（新增测试文件）= 114，测试数 ≥ 337 + 约 50。

```bash
npm run lint
npx tsc --noEmit
```
Expected: lint 无告警；tsc exit 0。

- [ ] **Step 2: Build and compare the client bundle against the baseline**

```bash
git stash list
npm run build
```

记录输出的 `First Load JS shared by all` 数值，与 `main` 基线的 87.6 kB 对比（AC3：增量必须 < 3 kB）。若超了，先查是不是有人把 `lib/analytics/*` 引进了 layout 或某个共享 chunk；埋点层应当只出现在真正用到它的页面 chunk 里。

- [ ] **Step 3: Write the verification document**

`docs/superpowers/verification/2026-10-03-next-web-ga-analytics.md`，至少包含：

```markdown
# GA Analytics (Phase 1) Verification — 2026-10-03

## Status

<实施范围、分支、是否已合并>

## Commits

<逐条列出>

## Commands run

- [x] `npm run test` — <文件数/用例数>
- [x] `npm run lint` — <结果>
- [x] `npx tsc --noEmit` — <结果>
- [x] `npm run build` — <First Load JS 数值 + 与基线差值>
- [x] `node scripts/print-analytics-manifest.mjs --check` — in sync

## Behavior verification

- [x] <每条 AC 对应的测试文件与断言>
- [ ] 人工（未完成项写清楚"谁来做、怎么做"）：GTM 容器配置 + GA4 增强衡量开关 + DebugView 逐参数核对 + 发布容器版本后线上复验

## Outstanding manual steps

<照抄 docs/analytics/gtm-setup.md 的步骤清单，标注责任人>
```

- [ ] **Step 4: Verify the manual checklist is complete and self-consistent**

Run: `node scripts/print-analytics-manifest.mjs --check`
Expected: `in sync`。

人工通读一遍 `docs/analytics/gtm-setup.md`，确认：变量表覆盖了所有注册参数、参数行覆盖了所有注册参数、上游过滤条件写清楚了、GA4 两个开关都写了。

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/verification/2026-10-03-next-web-ga-analytics.md
git commit -m "docs(analytics): phase 1 verification record"
```

---

## Phase 2（另行成计划）

Phase 2 的 8 个转化类事件（`review_submit` / `review_vote` / `review_reply` / `review_report` / `timetable_add_section` / `timetable_remove_section` / `timetable_share` / `login`）**不在本计划范围内**，定义见 spec §6.3。它会在 Phase 1 合并落地后另起一份计划文件 `docs/superpowers/plans/2026-10-03-next-web-ga-analytics-phase2.md`，因为：

- Phase 1 与 Phase 2 各自能独立交付、独立验收（Phase 1 合并后埋点层已经可用，Phase 2 只是往注册表加条目 + 加接线）；
- 一份覆盖两期的计划会超过 2500 行，执行者无法在一次会话里把它握在上下文里；
- Phase 2 的接线点（`submit-comment-form`、`comment-card`、`report-dialog`、`planner-provider`、`share-dialog`、`clerk-provider-client`）在 Phase 1 期间不会被改动，不会因拆分而失效。

Phase 2 计划必须复用 Phase 1 的既有机制，**不得引入新通道或新依赖**：
`registry-data.mjs` 加条目 → `events.ts` 加语义函数 → 接线点调用 → `npm run analytics:manifest` 重新生成清单 → 守卫测试（`tests/analytics/wiring.test.ts` 的"唯一写入口""无 gtag""清单防漂移"）自动覆盖新参数。

