# next-web 深色模式与品牌 logo 对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 next-web 的猫 logo 换成与 next-ios 一致的深色（浅色 `#003DB8` / 深色 `#FFFFFF`），并让整站（含 admin）支持 light / dark / system 三种主题。

**Architecture:** 用 `next-themes`（`attribute="class"`）在 `<html>` 上挂 `dark` 类驱动 `app/globals.css` 里 `:root` / `.dark` 两套 CSS 变量；把 54 个文件里 423 处硬编码 Tailwind 色阶收敛为语义 token 类（`bg-background` / `text-muted-foreground` / `text-brand-logo` …）。迁移完整度由守卫测试机械核验（扫描器剥离注释后提取完整颜色类 token，与精确放行清单比对），而不是靠人眼。

**Tech Stack:** Next.js 14.2（App Router）+ React 18.2 + TypeScript 5.2 + Tailwind CSS 3.3.3 + `next-themes@^0.2.1` + shadcn/ui（Radix）+ lucide-react + Vitest 2.1（`tests/components/**` 为 jsdom，其余为 node，**无 setupFiles、无 `@testing-library/jest-dom`**）。

**Spec:** `docs/superpowers/specs/2026-10-02-next-web-dark-mode-design.md`

## Global Constraints

以下约束对**每个任务**都隐式成立，逐字取自 spec：

- **默认主题 `light`**；可选值为 `light` / `dark` / `system`；持久化键 `umeh-theme`（`localStorage`）。
- **logo 颜色严格对齐 iOS**：`--brand-logo` 浅色 = `#003DB8`（等于 `cat-blue.svg` 的 `stroke`）、深色 = `#FFFFFF`（等于 `cat-white.svg` 的 `stroke`）。不许用其它蓝替代。
- **不改 `--primary`**：它被 `components/ui/button.tsx` 的默认 variant 使用，改它会全站默认按钮变蓝。品牌色一律走 `--brand` / `--brand-strong`。
- **`.dark` 块不重写**：保留既有 shadcn 深色值，只补齐 12 个新 token。
- **只替换颜色类**：迁移时禁止改动非颜色 utility（间距、字号、布局、断点），禁止改组件结构与文案。
- **不使用 `@testing-library/jest-dom`**（未安装）：断言用 `expect(...).toBe/toEqual/toBeNull/toContain` 与原生 DOM 查询。组件测试放在 `tests/components/`（唯一 jsdom 环境目录），其余测试放 `tests/`。
- **每个测试文件自行 `afterEach(cleanup)`**（无全局 setupFiles）。
- **主题不进入服务端产物**：不得为了主题读取 `headers()` / `cookies()`，不得改变任何 `revalidate` / `generateStaticParams` / `force-dynamic`。
- **已知限制（不在本轮修）**：Clerk 组件、AdSense 广告单元、fancyapps 灯箱、光栅图标（`favicon.png` / `icon/*.jpg` / `hero-*.jpg` / `banner.jpg`）、死代码 `components/timetable-calendar.tsx`。
- **四道质量门**：`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build`。
- **迁移量（已实测，不是估算）**：守卫口径下需迁移 **48 个文件 / 335 处**。spec §8 的原始 `grep` 清单是 54 个文件 / 423 处，差额 = 11 处仅存在于注释 + 77 处属 §5.6 放行项。另有 **6 个文件在守卫口径下为 0 处**（`app/layout.tsx` 命中全在注释里；`components/navbar-avatar.tsx`、`components/search.tsx`、`components/search/search-form.tsx`、`components/comments.tsx`、`app/professor/[...name]/page.tsx` 命中全是放行项）—— **不要**把它们写进 `PENDING`，否则 Task 8 的 stale 断言会失败。

### 颜色映射表（唯一权威；迁移任务只允许从中取值）

| 现有 token | 替换为 |
|---|---|
| `bg-white` | `bg-background` |
| `text-gray-900` / `text-black` / `text-gray-700` / `text-gray-800` / `text-slate-700` / `text-slate-800` | `text-foreground` |
| `text-gray-500` / `text-gray-600` / `text-slate-500` / `text-slate-600` | `text-muted-foreground` |
| `text-gray-400` / `text-slate-400` | `text-foreground-subtle` |
| `bg-gray-50` / `bg-slate-50` / `bg-gray-300/10` | `bg-surface-subtle` |
| `bg-slate-50/40` | `bg-surface-subtle/40` |
| `bg-gray-100` / `bg-slate-100` | `bg-muted` |
| `bg-gray-200` / `bg-zinc-200` / `hover:bg-gray-300` | `bg-surface-strong` / `hover:bg-surface-strong` |
| `border-slate-200` / `border-gray-200` | `border-border` |
| `border-slate-100` / `border-gray-100` | `border-border-subtle` |
| `border-gray-300` | `border-border-strong` |
| `text-blue-500` / `text-blue-600` / `text-indigo-500` | `text-brand` |
| `text-blue-700` / `text-blue-800` | `text-brand-strong` |
| `bg-blue-600` | `bg-brand` |
| `hover:bg-blue-700` | `hover:bg-brand-strong` |
| `bg-blue-50` / `bg-blue-100` / `bg-sky-100` | `bg-brand/10` |
| `text-sky-600` | `text-brand` |
| `border-sky-600` | `border-brand` |
| `hover:bg-blue-200` | `hover:bg-brand/20` |
| `text-red-400` / `text-red-500` / `text-red-600` / `text-red-700` | `text-destructive` |
| `bg-red-500` | `bg-destructive` |
| `bg-red-50` / `bg-red-100` | `bg-destructive/10` |
| `border-red-200` / `border-red-300` | `border-destructive/30` |
| `border-red-400` / `border-red-500` | `border-destructive` |
| `text-green-600` / `text-green-700` / `text-green-800` / `text-green-900` | `text-success` |
| `bg-green-100` | `bg-success/15` |
| `bg-green-50` | `bg-success/10` |
| `border-green-200` | `border-success/40` |
| `text-amber-600` / `text-amber-700` / `text-amber-800` | `text-warning` |
| `bg-amber-50` / `bg-amber-100` | `bg-warning/10` |
| `border-amber-300` | `border-warning/30` |
| `text-slate-100`（饱和渐变上的文字） | `text-white` |
| 字标渐变 `from-sky-500` / `from-sky-600` | `from-wordmark-from` |
| 字标渐变 `to-indigo-600` | `to-wordmark-to` |
| Offered 徽章 `from-green-600` / `to-green-600` | `from-success` / `to-success` |
| `dark:*` 双写（`dark:bg-gray-800` ×6、`dark:text-gray-300` ×5、`dark:text-white` ×4、`dark:border-gray-700` ×2、`dark:bg-gray-900` ×1） | **整段删除**（由 token 接管） |
| 以下 token 一律**保持原样**（守卫测试放行）：`text-white`、`text-white/80`、`bg-white/20`、`bg-white/25`、`bg-white/30`、`from-blue-600`、`to-indigo-500`、`from-teal-400`、`via-violet-400`、`to-blue-500`、`from-neutral-700`、`to-stone-900`、`from-purple-600`、`from-purple-500`、`to-blue-600`、`from-violet-500`、`to-fuchsia-500`、`from-blue-400`、`to-indigo-400` | 不变 |

---

## Task 1: 隔离工作区

**Files:**
- Create: `.worktrees/dark-mode/`（git worktree，`.worktrees` 已在 `.gitignore:57`）

**Interfaces:**
- Consumes: 无
- Produces: 后续所有任务都在 `<repo>/.worktrees/dark-mode` 下、分支 `feat/dark-mode` 上执行

- [ ] **Step 1: 确认当前不是 worktree**

Run: `cd /Users/box/UMHelper/next-web && GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P); GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P); [ "$GIT_DIR" = "$GIT_COMMON" ] && echo "普通检出" || echo "已在 worktree"`
Expected: `普通检出`

- [ ] **Step 2: 创建 worktree 与分支**

```bash
cd /Users/box/UMHelper/next-web
git worktree add .worktrees/dark-mode -b feat/dark-mode main
```

- [ ] **Step 3: 复用依赖（不重装）**

```bash
cd /Users/box/UMHelper/next-web/.worktrees/dark-mode
ln -s ../../node_modules node_modules
```

Expected: `ls -l node_modules` 显示指向 `../../node_modules` 的符号链接；`npx vitest --version` 能打印版本号。

- [ ] **Step 4: 验证基线是绿的**

Run: `cd /Users/box/UMHelper/next-web/.worktrees/dark-mode && npm test 2>&1 | tail -20`
Expected: 全部测试通过（**107 个测试文件 / 359 个用例**，已实测），无失败项。若此处已经失败，先停下报告，不要在红基线上开始。

---

## Task 2: 颜色 token 基础设施（T1 驱动）

**Files:**
- Test: `tests/theme-tokens.test.ts`（新建）
- Modify: `app/globals.css:6-36`（`:root`）、`app/globals.css:38-66`（`.dark`）
- Modify: `tailwind.config.js:18-52`（`colors`）

**Interfaces:**
- Consumes: 无
- Produces: CSS 变量 `--surface-subtle` `--surface-strong` `--subtle-foreground` `--border-subtle` `--border-strong` `--brand` `--brand-strong` `--brand-logo` `--wordmark-from` `--wordmark-to` `--success` `--warning`（两个作用域各有值）；Tailwind 类 `bg-surface-subtle` `bg-surface-strong` `text-foreground-subtle` `border-border-subtle` `border-border-strong` `text-brand` `bg-brand` `border-brand` `text-brand-strong` `bg-brand-strong` `text-brand-logo` `from-wordmark-from` `to-wordmark-to` `text-success` `from-success` `bg-success` `border-success` `text-warning` `bg-warning` `border-warning`

- [ ] **Step 1: 写失败测试**

Create `tests/theme-tokens.test.ts`：

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// §5.2 的 12 个新 token：两个作用域都必须有值
const NEW_TOKENS = [
  "--surface-subtle",
  "--surface-strong",
  "--subtle-foreground",
  "--border-subtle",
  "--border-strong",
  "--brand",
  "--brand-strong",
  "--brand-logo",
  "--wordmark-from",
  "--wordmark-to",
  "--success",
  "--warning",
];

// 只在 :root 定义的非颜色 token：纳入比较会误报
const NON_COLOR_EXCEPTIONS = ["--radius"];

const IOS_IMAGESET = join(
  process.cwd(),
  "..",
  "next-ios",
  "What2REG@UM",
  "Assets.xcassets",
  "CatLogo.imageset",
);

function css(): string {
  return readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
}

function blockOf(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`missing ${selector} block`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  return source.slice(open + 1, close);
}

function tokensOf(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of block.split("\n")) {
    const match = line.match(/^\s*(--[a-z-]+)\s*:\s*(.+?)\s*;?\s*$/);
    if (match) out.set(match[1], match[2]);
  }
  return out;
}

/** HSL 三元组（shadcn 约定，不带 hsl() 包裹）→ #RRGGBB；用于零容差比对 */
function hslToHex(value: string): string {
  const [h, s, l] = value.split(/\s+/).map((part) => Number.parseFloat(part));
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return (
    "#" +
    rgb
      .map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

describe("theme tokens", () => {
  it("defines the same color tokens in :root and .dark", () => {
    const source = css();
    const rootKeys = [...tokensOf(blockOf(source, ":root")).keys()]
      .filter((key) => !NON_COLOR_EXCEPTIONS.includes(key))
      .sort();
    const darkKeys = [...tokensOf(blockOf(source, ".dark")).keys()]
      .filter((key) => !NON_COLOR_EXCEPTIONS.includes(key))
      .sort();

    expect(darkKeys).toEqual(rootKeys);
  });

  it("defines every new token in both scopes", () => {
    const source = css();
    const root = tokensOf(blockOf(source, ":root"));
    const dark = tokensOf(blockOf(source, ".dark"));

    const missing = NEW_TOKENS.filter((token) => !root.has(token) || !dark.has(token));
    expect(missing).toEqual([]);
  });

  it("keeps --brand-logo byte-identical to the iOS cat assets", () => {
    const source = css();
    const root = tokensOf(blockOf(source, ":root"));
    const dark = tokensOf(blockOf(source, ".dark"));

    const lightHex = hslToHex(root.get("--brand-logo") ?? "");
    const darkHex = hslToHex(dark.get("--brand-logo") ?? "");
    expect(lightHex).toBe("#003DB8");
    expect(darkHex).toBe("#FFFFFF");

    const blue = join(IOS_IMAGESET, "cat-blue.svg");
    const white = join(IOS_IMAGESET, "cat-white.svg");
    if (existsSync(blue)) {
      expect(readFileSync(blue, "utf8")).toContain(`stroke="${lightHex}"`);
    }
    if (existsSync(white)) {
      expect(readFileSync(white, "utf8")).toContain(`stroke="${darkHex}"`);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/theme-tokens.test.ts`
Expected: FAIL —— `defines every new token in both scopes` 报 `missing` 含全部 12 个 token。

- [ ] **Step 3: 在 `:root` 补 12 个 token 并调整 3 个既有值**

把 `app/globals.css:8` 与 `:23`、`:22` 三行改为（其余不动）：

```css
    --foreground: 220.9 39.3% 11%;

    --muted: 220.9 14.3% 95.9%;
    --muted-foreground: 220.9 8.9% 46.1%;
```

然后把 `app/globals.css:35`（`--radius: 0.5rem;`）之前插入：

```css
    --surface-subtle: 210 20% 98%;
    --surface-strong: 220 13% 91%;
    --subtle-foreground: 218.5 10.6% 64.9%;

    --border-subtle: 210 40% 96.1%;
    --border-strong: 216 12.2% 83.9%;

    --brand: 221.2 83.2% 53.3%;
    --brand-strong: 224.3 76.3% 48%;
    --brand-logo: 220.1 100% 36.1%;

    --wordmark-from: 198.6 88.7% 48.4%;
    --wordmark-to: 243.4 75.4% 58.6%;

    --success: 142.1 76.2% 36.3%;
    --warning: 26 90.5% 37.1%;
```

- [ ] **Step 4: 在 `.dark` 补同样 12 个 token（值取深色）**

在 `app/globals.css:65`（`--ring: 212.7 26.8% 83.9%;`）之后插入：

```css
    --surface-subtle: 222.2 47.4% 9%;
    --surface-strong: 217.2 32.6% 24%;
    --subtle-foreground: 215 20.2% 45%;

    --border-subtle: 217.2 32.6% 12%;
    --border-strong: 217.2 32.6% 28%;

    --brand: 213.1 93.9% 67.8%;
    --brand-strong: 211.7 96.4% 78.4%;
    --brand-logo: 0 0% 100%;

    --wordmark-from: 198.4 93.2% 59.6%;
    --wordmark-to: 234.5 89.5% 74%;

    --success: 141.9 69.2% 58%;
    --warning: 43.3 96.4% 56.3%;
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/theme-tokens.test.ts`
Expected: PASS（3 个 case 全绿）。若 `:root` / `.dark` 键集合不一致，按提示补齐缺失的那个变量。

- [ ] **Step 6: 扩展 Tailwind 色板**

用以下内容替换 `tailwind.config.js:18-52` 的 `colors` 块（保留其余键）：

```js
      colors: {
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: "hsl(var(--border-subtle))",
          strong: "hsl(var(--border-strong))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: {
          DEFAULT: "hsl(var(--foreground))",
          subtle: "hsl(var(--subtle-foreground))",
        },
        surface: {
          subtle: "hsl(var(--surface-subtle))",
          strong: "hsl(var(--surface-strong))",
        },
        brand: {
          DEFAULT: "hsl(var(--brand))",
          strong: "hsl(var(--brand-strong))",
          logo: "hsl(var(--brand-logo))",
        },
        wordmark: {
          from: "hsl(var(--wordmark-from))",
          to: "hsl(var(--wordmark-to))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
```

- [ ] **Step 7: 验证嵌套色板没有破坏既有 DEFAULT 类**

Run: `npx tailwindcss -i app/globals.css -o /tmp/tw-probe.css --content './components/**/*.tsx' 2>&1 | tail -3; grep -cE '^\.border-border\b|^\.text-foreground\b' /tmp/tw-probe.css`
Expected: 无错误，且计数 > 0。这是 Step 6 唯一真正的回归风险：`colors.border` 与 `colors.foreground` 从字符串改成了带 `DEFAULT` 的对象，而全站与 `components/ui/**` 都依赖 `border-border` / `text-foreground`。新增 token 的类此刻还没有使用者，因此这一步不断言它们；Task 7 完成后可重跑本命令并 grep `text-brand-logo`，此时应 > 0。

- [ ] **Step 8: 跑全量测试与类型检查**

Run: `npm test 2>&1 | tail -5 && npx tsc --noEmit`
Expected: 全绿（token 改动不影响现有代码行为）。

- [ ] **Step 9: 提交**

```bash
git add app/globals.css tailwind.config.js tests/theme-tokens.test.ts
git commit -m "feat(theme): semantic color tokens for light and dark mode

Add 12 tokens to both :root and .dark, align --foreground/--muted/
--muted-foreground with the hardcoded Tailwind scales they replace, and
extend the Tailwind palette with nested DEFAULT keys. --brand-logo is
asserted byte-identical to the iOS cat-blue/cat-white stroke values."
```

---

## Task 3: ThemeProvider 接线（T3）

**Files:**
- Test: `tests/components/theme-provider.test.tsx`（新建）
- Create: `components/providers/theme-provider.tsx`
- Modify: `vitest.config.ts`（`esbuild: { jsx: "automatic" }`）
- Modify: `app/layout.tsx`（`<html>` 属性、Provider 包裹、import）

**Interfaces:**
- Consumes: 无
- Produces: `ThemeProvider({ children }: { children: React.ReactNode })`（`components/providers/theme-provider.tsx`）；`app/layout.tsx` 的最外层被 `ThemeProvider` 包裹；`vitest.config.ts` 的 JSX 转译与 Next 对齐（后续 T4/T5 渲染测试都依赖它）

- [ ] **Step 1: 让测试转译与 Next 的 JSX runtime 对齐**

`tsconfig.json` 的 `jsx` 是 `preserve`，vitest/esbuild 因此按**经典 runtime** 转译 JSX，而 Next 14 的组件普遍不写 `import React`（`components/navbar-list.tsx`、`components/footer.tsx` 都没有）。不加这一行，本任务与 T4/T5 的渲染测试都会在渲染期抛 `ReferenceError: React is not defined`。

`vitest.config.ts` 改为：

```ts
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    // …原有 alias 配置保持不变…
  },
  test: {
    // …原有 environment / environmentMatchGlobs / include / globals 保持不变…
  },
});
```

（备选方案"给被测组件补 `import React`"被否决 —— 那是为测试基建改动生产源码。）

Run: `npm test 2>&1 | tail -5`
Expected: **107 个测试文件 / 359 个用例全绿**（这一行不影响任何现有测试；已实测）。若确实出现失败，改为给 `components/navbar-list.tsx` 与 `components/footer.tsx` 各补一行 `import React from "react"`，然后继续本任务后续步骤。

- [ ] **Step 2: 写失败测试**

Create `tests/components/theme-provider.test.tsx`：

```tsx
import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { providerProps } = vi.hoisted(() => ({ providerProps: vi.fn() }));

// vi.mock 的工厂会被提升到所有 import 之前执行，此时 `React` 还没初始化，
// 因此工厂内必须动态 import react（与 tests/components/admin-entry.test.tsx 的写法一致），
// 否则会报 "ReferenceError: React is not defined"。
vi.mock("next-themes", async () => {
  const ReactModule = await import("react");
  return {
    ThemeProvider: (props: Record<string, unknown>) => {
      providerProps(props);
      return ReactModule.createElement("div", null, props.children as React.ReactNode);
    },
  };
});

import { ThemeProvider } from "@/components/providers/theme-provider";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ThemeProvider", () => {
  it("drives the class attribute with the agreed defaults", () => {
    render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement("span", { "data-testid": "child" }, "child"),
      ),
    );

    const props = providerProps.mock.calls[0][0];
    expect(props.attribute).toBe("class");
    expect(props.defaultTheme).toBe("light");
    expect(props.enableSystem).toBe(true);
    expect(props.disableTransitionOnChange).toBe(true);
    expect(props.storageKey).toBe("umeh-theme");
  });

  it("renders its children", () => {
    const view = render(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement("span", { "data-testid": "child" }, "child"),
      ),
    );

    expect(view.container.querySelector("[data-testid='child']")?.textContent).toBe("child");
  });

  it("marks <html> for hydration-safe theme scripting", () => {
    const layout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    expect(layout).toMatch(/<html[^>]*suppressHydrationWarning/);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/components/theme-provider.test.tsx`
Expected: FAIL —— 无法解析 `@/components/providers/theme-provider`（模块不存在）。

- [ ] **Step 4: 创建 Provider**

Create `components/providers/theme-provider.tsx`：

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import React from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      storageKey="umeh-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 5: 改 `app/layout.tsx`**

a) 在 `app/layout.tsx` 的 import 区加入（放在 `import { TimetablePlannerProvider } ...` 之后）：

```tsx
import { ThemeProvider } from '@/components/providers/theme-provider';
```

b) `<html lang="zh-Hant">` 改为：

```tsx
    <html lang="zh-Hant" suppressHydrationWarning>
```

c) `<body className={cn(inter.className)}>` → `<ClerkProviderClient>` 这一段外包一层 Provider：

```tsx
                <body className={cn(inter.className)}>
                    <ThemeProvider>
                    <ClerkProviderClient>
                    {/* …原有内容保持不变… */}
                    </ClerkProviderClient>
                    </ThemeProvider>
                </body>
```

注意：`ThemeProvider` 必须在 `ClerkProviderClient` **之外**，因为它同时要包住 `components/ui/sonner.tsx` 的 `<Toaster />`（`sonner` 调用 `useTheme`）。`</ThemeProvider>` 与既有 `</ClerkProviderClient>` 在同级缩进层收尾。

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run tests/components/theme-provider.test.tsx`
Expected: PASS（3 个 case）。

- [ ] **Step 7: 类型检查与构建冒烟**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: 无类型错误、全量测试通过。

- [ ] **Step 8: 提交**

```bash
git add vitest.config.ts components/providers/theme-provider.tsx app/layout.tsx tests/components/theme-provider.test.tsx
git commit -m "feat(theme): wire next-themes provider into the root layout

attribute=class, defaultTheme=light, enableSystem, storageKey=umeh-theme,
plus suppressHydrationWarning on <html> for the pre-hydration theme script.
Also align the vitest esbuild transform with Next's automatic JSX runtime so
tests can render components that do not import React."
```

---

## Task 4: 主题切换组件（T4）

**Files:**
- Test: `tests/components/theme-toggle.test.tsx`（新建）
- Create: `components/theme-toggle.tsx`

**Interfaces:**
- Consumes: `next-themes` 的 `useTheme()`
- Produces: `THEME_OPTIONS: { value: "light" | "dark" | "system"; label: string; Icon: LucideIcon }[]`、`ThemeOptions({ className? })`、`ThemeToggle()`（`components/theme-toggle.tsx`）

- [ ] **Step 1: 写失败测试**

Create `tests/components/theme-toggle.test.tsx`：

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { setTheme, useThemeMock } = vi.hoisted(() => ({
  setTheme: vi.fn(),
  useThemeMock: vi.fn(),
}));

vi.mock("next-themes", () => ({ useTheme: useThemeMock }));

import { ThemeOptions, ThemeToggle } from "@/components/theme-toggle";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ThemeOptions", () => {
  it("renders the three modes and marks the active one", () => {
    useThemeMock.mockReturnValue({ theme: "dark", setTheme });
    const view = render(React.createElement(ThemeOptions));

    const buttons = [...view.container.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Light", "Dark", "System"]);
    expect(buttons[1].getAttribute("aria-checked")).toBe("true");
    expect(buttons[0].getAttribute("aria-checked")).toBe("false");
  });

  it("sets the chosen theme exactly once", () => {
    useThemeMock.mockReturnValue({ theme: "light", setTheme });
    const view = render(React.createElement(ThemeOptions));

    fireEvent.click([...view.container.querySelectorAll("button")][1]);

    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledWith("dark");
  });
});

describe("ThemeToggle", () => {
  it("renders a hydration-safe placeholder before mount", () => {
    useThemeMock.mockReturnValue({ theme: undefined, resolvedTheme: undefined, setTheme });

    const html = renderToStaticMarkup(React.createElement(ThemeToggle));

    expect(html).toContain("h-9 w-9");
    expect(html).not.toContain("lucide-sun");
    expect(html).not.toContain("lucide-moon");
    expect(html).not.toContain("lucide-monitor");
  });

  it("renders the trigger after mount", () => {
    useThemeMock.mockReturnValue({ theme: "dark", resolvedTheme: "dark", setTheme });

    const view = render(React.createElement(ThemeToggle));

    expect(view.container.querySelector("[aria-label='Switch theme']")).toBeTruthy();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/components/theme-toggle.test.tsx`
Expected: FAIL —— 无法解析 `@/components/theme-toggle`。

- [ ] **Step 3: 实现组件**

Create `components/theme-toggle.tsx`：

```tsx
"use client";

import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ThemeValue = "light" | "dark" | "system";

export const THEME_OPTIONS: { value: ThemeValue; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * 三选项列表：桌面下拉之外，移动端侧边栏直接复用。
 * 不做 mounted 守卫 —— 服务端与首次客户端渲染的 theme 都是 undefined，
 * 两边输出一致，因此不会产生 hydration 不匹配。
 */
export function ThemeOptions({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {THEME_OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex items-center gap-2 rounded px-2 py-2 text-left text-sm text-foreground hover:bg-accent",
              active && "bg-accent font-medium text-brand-strong",
            )}
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // resolvedTheme 在挂载前是 undefined：先渲染等尺寸占位，避免图标在服务端与客户端不一致
  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden />;
  }

  const ActiveIcon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2 text-foreground" aria-label="Switch theme">
          <ActiveIcon size={20} strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEME_OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)} className="gap-2">
            <Icon size={16} strokeWidth={2} />
            <span>{label}</span>
            {theme === value ? <Check size={14} className="ms-auto" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/components/theme-toggle.test.tsx`
Expected: PASS（4 个 case）。若 `ThemeOptions` 的按钮文案断言失败，检查是否存在换行/空白导致的 `textContent` 差异（图标 svg 不影响 `textContent`）。

- [ ] **Step 5: 提交**

```bash
git add components/theme-toggle.tsx tests/components/theme-toggle.test.tsx
git commit -m "feat(theme): add ThemeToggle dropdown and reusable ThemeOptions"
```

---

## Task 5: 挂载切换入口（T7）

**Files:**
- Test: `tests/theme-mounts.test.ts`（新建）
- Modify: `components/navbar.tsx`、`components/mobile-sidebar.tsx`

**Interfaces:**
- Consumes: `ThemeToggle`、`ThemeOptions`（Task 4）
- Produces: 导航栏右侧按钮组顺序 `ThemeToggle` → `SearchButton` → `AdminEntry` → `NavbarAvatar`；`MobileSidebar` 的 `SheetContent` 顶部出现三选项

- [ ] **Step 1: 写失败测试**

Create `tests/theme-mounts.test.ts`：

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("theme entry mounts", () => {
  it("mounts the toggle in the navbar", () => {
    const navbar = read("components/navbar.tsx");
    expect(navbar).toContain('from "@/components/theme-toggle"');
    expect(navbar).toContain("<ThemeToggle />");
  });

  it("mounts the three theme options in the mobile sidebar", () => {
    const sidebar = read("components/mobile-sidebar.tsx");
    expect(sidebar).toContain('from "@/components/theme-toggle"');
    expect(sidebar).toContain("<ThemeOptions />");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/theme-mounts.test.ts`
Expected: FAIL（两个 case 都找不到 import）。

- [ ] **Step 3: 挂到导航栏**

`components/navbar.tsx`：加具名 import（Task 4 导出的是具名导出，**没有**默认导出），并在右侧按钮组最前插入 `<ThemeToggle />`：

```tsx
import { ThemeToggle } from "@/components/theme-toggle";
```

```tsx
                        <div className="flex flex-row space-x-3 items-center">
                            <ThemeToggle />
                            <SearchButton />
                            <AdminEntry />
                            <NavbarAvatar />
                        </div>
```

Task 5 Step 1 的测试正是按具名形式断言 `from "@/components/theme-toggle"`，无需改动测试。

- [ ] **Step 4: 挂到移动端侧边栏**

`components/mobile-sidebar.tsx`：加 import，并在 `SheetContent` 内、菜单列表**之前**插入：

```tsx
import { ThemeOptions } from "@/components/theme-toggle";
```

```tsx
                <SheetContent>
                    <div className="px-4 pt-6">
                        <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Theme
                        </div>
                        <ThemeOptions />
                    </div>
                    <div className="font-bold flex flex-col p-4 mt-4 space-y-4" onClick={()=>{
```

（原有 `<div className="font-bold ...">` 与其中的 onClick 逻辑不动。）

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/theme-mounts.test.ts && npx tsc --noEmit`
Expected: PASS（2 个 case）+ 无类型错误。

- [ ] **Step 6: 提交**

```bash
git add components/navbar.tsx components/mobile-sidebar.tsx tests/theme-mounts.test.ts
git commit -m "feat(theme): mount the theme switcher in the navbar and mobile sidebar"
```

---

## Task 6: 动态 `theme-color`（T6）

**Files:**
- Test: `tests/components/theme-color-meta.test.tsx`（新建）
- Create: `components/theme-color-meta.tsx`
- Modify: `app/layout.tsx`（`theme-color` 静态值、`apple-mobile-web-app-status-bar-style`、挂载 `<ThemeColorMeta />`）

**Interfaces:**
- Consumes: `next-themes` 的 `useTheme().resolvedTheme`
- Produces: `ThemeColorMeta()`（渲染 `null`，副作用改写 `meta[name="theme-color"]`）

- [ ] **Step 1: 写失败测试**

Create `tests/components/theme-color-meta.test.tsx`：

```tsx
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useThemeMock } = vi.hoisted(() => ({ useThemeMock: vi.fn() }));

vi.mock("next-themes", () => ({ useTheme: useThemeMock }));

import { ThemeColorMeta } from "@/components/theme-color-meta";

function ensureMeta(): HTMLMetaElement {
  const existing = document.head.querySelector("meta[name='theme-color']");
  if (existing) return existing as HTMLMetaElement;
  const created = document.createElement("meta");
  created.setAttribute("name", "theme-color");
  document.head.appendChild(created);
  return created;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.head.querySelector("meta[name='theme-color']")?.remove();
});

describe("ThemeColorMeta", () => {
  it("uses the light surface color for light", () => {
    const meta = ensureMeta();
    useThemeMock.mockReturnValue({ theme: "light", resolvedTheme: "light" });

    render(React.createElement(ThemeColorMeta));

    expect(meta.getAttribute("content")).toBe("#FFFFFF");
  });

  it("uses the dark background for dark", () => {
    const meta = ensureMeta();
    useThemeMock.mockReturnValue({ theme: "dark", resolvedTheme: "dark" });

    render(React.createElement(ThemeColorMeta));

    expect(meta.getAttribute("content")).toBe("#020817");
  });

  it("follows the system preference through resolvedTheme", () => {
    const meta = ensureMeta();
    useThemeMock.mockReturnValue({ theme: "system", resolvedTheme: "dark" });

    render(React.createElement(ThemeColorMeta));

    expect(meta.getAttribute("content")).toBe("#020817");
  });

  it("survives a missing meta tag", () => {
    useThemeMock.mockReturnValue({ theme: "dark", resolvedTheme: "dark" });

    expect(() => render(React.createElement(ThemeColorMeta))).not.toThrow();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/components/theme-color-meta.test.tsx`
Expected: FAIL —— 无法解析 `@/components/theme-color-meta`。

- [ ] **Step 3: 实现组件**

Create `components/theme-color-meta.tsx`：

```tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

const LIGHT = "#FFFFFF";
const DARK = "#020817";

/**
 * 直接改写 head 里那枚静态 meta，而不是用 React 渲染 meta：
 * 不依赖 React 的 head 提升行为，也不会产生重复 meta。
 * enableSystem 时 next-themes 已把系统偏好解析进 resolvedTheme，
 * 因此 system 模式天然跟随，无需自己订阅 matchMedia。
 */
export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const meta = document.querySelector("meta[name='theme-color']");
    if (!meta) return;
    meta.setAttribute("content", resolvedTheme === "dark" ? DARK : LIGHT);
  }, [resolvedTheme]);

  return null;
}
```

- [ ] **Step 4: 改 `app/layout.tsx` 的两枚 meta 并挂载组件**

`app/layout.tsx:43-44` 改为：

```tsx
                    <meta name='theme-color' content='#FFFFFF' />
                    <meta name='apple-mobile-web-app-status-bar-style' content='default' />
```

（原 `apple-mobile-web-app-status-bar-style` 写的是十六进制 `#2563EB`，不是该 meta 的合法取值，浏览器一直忽略它；合法值是 `default` / `black` / `black-translucent`。）

在 `<ThemeProvider>` 内的最前面挂载：

```tsx
                    <ThemeProvider>
                    <ThemeColorMeta />
                    <ClerkProviderClient>
```

并加 import：

```tsx
import { ThemeColorMeta } from '@/components/theme-color-meta';
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/components/theme-color-meta.test.tsx`
Expected: PASS（4 个 case）。

- [ ] **Step 6: 提交**

```bash
git add components/theme-color-meta.tsx app/layout.tsx tests/components/theme-color-meta.test.tsx
git commit -m "feat(theme): keep theme-color meta in sync and fix an invalid status bar value"
```

---

## Task 7: 品牌区 logo 与字标（T5）

**Files:**
- Test: `tests/components/brand-logo.test.tsx`（新建）
- Modify: `components/navbar-list.tsx:20-23`、`components/footer.tsx:20-22`、`components/banner.tsx:18,21`、`components/cs-banner.tsx:26`

**Interfaces:**
- Consumes: `--brand-logo` / `--wordmark-from` / `--wordmark-to`（Task 2）
- Produces: 猫图标与字标全部由 token 驱动，源码不再出现 `color='rgb(14 165 233)'` 与 `from-sky-500` / `from-sky-600` / `to-indigo-600`

- [ ] **Step 1: 写失败测试**

Create `tests/components/brand-logo.test.tsx`：

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 同 Task 3：mock 工厂先于 import 执行，工厂内必须动态 import react
vi.mock("next/link", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ href, children, ...props }: Record<string, unknown>) =>
      ReactModule.createElement(
        "a",
        { href: href as string, ...props },
        children as React.ReactNode,
      ),
  };
});

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: () => ({ activePlan: null }),
}));

import NavbarList from "@/components/navbar-list";
import Footer from "@/components/footer";

afterEach(() => cleanup());

describe("brand logo", () => {
  it("drives the cat icon from the brand-logo token", () => {
    const view = render(React.createElement(NavbarList));
    const svg = view.container.querySelector("svg");

    expect(svg?.getAttribute("class")).toContain("text-brand-logo");
    expect(svg?.getAttribute("color")).toBeNull();
  });

  it("uses wordmark gradient tokens in the navbar", () => {
    const view = render(React.createElement(NavbarList));
    const wordmark = view.container.querySelector(".bg-clip-text");

    const className = wordmark?.getAttribute("class") ?? "";
    expect(className).toContain("from-wordmark-from");
    expect(className).toContain("to-wordmark-to");
    expect(className).not.toContain("from-sky-500");
  });

  it("uses the same tokens in the footer", async () => {
    const html = renderToStaticMarkup(await Footer());

    expect(html).toMatch(/<svg[^>]*class="[^"]*text-brand-logo/);
    expect(html).toContain("from-wordmark-from");
    expect(html).toContain("to-wordmark-to");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/components/brand-logo.test.tsx`
Expected: FAIL —— `text-brand-logo` 不存在（现在是 `color='rgb(14 165 233)'`）、字标仍是 `from-sky-500`。

- [ ] **Step 3: 改 `components/navbar-list.tsx`**

第 20-23 行改为：

```tsx
                    <Cat size={24} strokeWidth={2} className="me-2 text-brand-logo"/>
                    <div className="self-center font-semibold whitespace-nowrap bg-gradient-to-r from-wordmark-from to-wordmark-to bg-clip-text text-transparent">
                    <div className="text-lg">What2Reg @UM</div>
                    <div className="text-xs">澳大選咩課</div>
                    </div>
```

（删掉 `color='rgb(14 165 233)'`：lucide 的 `stroke` 默认就是 `currentColor`，不传 `color` 时颜色由 CSS `color` 决定。）

- [ ] **Step 4: 改 `components/footer.tsx`**

第 20 行改为：

```tsx
                    <Cat size={24} strokeWidth={2} className="me-2 text-brand-logo"/>
```

第 22 行改为：

```tsx
                        <span className="self-center text-2xl font-semibold whitespace-nowrap bg-gradient-to-r from-wordmark-from to-wordmark-to bg-clip-text text-transparent">What2Reg @UM</span>
```

- [ ] **Step 5: 统一另两处字标渐变**

`components/cs-banner.tsx:26`：`from-sky-500 to-indigo-600` → `from-wordmark-from to-wordmark-to`。
`components/banner.tsx:18` 与 `:21`：`from-sky-600 to-indigo-600` → `from-wordmark-from to-wordmark-to`。

（这是 §5.7 S11 记录的浅色位移：`banner.tsx` 的 `sky-600` 会统一到 `sky-500`，全站字标蓝从两种变一种。）

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run tests/components/brand-logo.test.tsx`
Expected: PASS（3 个 case）。

- [ ] **Step 7: 全量测试 + 类型检查**

Run: `npm test 2>&1 | tail -5 && npx tsc --noEmit`
Expected: 全绿。

- [ ] **Step 8: 提交**

```bash
git add components/navbar-list.tsx components/footer.tsx components/banner.tsx components/cs-banner.tsx tests/components/brand-logo.test.tsx
git commit -m "feat(brand): match the iOS cat logo colors and tokenize the wordmark

The cat stroke now uses currentColor via text-brand-logo (#003DB8 light /
#FFFFFF dark, identical to the iOS cat-blue/cat-white assets) instead of a
hardcoded sky-500, and all five wordmark gradients share one token pair."
```

---

## Task 8: 守卫测试 T2 与迁移基线

**Files:**
- Test: `tests/no-light-only-colors.test.ts`（新建）

**Interfaces:**
- Consumes: 无
- Produces: `PENDING: string[]`（53 个未迁移文件）、`collectTokenViolations(): string[]`（返回 `file:line  token`）、`ALLOWED_TOKENS`、扫描器 `stripComments()`；后续每个迁移任务从 `PENDING` 删掉自己的文件，Task 16 清空该数组

- [ ] **Step 1: 写守卫测试（含 PENDING 基线）**

Create `tests/no-light-only-colors.test.ts`：

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOTS = ["app", "components"];

// components/ui 已是 token 化的 shadcn 原语；timetable-calendar.tsx 是死代码
// （唯一使用 @aldabil/react-scheduler 的文件，全仓库无人 import，课表页用的是自研 WeekGrid）
const EXCLUDED = ["components/ui", "components/timetable-calendar.tsx"];

// §5.6：这些颜色是刻意的（白字在饱和底上、品牌渐变两模式同值、装饰渐变）
const ALLOWED_TOKENS = [
  "text-white",
  "text-white/80",
  "bg-white/20",
  "bg-white/25",
  "bg-white/30",
  "from-blue-600",
  "to-indigo-500",
  "from-teal-400",
  "via-violet-400",
  "to-blue-500",
  "from-neutral-700",
  "to-stone-900",
  "from-purple-600",
  "from-purple-500",
  "to-blue-600",
  "from-violet-500",
  "to-fuchsia-500",
  "from-blue-400",
  "to-indigo-400",
];

const TOKEN_PATTERN =
  /\b(?:text|bg|border|from|via|to|ring|divide|placeholder|fill|stroke)-(?:white|black|gray|slate|zinc|neutral|stone|sky|blue|indigo|green|red|amber|teal|violet|fuchsia|purple)(?:-[0-9]+)?(?:\/[0-9]+)?/g;

// 尚未迁移的文件（守卫口径实测：48 个文件 / 335 处）。每个迁移任务从这里移除自己的文件；Task 16 清空。
// 注意：spec §8 的原始清单是 54 个文件，其中 6 个在守卫口径下为 0 处
// （app/layout.tsx 命中全在注释里；navbar-avatar / search / search-form / comments /
//  professor 页面 的命中全部是 §5.6 放行项），因此不在本列表中。
const PENDING: string[] = [
  "app/admin/layout.tsx",
  "app/admin/page.tsx",
  "app/admin/update/update-client.tsx",
  "app/catalog/[...departments]/page.tsx",
  "app/catalog/page.tsx",
  "app/not-found.tsx",
  "app/page.tsx",
  "app/sign-up/[[...sign-up]]/page.tsx",
  "app/timetable/page.tsx",
  "components/admin-entry.tsx",
  "components/admin/admin-admins-client.tsx",
  "components/admin/admin-comments-client.tsx",
  "components/admin/admin-course-notes-client.tsx",
  "components/admin/admin-courses-client.tsx",
  "components/admin/admin-infinite-scroll.tsx",
  "components/admin/admin-nav.tsx",
  "components/admin/admin-reports-client.tsx",
  "components/ads/ad-slot.tsx",
  "components/banner.tsx",
  "components/catalog-navigation.tsx",
  "components/comment-content.tsx",
  "components/course-card.tsx",
  "components/course-filter.tsx",
  "components/course/course-header.tsx",
  "components/course/course-instructors.tsx",
  "components/course/rating-stats-card.tsx",
  "components/cs-banner.tsx",
  "components/faculty-statistics.tsx",
  "components/footer.tsx",
  "components/legal-content.tsx",
  "components/loading-skeletons.tsx",
  "components/mobile-sidebar.tsx",
  "components/navbar-list.tsx",
  "components/navbar.tsx",
  "components/popular-courses.tsx",
  "components/prof-card.tsx",
  "components/report-dialog.tsx",
  "components/review/comment-card.tsx",
  "components/review/review-header.tsx",
  "components/submit/submit-comment-form.tsx",
  "components/timetable-schedule-card.tsx",
  "components/timetable/compare-client.tsx",
  "components/timetable/floating-planner.tsx",
  "components/timetable/plan-header.tsx",
  "components/timetable/planner-sidebar.tsx",
  "components/timetable/section-list.tsx",
  "components/timetable/share-dialog.tsx",
  "components/timetable/week-grid.tsx",
];

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

/** 剥离 JSX 注释、块注释与行注释：注释里的旧类名不该让守卫失败 */
function stripComments(source: string): string {
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

function isExcluded(file: string): boolean {
  return EXCLUDED.some((excluded) => file === excluded || file.startsWith(`${excluded}/`));
}

export function collectTokenViolations(): string[] {
  const violations: string[] = [];

  for (const root of ROOTS) {
    for (const file of collectFiles(root)) {
      if (isExcluded(file)) continue;
      const lines = stripComments(readFileSync(file, "utf8")).split("\n");

      lines.forEach((line, index) => {
        for (const match of line.matchAll(TOKEN_PATTERN)) {
          const token = match[0];
          if (ALLOWED_TOKENS.includes(token)) continue;
          violations.push(`${file}:${index + 1}  ${token}`);
        }
      });
    }
  }

  return violations;
}

describe("light-only color guard", () => {
  it("reports no violations outside the pending migration list", () => {
    const unexpected = collectTokenViolations().filter(
      (violation) => !PENDING.some((pending) => violation.startsWith(`${pending}:`)),
    );

    expect(unexpected).toEqual([]);
  });

  it("keeps the pending list free of stale entries", () => {
    const violations = collectTokenViolations();
    const stale = PENDING.filter(
      (pending) => !violations.some((violation) => violation.startsWith(`${pending}:`)),
    );

    expect(stale).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认通过（基线成立）**

Run: `npx vitest run tests/no-light-only-colors.test.ts`
Expected: PASS（2 个 case）。两个断言分别兜住两类错误：

- 第一个 case 报 unexpected → 有文件不在 `PENDING` 里却含裸色阶（本计划已按守卫实测值填好 48 项，正常应当为空）；
- 第二个 case 报 stale → `PENDING` 里有文件其实已经干净。**已知 `app/layout.tsx` 就是这种情况**（它的 3 处命中全在注释里，扫描器剥离注释后为 0），因此它**不在** `PENDING` 里；同理 `navbar-avatar.tsx` / `search.tsx` / `search-form.tsx` / `comments.tsx` / `app/professor/[...name]/page.tsx` 也都不在（命中全是放行项）。

- [ ] **Step 3: 确认守卫真的会失败（验证测试不是假绿）**

Run: `printf '<div className="bg-gray-500" />\n' > components/__guard_probe.tsx && npx vitest run tests/no-light-only-colors.test.ts 2>&1 | tail -12; rm components/__guard_probe.tsx`
Expected: FAIL，且失败信息里出现 `components/__guard_probe.tsx:1  bg-gray-500`。若没失败，说明扫描器有 bug（最可能是 `EXCLUDED` 匹配或注释剥离写错）。

- [ ] **Step 4: 全量测试**

Run: `npm test 2>&1 | tail -5`
Expected: 全绿（新增 2 个 case）。

- [ ] **Step 5: 提交**

```bash
git add tests/no-light-only-colors.test.ts
git commit -m "test(theme): guard against light-only color scales

Scans app plus components for full color-class tokens, stripping comments
first, and compares against the exact allowlist from the spec. The pending
list records the files this change is going to migrate, so every commit
stays green while completeness stays machine-checkable."
```

---

## Task 9: 迁移 A —— 导航与品牌

**Files:**
- Modify: `components/navbar.tsx`(2)、`components/navbar-list.tsx`(9)、`components/footer.tsx`(7)、`components/mobile-sidebar.tsx`(4)、`components/admin-entry.tsx`(3)、`components/banner.tsx`(6)、`components/cs-banner.tsx`(4) —— 共 7 个文件 / 35 处
- 本组无需改动：`components/navbar-avatar.tsx`（守卫口径 0 处，命中全是放行项）

**Interfaces:**
- Consumes: Global Constraints 的颜色映射表
- Produces: 这 7 个文件从 `PENDING` 清除；`components/navbar.tsx` 的容器改用 `bg-background border-b border-border`

- [ ] **Step 1: 记录迁移前的违规清单**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -E "components/(navbar|footer|mobile-sidebar|admin-entry|banner|cs-banner|navbar-list)" | sort | uniq -c`
Expected: 本组 35 处、按下表逐项处置：

| token | 次 | 替换为 |
|---|---|---|
| `to-indigo-600` | 5 | `to-wordmark-to` |
| `from-sky-500` | 3 | `from-wordmark-from` |
| `from-sky-600` | 2 | `from-wordmark-from` |
| `text-black` | 3 | `text-foreground` |
| `text-gray-900` | 3 | `text-foreground` |
| `text-slate-800` | 1 | `text-foreground` |
| `text-gray-500` | 2 | `text-muted-foreground` |
| `text-blue-500` | 3 | `text-brand` |
| `text-blue-700` | 2 | `text-brand-strong` |
| `bg-gray-100` | 3 | `bg-muted` |
| `bg-slate-100` | 2 | `bg-muted` |
| `bg-white` | 2 | `bg-background` |
| `bg-gray-50` | 1 | `bg-surface-subtle` |
| `bg-gray-300/10` | 1 | `bg-surface-subtle` |
| `border-gray-200` | 1 | `border-border` |
| `border-gray-100` | 1 | `border-border-subtle` |

（品牌渐变 `from-blue-600` / `to-indigo-500` 与 `text-white` 已被放行，不会出现在输出里 —— 保持不动。）

- [ ] **Step 2: 逐文件替换**

按上表把 8 个文件里的颜色类逐处替换。**只改颜色类**（间距/字号/布局/断点不动）。要点：

- `components/navbar.tsx:11`：`bg-white border-b border-gray-200` → `bg-background border-b border-border`。
- `components/footer.tsx:17`：`bg-gray-300/10` → `bg-surface-subtle`；`:44` 两处 `text-black` → `text-foreground`。
- `components/navbar-list.tsx:26`：`border-gray-100 ... bg-gray-50 ... md:bg-white` → `border-border-subtle ... bg-surface-subtle ... md:bg-background`。
- `components/admin-entry.tsx:40`：`text-gray-900 hover:bg-gray-100 hover:text-blue-500` → `text-foreground hover:bg-muted hover:text-brand`。
- `components/mobile-sidebar.tsx:36-37`：`text-blue-700` → `text-brand-strong`，`text-gray-900 hover:bg-gray-100 hover:text-blue-500` → `text-foreground hover:bg-muted hover:text-brand`。
- `components/banner.tsx:7`：`bg-slate-100 text-slate-800` → `bg-muted text-foreground`。

- [ ] **Step 3: 跑守卫测试确认本组清零**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -cE "components/(navbar|footer|mobile-sidebar|admin-entry|banner|cs-banner|navbar-list)"`
Expected: `0`

若仍有命中，按失败信息定位到具体 `file:line token` 并对照映射表修正。

- [ ] **Step 4: 从 PENDING 移除这 8 个文件**

编辑 `tests/no-light-only-colors.test.ts` 的 `PENDING`，删掉这 7 项：`components/admin-entry.tsx`、`components/banner.tsx`、`components/cs-banner.tsx`、`components/footer.tsx`、`components/mobile-sidebar.tsx`、`components/navbar-list.tsx`、`components/navbar.tsx`。

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/no-light-only-colors.test.ts`
Expected: PASS（2 个 case）。stale 断言会兜住"忘了删 PENDING 项"。

- [ ] **Step 6: 全量测试 + 类型检查 + 提交**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit
git add components/navbar.tsx components/navbar-list.tsx components/footer.tsx components/mobile-sidebar.tsx components/admin-entry.tsx components/banner.tsx components/cs-banner.tsx tests/no-light-only-colors.test.ts
git commit -m "refactor(theme): tokenize navbar, footer, banner and admin entry colors"
```

---

## Task 10: 迁移 B —— 首页 / 目录 / 教授

**Files:**
- Modify: `app/page.tsx`(24)、`app/not-found.tsx`(3)、`app/catalog/page.tsx`(4)、`app/catalog/[...departments]/page.tsx`(2)、`components/catalog-navigation.tsx`(20)、`components/faculty-statistics.tsx`(1)、`components/popular-courses.tsx`(1)、`components/prof-card.tsx`(2) —— 共 8 个文件 / 57 处
- 本组无需改动：`app/professor/[...name]/page.tsx`（守卫口径 0 处，命中全是放行项）

**Interfaces:**
- Consumes: 颜色映射表
- Produces: 本组 8 个文件从 `PENDING` 清除；本组所有 `dark:*` 双写（`dark:bg-gray-800` ×6、`dark:text-gray-300` ×4、`dark:border-gray-700` ×1、`dark:bg-gray-900` ×1）全部删除

- [ ] **Step 1: 记录迁移前的违规清单**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -E "app/page|app/not-found|app/catalog|components/(catalog-navigation|faculty-statistics|popular-courses|prof-card)" | sort | uniq -c`
Expected: 本组 57 处、按下表逐项处置：

| token | 次 | 替换为 |
|---|---|---|
| `text-gray-900` | 8 | `text-foreground` |
| `bg-gray-800` | 6 | **删除双写**（均为 `dark:bg-gray-800`） |
| `bg-white` | 5 | `bg-background`（`app/page.tsx` 的 Card 用 `bg-card`） |
| `text-blue-500` | 5 | `text-brand` |
| `bg-gray-100` | 4 | `bg-muted` |
| `bg-gray-200` | 4 | `bg-surface-strong` |
| `bg-zinc-200` | 4 | `bg-surface-strong` |
| `text-blue-700` | 4 | `text-brand-strong` |
| `text-gray-300` | 4 | **删除双写**（均为 `dark:text-gray-300`） |
| `text-gray-500` | 4 | `text-muted-foreground` |
| `text-gray-400` | 2 | `text-foreground-subtle` |
| `text-gray-800` | 2 | `text-foreground` |
| `bg-gray-900` | 1 | **删除双写**（`dark:bg-gray-900`） |
| `border-gray-700` | 1 | **删除双写**（`dark:border-gray-700`） |
| `border-gray-200` | 1 | `border-border` |
| `from-green-600` | 1 | `from-success` |
| `to-green-600` | 1 | `to-success` |

（`text-white` 7 处、`from-blue-600` / `to-indigo-500` / `to-blue-500` / `from-neutral-700` / `to-stone-900` 已被放行，不会出现在输出里 —— 保持不动。）

- [ ] **Step 2: 逐文件替换**

要点：

- `app/page.tsx`：4 处 `<Card className="... bg-white dark:bg-gray-800 ...">` → `bg-card`（`bg-gray-800` 双写删除；卡面用 `bg-card` 比 `bg-background` 更贴合 Card 语义）；`text-gray-900 dark:text-white` → `text-foreground`（双写删除）；`text-gray-500 dark:text-gray-300` → `text-muted-foreground`（双写删除）；`bg-zinc-200` → `bg-surface-strong`。
- `app/catalog/page.tsx:27`：`bg-white ... dark:border-gray-700 dark:bg-gray-900` → `bg-card border-border`（两个双写删除）。
- `components/prof-card.tsx`：Not Offered 徽章 `bg-gradient-to-r from-neutral-700 to-stone-900` **不动**；Offered 徽章 `from-green-600 to-green-600` → `from-success to-success`。
- `components/catalog-navigation.tsx`：`text-blue-700 bg-gray-200`（选中态，4 处）→ `text-brand-strong bg-surface-strong`；hover 态 `text-gray-900 hover:bg-gray-100 hover:text-blue-500` → `text-foreground hover:bg-muted hover:text-brand`。

- [ ] **Step 3: 跑守卫测试确认本组清零**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -cE "app/page|app/not-found|app/catalog|components/(catalog-navigation|faculty-statistics|popular-courses|prof-card)"`
Expected: `0`

- [ ] **Step 4: 从 PENDING 移除这 8 个文件**

`app/page.tsx`、`app/not-found.tsx`、`app/catalog/page.tsx`、`app/catalog/[...departments]/page.tsx`、`components/catalog-navigation.tsx`、`components/faculty-statistics.tsx`、`components/popular-courses.tsx`、`components/prof-card.tsx`。

- [ ] **Step 5: 全量测试 + 类型检查 + 提交**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit
git add app/page.tsx app/not-found.tsx app/catalog components/catalog-navigation.tsx components/faculty-statistics.tsx components/popular-courses.tsx components/prof-card.tsx tests/no-light-only-colors.test.ts
git commit -m "refactor(theme): tokenize home, catalog and professor surfaces"
```

---

## Task 11: 迁移 C —— 课程与搜索

**Files:**
- Modify: `components/course-card.tsx`(7)、`components/course/course-header.tsx`(2)、`components/course/course-instructors.tsx`(1)、`components/course/rating-stats-card.tsx`(6)、`components/course-filter.tsx`(1)、`components/comment-content.tsx`(3) —— 共 6 个文件 / 20 处
- 本组无需改动：`components/search.tsx`、`components/search/search-form.tsx`、`components/comments.tsx`（守卫口径均 0 处）

**Interfaces:**
- Consumes: 颜色映射表
- Produces: 本组 6 个文件从 `PENDING` 清除

- [ ] **Step 1: 记录迁移前的违规清单**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -E "components/(course-card|course-filter|course/|comment-content)" | sort | uniq -c`
Expected: 本组 20 处、按下表逐项处置：

| token | 次 | 替换为 |
|---|---|---|
| `text-gray-400` | 5 | `text-foreground-subtle` |
| `text-gray-500` | 4 | `text-muted-foreground` |
| `from-green-600` | 2 | `from-success` |
| `to-green-600` | 2 | `to-success` |
| `text-slate-600` | 1 | `text-muted-foreground` |
| `text-black` | 1 | `text-foreground` |
| `text-indigo-500` | 1 | `text-brand` |
| `text-amber-800` | 1 | `text-warning` |
| `bg-amber-50` | 1 | `bg-warning/10` |
| `border-amber-300` | 1 | `border-warning/30` |
| `bg-gray-50` | 1 | `bg-surface-subtle` |

（`text-white` 6 处、`text-white/80` 3 处、`from-blue-600` / `to-indigo-500` / `from-blue-400` / `to-indigo-400` / `from-neutral-700` / `to-stone-900` 已被放行，不会出现在输出里 —— 保持不动。）

- [ ] **Step 2: 逐文件替换**

要点：

- `components/course-card.tsx:18`：`from-green-600 to-green-600` → `from-success to-success`（Offered 徽章）。
- `components/course-header.tsx:47`、`components/review/review-header.tsx`（Task 12）同样处理 Offered 徽章。
- `components/comment-content.tsx:17`：`border-amber-300 bg-amber-50 text-amber-800` → `border-warning/30 bg-warning/10 text-warning`（去重标记徽章）。
- `components/course/course-instructors.tsx:20`：`text-indigo-500` → `text-brand`。

- [ ] **Step 3: 跑守卫测试确认本组清零**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -cE "components/(course-card|course-filter|course/|comment-content)"`
Expected: `0`

- [ ] **Step 4: 从 PENDING 移除这 6 个文件**

`components/course-card.tsx`、`components/course/course-header.tsx`、`components/course/course-instructors.tsx`、`components/course/rating-stats-card.tsx`、`components/course-filter.tsx`、`components/comment-content.tsx`。

（`components/search.tsx`、`components/search/search-form.tsx`、`components/comments.tsx` 本就不在 `PENDING` 里 —— 守卫口径下它们是 0 处。）

- [ ] **Step 5: 全量测试 + 类型检查 + 提交**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit
git add components/course-card.tsx components/course components/course-filter.tsx components/comment-content.tsx tests/no-light-only-colors.test.ts
git commit -m "refactor(theme): tokenize course cards and comment chrome"
```

---

## Task 12: 迁移 D —— 评论

**Files:**
- Modify: `components/review/comment-card.tsx`(39)、`components/review/review-header.tsx`(9)、`components/report-dialog.tsx`(2) —— 共 3 个文件 / 50 处

**Interfaces:**
- Consumes: 颜色映射表
- Produces: 本组 3 个文件从 `PENDING` 清除；折叠标记徽章统一到品牌色系

- [ ] **Step 1: 记录迁移前的违规清单**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -E "components/(review|report-dialog)" | sort | uniq -c`
Expected: 本组 50 处、按下表逐项处置：

| token | 次 | 替换为 |
|---|---|---|
| `text-gray-400` | 10 | `text-foreground-subtle` |
| `text-blue-500` | 6 | `text-brand` |
| `text-gray-800` | 5 | `text-foreground` |
| `bg-gray-200` | 4 | `bg-surface-strong` |
| `bg-white` | 4 | `bg-background` |
| `border-gray-300` | 3 | `border-border-strong` |
| `bg-blue-200` | 2 | `hover:bg-brand/20`（原文为 `hover:bg-blue-200`） |
| `bg-sky-100` | 2 | `bg-brand/10` |
| `border-sky-600` | 2 | `border-brand` |
| `text-blue-800` | 2 | `text-brand-strong` |
| `text-sky-600` | 2 | `text-brand` |
| `bg-gray-100` | 1 | `bg-muted` |
| `bg-gray-300` | 1 | `hover:bg-surface-strong`（原文为 `hover:bg-gray-300`） |
| `bg-gray-50` | 1 | `bg-surface-subtle` |
| `text-gray-500` | 1 | `text-muted-foreground` |
| `text-red-500` | 1 | `text-destructive` |
| `text-green-600` | 1 | `text-success` |
| `from-green-600` | 1 | `from-success` |
| `to-green-600` | 1 | `to-success` |

（`text-white` 4 处、`from-blue-600` / `to-indigo-500` 各 4 处已被放行，不会出现在输出里 —— 保持不动。）

- [ ] **Step 2: 逐文件替换**

要点：

- `components/review/comment-card.tsx:473` 与 `:508` 两处折叠标记徽章：`bg-sky-100 text-sky-600 border-sky-600 border hover:bg-blue-200` → `bg-brand/10 text-brand border-brand border hover:bg-brand/20`（§5.7 S12 的浅色位移：青蓝统一到品牌蓝）。
- `components/review/review-header.tsx:64,73`：`bg-white text-blue-800 hover:bg-gray-200` → `bg-background text-brand-strong hover:bg-surface-strong`。
- `components/review/review-header.tsx:59`：Offered 徽章 `from-green-600 to-green-600` → `from-success to-success`。
- `components/report-dialog.tsx:79`：`text-gray-400 hover:text-red-500` → `text-foreground-subtle hover:text-destructive`。
- 该文件（`comment-card.tsx`）含 Fancybox 灯箱调用，第 115 行是注释里的旧类名 —— **不要**动注释（Task 8 的扫描器已剥离注释）。

- [ ] **Step 3: 跑守卫测试确认本组清零**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -cE "components/(review|report-dialog)"`
Expected: `0`

- [ ] **Step 4: 从 PENDING 移除这 3 个文件**

`components/review/comment-card.tsx`、`components/review/review-header.tsx`、`components/report-dialog.tsx`。

- [ ] **Step 5: 全量测试 + 类型检查 + 提交**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit
git add components/review components/report-dialog.tsx tests/no-light-only-colors.test.ts
git commit -m "refactor(theme): tokenize review cards and report dialog"
```

---

## Task 13: 迁移 E —— 课表

**Files:**
- Modify: `components/timetable/planner-sidebar.tsx`(23)、`components/timetable/floating-planner.tsx`(17)、`components/timetable/compare-client.tsx`(16)、`components/timetable/plan-header.tsx`(8)、`components/timetable/section-list.tsx`(9)、`components/timetable/week-grid.tsx`(4)、`components/timetable/share-dialog.tsx`(1)、`components/timetable-schedule-card.tsx`(3)、`app/timetable/page.tsx`(7) —— 共 9 个文件 / 88 处

**Interfaces:**
- Consumes: 颜色映射表
- Produces: 本组 9 个文件从 `PENDING` 清除；冲突/共同空闲状态统一到 `--destructive` / `--success`

- [ ] **Step 1: 记录迁移前的违规清单**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -E "components/timetable|timetable-schedule-card|app/timetable" | sort | uniq -c`
Expected: 本组 88 处、按下表逐项处置：

| token | 次 | 替换为 |
|---|---|---|
| `border-slate-200` | 20 | `border-border` |
| `text-slate-500` | 17 | `text-muted-foreground` |
| `text-slate-400` | 3 | `text-foreground-subtle` |
| `text-slate-600` | 2 | `text-muted-foreground` |
| `text-slate-700` | 1 | `text-foreground` |
| `text-slate-100` | 1 | `text-white` |
| `bg-white` | 9 | `bg-background` |
| `border-slate-100` | 7 | `border-border-subtle` |
| `bg-slate-50` | 5 | `bg-surface-subtle` |
| `bg-slate-100` | 3 | `bg-muted` |
| `text-red-600` | 4 | `text-destructive` |
| `bg-red-500` | 2 | `bg-destructive` |
| `border-red-200` | 1 | `border-destructive/30` |
| `border-red-400` | 1 | `border-destructive` |
| `border-red-500` | 1 | `border-destructive` |
| `text-green-700` | 1 | `text-success` |
| `text-green-800` | 1 | `text-success` |
| `text-green-900` | 1 | `text-success` |
| `bg-green-50` | 1 | `bg-success/10` |
| `border-green-200` | 1 | `border-success/40` |
| `bg-blue-600` | 4 | `bg-brand` |
| `hover:bg-blue-700` | 1 | `hover:bg-brand-strong` |
| `text-gray-500` | 1 | `text-muted-foreground` |

（`text-white` 7 处、`to-blue-500` / `to-blue-600` 各 1 处已被放行，不会出现在输出里 —— 保持不动。`text-slate-100` 是唯一一处需要改成 `text-white` 的饱和渐变文字。）

- [ ] **Step 2: 逐文件替换**

要点：

- `components/timetable/compare-client.tsx:92,93,97`：`border-green-200 bg-green-50` → `border-success/40 bg-success/10`；`text-green-800` / `text-green-900` → `text-success`（§5.7 S13）。
- `components/timetable/section-list.tsx:31`：`border-red-400` → `border-destructive`。
- `components/timetable/week-grid.tsx:69`：`border-red-500` → `border-destructive`。
- `components/timetable/floating-planner.tsx:32`：`border-slate-200 bg-white text-slate-700` → `border-border bg-background text-foreground`；`:79` `bg-blue-600 ... hover:bg-blue-700` → `bg-brand ... hover:bg-brand-strong`；`:37,:83` `bg-red-500 ... text-white` → `bg-destructive ... text-white`（`text-white` 保留）。
- `components/timetable-schedule-card.tsx:108`：外观渐变 `from-purple-600 to-blue-600 ... text-slate-100 hover:from-purple-500 hover:to-blue-500` → **渐变保持不动**，只把 `text-slate-100` 改为 `text-white`。

- [ ] **Step 3: 跑守卫测试确认本组清零**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -cE "components/timetable|timetable-schedule-card|app/timetable"`
Expected: `0`

- [ ] **Step 4: 从 PENDING 移除这 9 个文件**

`components/timetable/planner-sidebar.tsx`、`components/timetable/floating-planner.tsx`、`components/timetable/compare-client.tsx`、`components/timetable/plan-header.tsx`、`components/timetable/section-list.tsx`、`components/timetable/week-grid.tsx`、`components/timetable/share-dialog.tsx`、`components/timetable-schedule-card.tsx`、`app/timetable/page.tsx`。

- [ ] **Step 5: 全量测试 + 类型检查 + 提交**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit
git add components/timetable components/timetable-schedule-card.tsx app/timetable tests/no-light-only-colors.test.ts
git commit -m "refactor(theme): tokenize the timetable planner surfaces"
```

---

## Task 14: 迁移 F —— 法务 / 提交 / 骨架屏 / 广告位

**Files:**
- Modify: `components/legal-content.tsx`(8)、`components/ads/ad-slot.tsx`(3)、`components/submit/submit-comment-form.tsx`(1)、`components/loading-skeletons.tsx`(1)、`app/sign-up/[[...sign-up]]/page.tsx`(1) —— 共 5 个文件 / 14 处

**Interfaces:**
- Consumes: 颜色映射表
- Produces: 本组 5 个文件从 `PENDING` 清除；`loading-skeletons.tsx` 的 `bg-white/NN` 灰度条**保持白色**（放行项）

- [ ] **Step 1: 记录迁移前的违规清单**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -E "legal-content|submit-comment-form|loading-skeletons|sign-up|ads/ad-slot" | sort | uniq -c`
Expected: 本组 14 处、按下表逐项处置：

| token | 次 | 替换为 |
|---|---|---|
| `bg-gray-800` | 1 | **删除双写**（`dark:hover:bg-gray-800`） |
| `text-gray-300` | 1 | **删除双写**（`dark:text-gray-300`） |
| `border-gray-700` | 1 | **删除双写**（`dark:border-gray-700`） |
| `text-blue-600` | 1 | `text-brand` |
| `text-blue-800` | 1 | `text-brand-strong` |
| `text-slate-400` | 1 | `text-foreground-subtle` |
| `text-gray-700` | 1 | `text-foreground` |
| `text-red-400` | 1 | `text-destructive` |
| `bg-red-500` | 1 | `bg-destructive` |
| `bg-gray-50` | 1 | `bg-surface-subtle` |
| `bg-gray-100` | 1 | `bg-muted` |
| `border-slate-200` | 1 | `border-border` |
| `border-gray-300` | 1 | `border-border-strong` |
| `bg-slate-50/40` | 1 | `bg-surface-subtle/40` |

（`bg-white/20|25|30` 共 16 处、`text-white` 1 处、`from-blue-600` / `to-indigo-500` / `from-violet-500` / `to-fuchsia-500` 已被放行，不会出现在输出里 —— 保持不动。注意 `loading-skeletons.tsx` 在守卫口径下只有 **1 处**需要改，其余 16 处白条是放行项。）

- [ ] **Step 2: 逐文件替换**

要点：

- `components/legal-content.tsx:23`：去掉三个 `dark:` 双写（`dark:border-gray-700`、`dark:text-gray-300`、`dark:hover:bg-gray-800`），并把 `border-gray-300 text-gray-700 hover:bg-gray-100` → `border-border-strong text-foreground hover:bg-muted`；`:53` `text-blue-600 ... hover:text-blue-800` → `text-brand ... hover:text-brand-strong`。该文件的 8 处正好是本组的大头。
- `components/ads/ad-slot.tsx:43`：`border-slate-200 bg-slate-50/40` → `border-border bg-surface-subtle/40`；该文件第 40 行附近的 `text-slate-400` → `text-foreground-subtle`。
- `components/submit/submit-comment-form.tsx:380`：`text-red-400` → `text-destructive`。
- `app/sign-up/[[...sign-up]]/page.tsx:10`：`bg-red-500 ... text-white` → `bg-destructive ... text-white`（`text-white` 保留）。
- `components/loading-skeletons.tsx`：本文件只需改 **1 处** —— `bg-gray-50`（`GridSkeleton` 的空态底）→ `bg-surface-subtle`；`bg-white/20|25|30` 共 16 处**保持不动**（它们叠在 `from-blue-600 to-indigo-500` 的品牌蓝渐变头部上，深浅两种模式都该是白）。

- [ ] **Step 3: 跑守卫测试确认本组清零**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -cE "legal-content|submit-comment-form|loading-skeletons|sign-up|ads/ad-slot"`
Expected: `0`

- [ ] **Step 4: 从 PENDING 移除这 5 个文件**

`components/legal-content.tsx`、`components/submit/submit-comment-form.tsx`、`components/loading-skeletons.tsx`、`app/sign-up/[[...sign-up]]/page.tsx`、`components/ads/ad-slot.tsx`。

- [ ] **Step 5: 全量测试 + 类型检查 + 提交**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit
git add components/legal-content.tsx components/submit components/loading-skeletons.tsx "app/sign-up" components/ads/ad-slot.tsx tests/no-light-only-colors.test.ts
git commit -m "refactor(theme): tokenize legal, submit, skeleton and ad slot surfaces"
```

---

## Task 15: 迁移 G —— admin 控制台

**Files:**
- Modify: `app/admin/update/update-client.tsx`(24)、`components/admin/admin-reports-client.tsx`(13)、`components/admin/admin-comments-client.tsx`(8)、`app/admin/page.tsx`(6)、`components/admin/admin-course-notes-client.tsx`(5)、`components/admin/admin-courses-client.tsx`(5)、`components/admin/admin-nav.tsx`(5)、`components/admin/admin-admins-client.tsx`(3)、`app/admin/layout.tsx`(1)、`components/admin/admin-infinite-scroll.tsx`(1) —— 共 10 个文件 / 71 处

**Interfaces:**
- Consumes: 颜色映射表
- Produces: 本组 10 个文件从 `PENDING` 清除；admin 在深色下也是完整深色（无"深壳 + 白块"）

- [ ] **Step 1: 记录迁移前的违规清单**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -E "app/admin|components/admin" | sort | uniq -c`
Expected: 本组 71 处、按下表逐项处置：

| token | 次 | 替换为 |
|---|---|---|
| `text-gray-500` | 29 | `text-muted-foreground` |
| `text-gray-400` | 3 | `text-foreground-subtle` |
| `text-gray-600` | 3 | `text-muted-foreground` |
| `text-gray-700` | 3 | `text-foreground` |
| `text-gray-900` | 1 | `text-foreground` |
| `bg-gray-50` | 5 | `bg-surface-subtle` |
| `bg-gray-100` | 3 | `bg-muted` |
| `bg-gray-200` | 1 | `bg-surface-strong` |
| `text-blue-600` | 2 | `text-brand` |
| `text-blue-700` | 2 | `text-brand-strong` |
| `bg-blue-50` | 1 | `bg-brand/10` |
| `bg-blue-100` | 1 | `bg-brand/10` |
| `bg-blue-600` | 2 | `bg-brand` |
| `text-green-700` | 4 | `text-success` |
| `bg-green-100` | 2 | `bg-success/15` |
| `text-red-600` | 1 | `text-destructive` |
| `text-red-700` | 2 | `text-destructive` |
| `bg-red-50` | 1 | `bg-destructive/10` |
| `bg-red-100` | 1 | `bg-destructive/10` |
| `border-red-300` | 1 | `border-destructive/30` |
| `text-amber-600` | 1 | `text-warning` |
| `text-amber-700` | 1 | `text-warning` |
| `bg-amber-100` | 1 | `bg-warning/10` |

（`text-white` 1 处已被放行。本表合计 71 处，与守卫输出一致。）

- [ ] **Step 2: 逐文件替换**

要点：

- `app/admin/update/update-client.tsx:24`：`bg-blue-100 text-blue-700` → `bg-brand/10 text-brand-strong`；`:26` `bg-green-100 text-green-700` → `bg-success/15 text-success`。
- `components/admin/admin-reports-client.tsx:169,171`：`bg-amber-100 text-amber-700` → `bg-warning/10 text-warning`；`bg-green-100 text-green-700` → `bg-success/15 text-success`。
- `components/admin/admin-nav.tsx:34`：`bg-blue-50 text-blue-700` → `bg-brand/10 text-brand-strong`。
- `app/admin/layout.tsx:24`：`text-gray-500` → `text-muted-foreground`。

- [ ] **Step 3: 跑守卫测试确认本组清零**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | grep -cE "app/admin|components/admin"`
Expected: `0`

- [ ] **Step 4: 从 PENDING 移除这 10 个文件**

`app/admin/layout.tsx`、`app/admin/page.tsx`、`app/admin/update/update-client.tsx`、`components/admin/admin-admins-client.tsx`、`components/admin/admin-comments-client.tsx`、`components/admin/admin-course-notes-client.tsx`、`components/admin/admin-courses-client.tsx`、`components/admin/admin-infinite-scroll.tsx`、`components/admin/admin-nav.tsx`、`components/admin/admin-reports-client.tsx`。

- [ ] **Step 5: 全量测试 + 类型检查 + 提交**

```bash
npm test 2>&1 | tail -5
npx tsc --noEmit
git add app/admin components/admin tests/no-light-only-colors.test.ts
git commit -m "refactor(theme): tokenize the admin console surfaces"
```

---

## Task 16: 收严守卫测试并过四道质量门

**Files:**
- Modify: `tests/no-light-only-colors.test.ts`（删除 `PENDING`）

**Interfaces:**
- Consumes: Task 9–15 已迁移完的 48 个文件（`PENDING` 应已清空）
- Produces: 守卫测试对**全部**范围生效（不再有 pending 例外）

- [ ] **Step 1: 确认 PENDING 已空**

Run: `npx vitest run tests/no-light-only-colors.test.ts 2>&1 | tail -5`
Expected: PASS，且 `PENDING` 现在是空数组（若还有残留项，说明某个迁移任务漏了文件 —— 回到该任务补完，不要在这一步放宽断言）。各任务移除项合计应为 48：Task 9 移 7、Task 10 移 8、Task 11 移 6、Task 12 移 3、Task 13 移 9、Task 14 移 5、Task 15 移 10。

- [ ] **Step 2: 删掉 PENDING 机制**

把 `tests/no-light-only-colors.test.ts` 中的 `PENDING` 常量与其上方注释一并删除，并把两个 case 改为：

```ts
describe("light-only color guard", () => {
  it("has no raw color scales anywhere in app or components", () => {
    expect(collectTokenViolations()).toEqual([]);
  });
});
```

- [ ] **Step 3: 跑守卫测试确认通过**

Run: `npx vitest run tests/no-light-only-colors.test.ts`
Expected: PASS（1 个 case）。

- [ ] **Step 4: 四道质量门**

```bash
npm test 2>&1 | tail -15
npm run lint
npx tsc --noEmit
npm run build 2>&1 | tail -25
```

Expected: 四者全部成功。`npm run build` 必须无 hydration 相关报错、无 Tailwind 未知类警告（若出现 `text-brand-logo` 之类未生成的提示，说明 `tailwind.config.js` 的 `content` 未覆盖该文件，检查 `content` 里的 `./components/**/*.{ts,tsx}`）。

- [ ] **Step 5: 提交**

```bash
git add tests/no-light-only-colors.test.ts
git commit -m "test(theme): enforce the color token guard across the whole scope

Every source file under app and components now has to use semantic tokens
(the documented allowlist aside), so the migration cannot silently regress."
```

---

## Task 17: 浏览器人工验证与 verification 文档

**Files:**
- Create: `docs/superpowers/verification/2026-10-02-next-web-dark-mode.md`

**Interfaces:**
- Consumes: Task 16 的绿灯状态
- Produces: 一份记录实测证据的验证文档（沿用 `docs/superpowers/verification/` 现有格式）

- [ ] **Step 1: 起本地开发服务器**

```bash
cd /Users/box/UMHelper/next-web/.worktrees/dark-mode
npm run dev 2>&1 | tee /tmp/dark-mode-dev.log
```

（用后台任务运行；确认日志里出现 `Local: http://localhost:3000` 后记下确切端口。）

- [ ] **Step 2: 浅色模式逐页对照 §5.7 位移清单**

逐页打开并与改动前对照：首页、搜索页、课程详情、教授页、评论页、课表、compare、submit、法务页、`/admin`。核对 §5.7 的 S1–S13 是否都落在"极小/小幅"范围内；发现清单外的可见变化就记下来（这是 R4 的兜底）。

- [ ] **Step 3: 深色模式逐页走查**

在导航栏下拉里切到 `Dark`，重走同一批页面，检查：

- 正文与次级文字对比度可读；边框可见；
- Offered / Not Offered 徽章可辨；评分卡、骨架屏正常；
- `report-dialog`、`share-dialog` 弹窗与 sonner toast 背景不再是白块；
- admin 页面无"深壳 + 白块"混合。

- [ ] **Step 4: 切换行为与持久化**

- 切 `Dark` 后刷新页面 → 仍是深色（`localStorage` 的 `umeh-theme` 生效）；
- 切 `System` 后改系统外观 → 立即跟随，无需刷新；
- 移动端宽度（≤768px）打开侧边栏 → 顶部三选项可用。

- [ ] **Step 5: 首屏无闪烁与无 hydration 警告**

- DevTools 里关闭缓存并开 CPU 节流（6×），hard reload：`<html>` 的 `class="dark"` 必须在首次绘制前就位，页面不得先白后黑；
- 打开 Console 全程观察：切换主题、刷新、客户端路由往返（首页 → 课程 → 返回）都不得出现 hydration 警告。

- [ ] **Step 6: 写验证文档**

Create `docs/superpowers/verification/2026-10-02-next-web-dark-mode.md`，包含：

- 验证日期、执行人、`git rev-parse HEAD` 的 commit、浏览器与版本；
- 四道质量门的实际输出摘要（测试文件数、lint、tsc、build 结果）；
- 浅色位移 S1–S13 的逐条实拍对照结论；
- 深色走查清单的逐页结论（含已知限制项的实际观感：Clerk 白卡、AdSense 白块）；
- 首屏无闪烁与无 hydration 警告的结论；
- 任何未通过项与后续待办。

- [ ] **Step 7: 提交**

```bash
git add docs/superpowers/verification/2026-10-02-next-web-dark-mode.md
git commit -m "docs: verification record for dark mode and brand logo alignment"
```

---

## Task 18: 收尾

**Files:**
- 无代码改动

**Interfaces:**
- Consumes: Task 16 的绿灯 + Task 17 的验证文档
- Produces: 可合并的分支（或按用户选择的收尾方式）

- [ ] **Step 1: 复核分支状态**

```bash
cd /Users/box/UMHelper/next-web/.worktrees/dark-mode
git status --short
git log --oneline main..HEAD
```

Expected: 工作区干净；提交历史包含本计划各任务的提交，无遗漏未提交文件。

- [ ] **Step 2: 运行 `finishing-a-development-branch` skill 决定收尾方式**

按该 skill 的选项与用户确认：合并回 `main`、开 PR、或保留分支。**不要**在未确认的情况下直接合并。

- [ ] **Step 3: 清理工作树（仅在合并/放弃后）**

```bash
cd /Users/box/UMHelper/next-web
git worktree remove .worktrees/dark-mode
```

Expected: `.worktrees/dark-mode` 已移除；`git worktree list` 只剩主检出。

---

## Self-Review

**1. Spec coverage（逐节核对）**

| Spec 章节 | 由哪个任务实现 |
|---|---|
| §4.1 数据流 / §4.2 接线 | Task 3 |
| §4.3 防闪烁与 hydration | Task 3（`suppressHydrationWarning`）+ Task 4（`mounted` 占位）+ Task 17 Step 5 |
| §4.4 `theme-color` 与状态栏 meta | Task 6 |
| §4.5 缓存与 SSR 语义 | Global Constraints（禁止读 `headers()`/`cookies()`）+ Task 16 构建门 |
| §5.2 新增 12 个 token | Task 2 Step 3/4 |
| §5.3 既有 token 值调整（3 处） | Task 2 Step 3 |
| §5.4 Tailwind 配置扩展 | Task 2 Step 6 |
| §5.5 映射表 | 移到 Global Constraints，由 Task 9–15 执行 |
| §5.6 放行清单 | Task 2 无关；Task 8 的 `ALLOWED_TOKENS` + Task 14（骨架屏白条不改） |
| §5.7 浅色位移清单 | Task 7（S11）、Task 12（S12）、Task 13（S13）、Task 17 Step 2（逐条对照） |
| §6 品牌区（图标 + 字标 + 顶栏/页脚） | Task 7 |
| §7.1 `ThemeToggle` + `mounted` 占位 | Task 4 |
| §7.2 挂载位置 | Task 5 |
| §8 迁移清单 | Task 8 的 `PENDING` 基线（守卫口径实测 **48 个文件 / 335 处**）+ Task 9–15。原始清单 54 个文件里，`app/layout.tsx`（命中全在注释）与 `navbar-avatar.tsx` / `search.tsx` / `search-form.tsx` / `comments.tsx` / `app/professor/[...name]/page.tsx`（命中全为放行项）共 6 个文件在守卫口径下为 0 处，因此**不在** `PENDING` 中，也无需出现在任何迁移任务里 |
| §9 T1 | Task 2 |
| §9 T2 | Task 8（含 Task 16 收严） |
| §9 T3 | Task 3 |
| §9 T4 | Task 4 |
| §9 T5 | Task 7 |
| §9 T6 | Task 6 |
| §9 T7 | Task 5 |
| §10 AC1（四道门） | Task 16 Step 4 |
| §10 AC2（守卫绿） | Task 16 Step 3 |
| §10 AC3（浅色位移有界） | Task 17 Step 2 |
| §10 AC4（深色走查） | Task 17 Step 3 |
| §10 AC5（与 iOS 一致） | Task 2 Step 1 的 T1 跨仓库断言 |
| §10 AC6（持久化/跟随/无闪烁） | Task 17 Step 4/5 |
| §10 AC7（admin 无混合） | Task 15 + Task 17 Step 3 |
| §10 AC8（无 hydration 警告） | Task 17 Step 5 |
| §11 R1–R8 | R1→T1；R2/R3→Task 3/4 + AC8/AC6；R4→Task 17 Step 2；R5→Global Constraints 已知限制；R6→Task 4 的 `mounted` 断言；R7→Global Constraints「只替换颜色类」+ 逐任务守卫；R8→Task 17 Step 3 观察项 |
| §12 交付物 | 代码见 Task 2–7，测试见 T1–T7，文档见 Task 17 |

无缺口。

**2. Placeholder scan**

已检查：计划中无 "TBD" / "TODO" / "implement later" / "similar to Task N" / "add appropriate error handling" 之类占位；每个代码步骤都给出了可直接粘贴的完整代码；每个迁移任务都给出了本组**实际存在**的 token 清单（由 `grep` 实测得出）而不是"参照上表处理"。

**3. Type consistency**


- `ThemeProvider`：Task 3 定义并导出为**具名**导出，`app/layout.tsx` 用 `import { ThemeProvider }` ✓。
- `ThemeToggle` / `ThemeOptions` / `THEME_OPTIONS` / `ThemeValue`：Task 4 全部为具名导出；Task 5 的挂载与 T7 断言均按具名 import 书写 ✓（计划中特别标注了"不要写成默认导出"）。
- `ThemeColorMeta`：Task 6 具名导出，`app/layout.tsx` 具名 import ✓。
- 测试辅助：Task 8 导出的 `collectTokenViolations()` 在 Task 16 中被复用，签名（返回 `file:line  token` 字符串数组）前后一致 ✓。
- 每个迁移任务都断言 `grep -c` 计数为 `0`，与 `collectTokenViolations()` 的输出格式（`file:line  token`）一致 ✓。

**4. 自审执行记录（不是纸上检查，是实跑结果）**

| 检查项 | 做法 | 结果 |
|---|---|---|
| `PENDING` 基线是否等于"实际有违规的文件集合" | 按本计划的扫描逻辑（剥离注释 + 精确放行清单）在真实仓库上跑一遍 | 实测 **48 个文件 / 335 处**；与原始 grep 的 54 文件 / 423 处差额 = 11 处仅在注释 + 77 处放行项。**据此把 `PENDING` 从 53 项改成 48 项**，并移除了 5 个"命中全是放行项"的文件（`navbar-avatar`、`search`、`search-form`、`comments`、professor 页面） |
| Task 8 的守卫测试能否直接跑通 | 从本文件抽出代码块原样写入 `tests/no-light-only-colors.test.ts` 并运行 | **2 个断言全部通过**；其中 stale 断言通过本身就证明扫描器在每个 `PENDING` 文件里都真的找到了违规（不是假绿） |
| 各测试块的"预期失败"是否与计划一致 | 抽出 T1/T3/T4/T5/T6/T7 的代码块逐一运行 | T1 失败于 `missing`（12 个 token 缺失）、T3/T4/T6 失败于模块不存在、T7 失败于断言 —— 均与计划所写一致 |
| 渲染类测试能否在 vitest 下工作 | 发现 `React is not defined` 后定位根因并试修 | 根因是 vitest/esbuild 走经典 JSX runtime 而组件不写 `import React`；加 `esbuild: { jsx: "automatic" }` 后 T5 按**预期原因**失败（缺 `text-brand-logo`），且**107 个现有测试文件 / 359 用例全绿** —— 该配置已写入 Task 3 的 Step 1 |
| mock 工厂的 React 提升问题 | 同上实跑 | `vi.mock` 工厂先于 `import` 执行，工厂内用 `React.createElement` 会抛 `React is not defined`；Task 3 / Task 7 的测试已改为 async 工厂 + 动态 `import("react")`（与 `tests/components/admin-entry.test.tsx` 一致） |
| 浅色色值是否可零容差断言 | 用 HSL→HEX 往返脚本逐个校验 §5.2 的色值 | 初稿 7 个值换算不回去（如 `--brand` 深色实为 `#61A6FA` 而非 `#60A5FA`），已全部修正为往返等值 |
| 基线测试数量 | `npx vitest run` | **107 个测试文件 / 359 个用例全绿**（spec 里原写的 105 已修正） |
