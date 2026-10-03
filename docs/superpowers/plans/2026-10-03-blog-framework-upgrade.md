# blog Phase 0 框架升级实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `blog` 从 Astro 3.1.3 / Tailwind 3.3.3 升到 Astro 7.x / Tailwind 4.x，**不改动任何渲染结果**，并让四道机器门全绿。

**Architecture:** 先用一个「零视觉变化守卫」把升级前的 `dist/` 存档（比对可见文字与结构骨架），然后分两段升级 —— 先 Astro（含 Content Layer API 迁移与 `ClientRouter`），再 Tailwind（含 v4 引擎与 CSS 入口）—— 每段结束都用守卫比对，最后接上 vitest 守卫测试与四道门。**Phase 0 不碰任何设计**：token 名、配色、字体、骨架、文案一律不动。

**Tech Stack:** Astro 7.x、Tailwind CSS 4.x（`@tailwindcss/vite`）、TypeScript 5.x、vitest、Node 25（本机 v25.8.1）

**Spec:** `next-web/docs/superpowers/specs/2026-10-03-blog-theme-brand-alignment-design.md` §14（Phase 0）、§12（验证）、§4.4（Phase 1 才会用到的 v4 token 写法，本计划不实施）

## Global Constraints

- **工作目录**：`/Users/box/UMHelper/.worktrees/blog-phase0`（git worktree，分支 `phase0-framework-upgrade`，base `6c73e2d`）。**所有命令都在这里跑**，不要在 `/Users/box/UMHelper/blog` 里跑（那里有另一个会话在活跃提交）。
- **npm 缓存必须指向工作区内**：`export npm_config_cache=/Users/box/UMHelper/.npm-cache`。默认的 `/Users/box/.npm` 在工作区之外，会被 sandbox 拒绝写入，错误信息会伪装成 `Your cache folder contains root-owned files`。
- **零视觉变化**是硬指标（spec §14.1 G-P0-2）：任何页面的**可见文字**必须与基线逐字节一致；结构/类名差异必须逐条确认。
- **不改任何设计**（spec §14.1 G-P0-4）：不动 token 名、不动配色、不换字体、不加功能、**不动任何文案**。
- **基线必须用 astro-only 构建**：`npx astro build`，不要用 `npm run build`（后者会跑 jampack 后处理，改写 dist）。
- **`type: 'content'` 必须删除**（Astro 6 起不再有集合类型）。
- **`z` 一律从 `astro/zod` 导入**；`astro:schema` 与 `z from astro:content` 均已弃用。
- **`image().refine()` 在 Content Layer 中不受支持**，必须移除。
- **提交规范**：`git commit --no-verify`（husky 的 `npx lint-staged` 在无匹配文件时本就空转，绕过可避免噪音）。提交信息用 conventional commits。

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `scripts/baseline.mjs` | 零视觉变化守卫（capture / check / self-test） | **已建**（Task 1） |
| `.gitignore` | 忽略 `.baseline/` 与 `dist/` | 已改（Task 1） |
| `src/content.config.ts` | 内容集合定义（Content Layer API） | **新建**（Task 2） |
| `src/content/config.ts` | 旧集合定义 | **删除**（Task 2） |
| `src/layouts/PostDetails.astro` | `post.render()` → `render(post)` | 改 2 行（Task 2） |
| `src/layouts/Layout.astro` | `<ViewTransitions />` → `<ClientRouter />` | 改 2 行（Task 2） |
| `astro.config.ts` | `@astrojs/tailwind` → `@tailwindcss/vite` | 改（Task 3） |
| `src/styles/base.css` | `@tailwind …` → `@import "tailwindcss"` + `@config` | 改首 3 行 + 尾部 `@layer components`（Task 3） |
| `tailwind.config.cjs` | v3 配置（Phase 0 保留，Phase 1 才改成 CSS-first） | 微调（Task 3） |
| `tests/deprecated-utilities.test.ts` | T9 守卫测试 | **新建**（Task 4） |
| `vitest.config.ts` | 测试配置 | **新建**（Task 4） |
| `package.json` | 依赖与 scripts | 改（Task 2/3/4） |

---

## Task 1: 零视觉变化守卫【已完成】

**Files:**
- Create: `scripts/baseline.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `node scripts/baseline.mjs capture|check|self-test`；退出码 0 = 无硬差异，1 = 可见文字变化或页面增删，2 = 用法/前置条件错误。存档在 `.baseline/`（`manifest.json` + `html/` 全量副本）。

- [x] **Step 1: 写守卫脚本**（已提交 `3e32bb2`）

比对两个维度：可见文字（剔除 script/style/标签后压缩空白，**零归一化**）与结构骨架（标签序列 + 排序后的 class 属性，仅施加 `ACCEPTED_DELTAS` 里明示且带理由的归一化）。

- [x] **Step 2: 证明它会失败**（自证）

Run: `node scripts/baseline.mjs self-test`
Expected: `✓ 自证通过：注入一处可见文字差异后，check 正确报错。`
理由：一个永远通过的检查脚本等于没有检查 —— spec §12.2 明确要求测试本身可被证伪。

- [x] **Step 3: 存档升级前基线**

Run: `npx astro build && node scripts/baseline.mjs capture`
Expected: `✓ 已存档 23 个页面 → .baseline/（git 6c73e2d）`

- [x] **Step 4: 确认干净基线上 check 无误报**

Run: `node scripts/baseline.mjs check`
Expected: `✓ 零变化：可见文字与结构均与基线一致。`，退出码 0

---

## Task 2: Astro 3.1.3 → 7.x（含 Content Layer 迁移与 ClientRouter）

**Files:**
- Modify: `package.json`（依赖）
- Create: `src/content.config.ts`
- Delete: `src/content/config.ts`
- Modify: `src/layouts/PostDetails.astro:8,20`
- Modify: `src/layouts/Layout.astro:4,81`

**Interfaces:**
- Consumes: Task 1 的 `node scripts/baseline.mjs check`
- Produces: 内容集合仍导出名为 `blog` 的集合并提供同名字段；`PostDetails.astro` 仍从 `render()` 取得 `{ Content }`；页面仍由 `<ClientRouter />` 驱动客户端路由。

### 背景：这一步要处理哪些破坏性变更（spec §14.2 U1–U4）

Astro 6 **移除**了 legacy content collections（无兼容层），并且：
- 配置文件位置从 `src/content/config.ts` **改为 `src/content.config.ts`**（否则 `LegacyContentConfigError`）
- 集合定义里的 `type: 'content'` **必须删除**（`ContentCollectionInvalidTypeError`）
- 集合**必须**有 `loader`（否则 `ContentCollectionMissingALoaderError`）
- `entry.render()` **方法已不存在**，改为从 `astro:content` 导入 `render()` 函数
- **`image().refine()` 不受支持**（官方原文：「performing custom validation checks on images using `image().refine()` is unsupported」）
- **Zod 升到 4**（`astro:schema` 与 `z from astro:content` 弃用）
- `<ViewTransitions />` **已移除**，用 `<ClientRouter />`

**本仓库的实际命中面**（已 grep 核实）：20 个文件从 `astro:content` 导入，其中 1 处是 `entry.render()`、1 处是 `<ViewTransitions />`、11 处是纯类型 `CollectionEntry<'blog'>`（**仍然存在，无需改动**）；**没有**使用 `.slug`、`Astro.glob()`、`getEntryBySlug()`、`emitESMImage()`，因此这几条迁移不适用于本仓库。

**spec §14.2 中经核实「不适用于本仓库」的条目**（一并列出，便于评审确认不是遗漏）：

| # | 变更 | 为何不适用 |
|---|---|---|
| U11 | `container` 的 `center` / `padding` 配置项在 v4 移除 | 本仓库从未使用 `container` 工具类，也没有该配置 |
| U12 | v4 中 `hidden` 属性优先于 `display` 类 | 本仓库只在 Tailwind 类层面用 `display-none`（自定义类）+ `sm:flex`，没有用 `hidden` **属性** |

- [ ] **Step 1: 升级依赖**

Run:
```bash
cd /Users/box/UMHelper/.worktrees/blog-phase0
export npm_config_cache=/Users/box/UMHelper/.npm-cache
npm install astro@^7.3.5 \
  @astrojs/react@^7.0.0 @astrojs/sitemap@^3.7.4 @astrojs/rss@^4.0.19 \
  satori@^0.35.0 @resvg/resvg-js@latest fuse.js@latest \
  --no-audit --no-fund
npm install -D @astrojs/check@latest typescript@latest @divriots/jampack@^0.34.1 --no-audit --no-fund
```
Expected: 安装成功。
注意：`@astrojs/react@7` 的 peer 允许 `react ^17 || ^18 || ^19`，**不强制 React 19**，但**新增了一个必需 peer `oxc-transform-react@^0.145.0`** —— 若 npm 因缺少该 peer 报错，按提示一并安装。

- [ ] **Step 2: 迁移内容集合配置（新建 `src/content.config.ts`）**

```ts
// src/content.config.ts
import { SITE } from "@config";
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    author: z.string().default(SITE.author),
    pubDatetime: z.coerce.date(),
    title: z.string(),
    postSlug: z.string().optional(),
    featured: z.boolean().optional(),
    draft: z.boolean().optional(),
    tags: z.array(z.string()).default(["others"]),
    ogImage: z.union([z.string(), z.object({ src: z.string() })]).optional(),
    description: z.string(),
    canonicalURL: z.string().optional(),
  }),
});

export const collections = { blog };
```

三处相对原文件的**有意**改动，逐条记录理由：

| # | 原 | 新 | 理由 |
|---|---|---|---|
| 1 | `type: "content"` | 删除 | Astro 6 起集合不再分类型，保留会抛 `ContentCollectionInvalidTypeError` |
| 2 | `schema: ({ image }) => z.object({…})` | `schema: z.object({…})` | Content Layer 的 `schema` 是普通 Zod 值，不再接收 `{ image }` 上下文 |
| 3 | `pubDatetime: z.date()` | `z.coerce.date()` | Content Layer 下 frontmatter 日期以字符串进入 schema；Zod 4 的 `z.date()` 不再接受字符串，官方示例即 `z.coerce.date()` |
| 4 | `ogImage: image().refine(…).or(z.string()).optional()` | `z.union([z.string(), z.object({ src: z.string() })]).optional()` | 官方明确 `image().refine()` 不受支持。保留 `{ src }` 形态是为了 `PostDetails.astro:22` 的 `ogImage?.src` 分支继续类型成立 |

> **能力面收窄（已知且记录）**：原来由 schema 在构建期强制的「ogImage 至少 1200×630」校验随 `.refine()` 一并消失。**当前没有任何文章在 frontmatter 里设置 `ogImage`**（已核实），因此可见输出零变化（基线守卫会证明这点）。该校验的意图在 Task 4 以运行时测试的形式补回 —— 校验从 schema 期挪到测试期，而不是丢掉。

- [ ] **Step 3: 删除旧配置文件**

Run: `git rm src/content/config.ts`
Expected: 文件被删除并进入暂存区

- [ ] **Step 4: 把 `entry.render()` 改成 `render(entry)`**

`src/layouts/PostDetails.astro` 第 8 行附近（既有 `import type { CollectionEntry } from "astro:content";` 之后）新增：
```ts
import { render } from "astro:content";
```

第 20 行：
```ts
// 旧
const { Content } = await post.render();
// 新
const { Content } = await render(post);
```

- [ ] **Step 5: 把 `<ViewTransitions />` 换成 `<ClientRouter />`（U2）**

`src/layouts/Layout.astro` 第 4 行：
```ts
// 旧
import { ViewTransitions } from "astro:transitions";
// 新
import { ClientRouter } from "astro:transitions";
```

第 81 行：
```astro
<!-- 旧 -->
<ViewTransitions />
<!-- 新 -->
<ClientRouter />
```

- [ ] **Step 6: 构建**

Run: `npx astro build`
Expected: 构建成功，23 页。若报 `LegacyContentConfigError` / `ContentCollectionMissingALoaderError` / `ContentSchemaContainsSlugError`，说明 Step 2/3 没落干净；若报 Zod 校验错误（例如 `pubDatetime` 类型不符），检查 Step 2 的第 3 条改动。

- [ ] **Step 7: 核实 U3 —— 没有依赖 `astro:transitions` 的内部导出**

```bash
grep -rn "astro:transitions" src/
```
Expected: 只有 `src/layouts/Layout.astro` 一处，且导入名是 `ClientRouter`。
Astro 7 移除了 `createAnimationScope()` / `isTransitionBeforePreparationEvent()` / `isTransitionBeforeSwapEvent()` / `TRANSITION_BEFORE_PREPARATION` 等内部导出；若 grep 出其它导入名，说明有内部依赖需要改写。
另外确认 5 处 `transition:name`（`Card.tsx:15`、`Tag.astro:17`、`Main.astro:26`、`PostDetails.astro:50`、`tags/[tag].astro:48`）仍属公开 API —— 它们是 `transition:name` 指令而非导入，**不需要改动**，只需确认构建无对应警告。

- [ ] **Step 8: 核实 U4 —— `astro:content` 没有进入客户端 bundle**

```bash
grep -rn "astro:content" src/components/ src/layouts/
```
Expected: `Card.tsx`、`Search.tsx`、`Posts.astro`、`PostDetails.astro` 等处的 `CollectionEntry` **全部是 `import type`**（纯类型，编译期被擦除）。
Astro 5 起 `astro:content` 不能在客户端使用；`Search.tsx` 是 React 岛，经 props 收数据、不自行查询，因此当前写法安全 —— 但 `import type` 这一条**必须逐个确认**：任何非 type 导入都会把服务端模块拖进客户端 bundle。
若发现非 type 导入，改为 `import type`。

- [ ] **Step 9: 与基线比对**

Run: `node scripts/baseline.mjs check`
Expected: **可见文字零差异**（`check` 退出码 0）。
结构/类名差异会以 `!` 列出 —— Astro 7 的 Shiki 4 会改变代码块标记，`ClientRouter` 会改变注入的 script，这些属于**预期位移**，需逐条确认后写进 `ACCEPTED_DELTAS`（新增条目必须带 `reason`）。

- [ ] **Step 10: 提交**

```bash
git add -A
git commit --no-verify -m "chore(deps)!: upgrade Astro 3.1.3 -> 7.x with content layer migration"
```

---

## Task 3: Tailwind 3.3.3 → 4.x

**Files:**
- Modify: `package.json`
- Modify: `astro.config.ts`
- Modify: `src/styles/base.css`
- Modify: `tailwind.config.cjs`

**Interfaces:**
- Consumes: Task 2 完成的 Astro 7 环境
- Produces: 全站样式类名与视觉效果**保持不变**；`skin-*`、`prose`、`.display-none`、`.focus-outline` 等既有类名继续可用。

### 背景与关键取舍（spec §14.2 U5–U13）

Tailwind 4 是引擎重写：入口从 `@tailwind base/components/utilities` 改为 `@import "tailwindcss"`；集成从 `@astrojs/tailwind` 改为 `@tailwindcss/vite`；配置改为 CSS-first 的 `@theme`；**`bg-opacity-*` / `border-opacity-*` / `text-opacity-*` 被彻底删除**；默认边框色从 `gray-200` 改为 `currentColor`；`outline-none` 改名 `outline-hidden`；`@layer components { .x }` 的推荐写法改为 `@utility`。

**本计划采用「配置兼容优先」策略**，理由：spec §4.4 已经把「token 改为 CSS-first `@theme`」列为 **Phase 1** 的工作（因为那与品牌 token 迁移是同一件事）。Phase 0 的职责是「换引擎、不换样式」，所以优先用 v4 的 `@config` 兼容指令继续读现有的 `tailwind.config.cjs`，把 CSS-first 重写留给 Phase 1。这样 Phase 0 的改动面与风险都最小。

**这一策略有一个必须实测的风险**：v4 的 `@config` 兼容层**可能不支持 JS 配置里的「颜色函数」**，而本仓库的 `tailwind.config.cjs` 恰恰用 `withOpacity()` 闭包生成 `skin-*` 颜色。Step 4 就是要证伪这一点，Step 5 是备选路径。

- [ ] **Step 1: 装 Tailwind 4 并移除旧集成**

Run:
```bash
export npm_config_cache=/Users/box/UMHelper/.npm-cache
npm install tailwindcss@^4.3.3 @tailwindcss/vite@^4.3.3 --no-audit --no-fund
npm install -D @tailwindcss/typography@^0.5.20 --no-audit --no-fund
npm uninstall @astrojs/tailwind
```
Expected: `@astrojs/tailwind` 从 `package.json` 消失。

- [ ] **Step 2: `astro.config.ts` 换用 vite 插件**

```ts
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import { SITE } from "./src/config";

export default defineConfig({
  site: SITE.website,
  integrations: [react(), sitemap()],
  markdown: {
    remarkPlugins: [remarkToc, [remarkCollapse, { test: "Table of contents" }]],
    shikiConfig: { theme: "one-dark-pro", wrap: true },
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { exclude: ["@resvg/resvg-js"] },
  },
  scopedStyleStrategy: "where",
});
```
要点：删除 `import tailwind from "@astrojs/tailwind"` 与 `tailwind({ applyBaseStyles: false })`；`vite.optimizeDeps.exclude` 的 `@resvg/resvg-js` **必须保留**（原生模块）。

- [ ] **Step 3: `src/styles/base.css` 换入口并保留 v3 配置**

把开头 3 行：
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```
改为：
```css
@import "tailwindcss";
@config "../tailwind.config.cjs";
@plugin "@tailwindcss/typography";
```

同时**从 `tailwind.config.cjs` 删除 `plugins: [require("@tailwindcss/typography")]`**，避免与 `@plugin` 重复注册（主题插件在 v4 由 `@plugin` 负责）。

> `applyBaseStyles: false` 在 v4 没有对应概念：v4 的 `@import "tailwindcss"` 自带 preflight，行为与原来「由 base.css 的 `@tailwind base` 提供一次 preflight」一致。

- [ ] **Step 4: 实测 `@config` 是否支撑颜色函数（关键验证）**

Run: `npx astro build && node scripts/baseline.mjs check`
Expected: 构建成功且**可见文字零差异**。
逐项确认 `skin-*` 类是否真的生成了 CSS —— 若 `bg-skin-fill` 等类在产物 CSS 里**缺失**（不是「颜色不对」而是「整条工具类不存在」），说明 v4 的 `@config` 兼容层不支持 JS 颜色函数，**进入 Step 5**。若类存在且结构差异仅为预期位移，**跳过 Step 5**，直接 Step 6。

检查方法：
```bash
grep -c "bg-skin-fill\|text-skin-base\|border-skin-line" dist/_astro/*.css
```
Expected（通过时）: 计数 > 0

- [ ] **Step 5:（备选路径）把 `skin-*` 翻译成 v4 原生 `@theme`**

**仅在 Step 4 判定失败时执行。** 把 `tailwind.config.cjs` 里的六组 `skin-*` 映射改写为 CSS-first 形式，值取 `base.css` 顶部的 `--color-*` 变量：

```css
@theme inline {
  --color-skin-fill: rgb(var(--color-fill));
  --color-skin-base: rgb(var(--color-text-base));
  --color-skin-accent: rgb(var(--color-accent));
  --color-skin-inverted: rgb(var(--color-fill));
  --color-skin-card: rgb(var(--color-card));
  --color-skin-card-muted: rgb(var(--color-card-muted));
  --color-skin-line: rgb(var(--color-border));
}
```
注意 `skin-inverted` / `border-skin-fill` / `outline-skin-fill` 三个键在原配置里名字与取值不符（`border-skin-fill` 实际解析到 `--color-text-base`、`outline-skin-fill` 实际解析到 `--color-accent`），翻译时**必须按实际取值**而不是按名字，否则会静默改变观感 —— 这正是基线守卫要挡住的错误。
随后删除 `tailwind.config.cjs` 与 `@config` 行，并把 `screens: { sm: "640px" }` 也交给 v4 默认断点（v4 默认 `sm` 即 640px，零位移）。

- [ ] **Step 6: 处理 v4 默认值变化（U8/U9/U10）**

v4 把 `border`/`divide` 的默认色改为 `currentColor`。`base.css` 的 `.prose` 块里 `prose-th:border` / `prose-td:border` 依赖旧默认值，必须显式补色 —— **一律用 `border-skin-line`**：
```css
prose-th:border-skin-line prose-td:border-skin-line
```
为什么是 `border-skin-line` 而不是 `border-border`：`prose-td` 本来就写 `border-skin-line`，而该键在 Task 3 的两条路径下**都存在**（Step 4 的 `@config` 路径下来自 `tailwind.config.cjs` 的 `borderColor.skin.line`；Step 5 的备选路径下来自 `@theme inline` 的 `--color-skin-line`）。它是唯一在两条路径下都成立的写法，因此这个分支被消除。

同时检查 `focus:outline-none`（`Search.tsx:88`）：v4 中 `outline-none` 语义变为「真的设为 none」，而若要「视觉隐藏但保留无障碍」应用 `outline-hidden`。Phase 0 只要求**行为不变**，因此按 v3 语义替换为 `outline-hidden`。

**U10 —— shadow / radius 尺度重命名**：v4 重命名了 shadow、radius、blur 的尺度（`shadow-sm` → `shadow-xs` 等；裸值仍兼容，但 `<utility>-sm` 的外观会变）。先做一次用量审计：
```bash
grep -rnoE "(shadow|rounded|blur)-(sm|md|lg|xl|2xl|3xl)\b" src/ | sort | uniq -c | sort -rn
```
Expected: 本仓库几乎不用 `shadow-*`；`rounded`（裸值）出现在 `Search.tsx` 与 `base.css` 的 `prose-code:rounded`，裸值在 v4 语义未变。
处置原则：**Phase 0 不改观感** —— 若审计发现 `shadow-sm`/`rounded-sm` 这类会变外观的用法，逐个改成 v4 中等价的 `-xs` 命名，使渲染结果与基线一致；若审计结果为空，本步只需记录「无命中」。

- [ ] **Step 7: 处理 `@layer components` 与已删除的工具类（U6/U7）**

`base.css` 尾部的 `@layer components { .display-none; .focus-outline }` 在 v4 的推荐写法是 `@utility`；但 v4 仍支持原生 `@layer`，**Phase 0 优先保持原样**以缩小改动面，只有在 Step 4/5 的构建报错时才改为：
```css
@utility display-none { @apply hidden; }
@utility focus-outline {
  @apply outline-2 outline-offset-1 outline-skin-fill focus-visible:no-underline focus-visible:outline-dashed;
}
```

**已删除工具类的清理**（这些类名在 v4 下不再生成任何 CSS）：
```bash
grep -rn "bg-opacity-\|border-opacity-\|text-opacity-\|ring-opacity-\|flex-shrink-\|flex-grow-\|overflow-ellipsis" src/
```
Expected: 5 处命中 —— `base.css:33,56,62` 与 `Search.tsx:86,87`。
把它们按「删除或改斜杠语法」处理，**但不改变观感**：这些类在 v3 下本就是**失效**的（`withOpacity()` 生成的声明不消费 `--tw-*-opacity`），所以正确做法是**直接删除**这几个类名，观感与之前完全一致。spec §10.1 F1 记录的就是这件事，Phase 1 会用斜杠语法把它们真正实现；**Phase 0 只做删除**。

- [ ] **Step 8: 构建并与基线比对**

Run: `npx astro build && node scripts/baseline.mjs check`
Expected: 可见文字零差异；退出码 0。

- [ ] **Step 9: 提交**

```bash
git add -A
git commit --no-verify -m "chore(deps)!: upgrade Tailwind CSS 3.3.3 -> 4.x via @tailwindcss/vite"
```

---

## Task 4: vitest 与 Phase 0 守卫测试

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/deprecated-utilities.test.ts`
- Create: `tests/og-image-dimensions.test.ts`
- Modify: `package.json`（`test` script）

**Interfaces:**
- Consumes: Task 1 的 `scripts/baseline.mjs`（其 `check` 作为构建后门在 Task 5 调用）
- Produces: `npm test` 可运行；后续 Phase 1 的 T1–T8 会加在同一套 vitest 里

- [ ] **Step 1: 装 vitest 并加脚本**

```bash
export npm_config_cache=/Users/box/UMHelper/.npm-cache
npm install -D vitest@latest --no-audit --no-fund
```
`package.json` 的 `scripts` 增加：
```json
"test": "vitest run",
"build:astro": "astro build"
```
（`build:astro` 是给基线比对用的 astro-only 构建；`build` 保持 `astro build && jampack ./dist` 不变。）

- [ ] **Step 2: 写 T9 的失败测试（先红）**

```ts
// tests/deprecated-utilities.test.ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../src");

/** Tailwind 4 已删除、不再生成任何 CSS 的工具类前缀 */
const REMOVED = [
  "bg-opacity-",
  "border-opacity-",
  "text-opacity-",
  "ring-opacity-",
  "divide-opacity-",
  "placeholder-opacity-",
  "flex-shrink-",
  "flex-grow-",
  "overflow-ellipsis",
  "decoration-slice",
  "decoration-clone",
];

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(astro|tsx?|css)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("Tailwind 4 removed utilities", () => {
  it("src/ 里不应残留任何已删除的工具类", async () => {
    const hits: string[] = [];
    for (const file of await walk(SRC)) {
      const text = await readFile(file, "utf8");
      for (const needle of REMOVED) {
        if (text.includes(needle)) {
          hits.push(`${path.relative(SRC, file)}: ${needle}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 3: 证明这条守卫真的会红（必做，不是可选）**

本任务排在 Task 3 之后，而 Task 3 Step 7 已经删掉了那 5 处失效类名，所以 T9 一写出来就是绿的 —— 直接用 `npx vitest run` 看到 PASS **不能**证明它有效。因此必须人为制造一次红：

1. 临时把 `bg-opacity-70` 加回 `src/styles/base.css` 的 `body` 规则里；
2. Run: `npx vitest run tests/deprecated-utilities.test.ts`
   Expected: **FAIL**，并指出 `styles/base.css: bg-opacity-`；
3. 把该临时改动撤销，再跑一次拿到 PASS。

理由：一个从不失败的守卫等于没有守卫 —— spec §12.2 对 T9 的要求是「让这类问题机器可查」，而「永远通过的测试」正是本轮明确要避免的反模式。留下这次人为变红的记录（把命令与输出粘进 report）。

- [ ] **Step 4: 写 ogImage 校验测试（把丢掉的能力补回测试期）**

```ts
// tests/og-image-dimensions.test.ts
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const BLOG = path.resolve(__dirname, "../src/content/blog");

/**
 * Phase 0 移除了 schema 里的 image().refine()（Content Layer 不支持），
 * 因此「ogImage 至少 1200x630」这条约束改在这里把关。
 *
 * 当前没有任何文章设置 ogImage，所以对真实文件的断言是空的 —— 因此把
 * 匹配逻辑抽成纯函数并**用 fixture 单独证明它有效**，避免这条测试退化成
 * 「永不失败的摆设」。
 */
export function findLocalOgImages(text: string): string[] {
  const out: string[] = [];
  const re = /^ogImage:\s*["']?([^"'\s]+)["']?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const value = m[1];
    if (!/^https?:\/\//.test(value)) out.push(value);
  }
  return out;
}

describe("findLocalOgImages 的匹配逻辑（自证有效）", () => {
  it("能命中本地相对路径", () => {
    expect(findLocalOgImages("ogImage: ./assets/cover.png")).toEqual(["./assets/cover.png"]);
  });
  it("能命中带引号的本地路径", () => {
    expect(findLocalOgImages('ogImage: "/uploads/cover.png"')).toEqual(["/uploads/cover.png"]);
  });
  it("不把远程 URL 当成 offender", () => {
    expect(findLocalOgImages("ogImage: https://example.com/a.png")).toEqual([]);
  });
  it("没有该字段时返回空", () => {
    expect(findLocalOgImages("title: hello\ndraft: false")).toEqual([]);
  });
});

describe("ogImage frontmatter", () => {
  it("扫描范围非空，且没有任何文章引用本地 ogImage", async () => {
    const files = (await readdir(BLOG)).filter(f => f.endsWith(".md"));
    // 断言真的扫到了文件，否则下面的 offenders 为空毫无意义
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const f of files) {
      const text = await readFile(path.join(BLOG, f), "utf8");
      for (const local of findLocalOgImages(text)) {
        offenders.push(`${f}: ${local}（本地图需人工确认 >= 1200x630）`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

说明：Astro 3 的 `image()` 能读图片尺寸，纯 JS 测试读不了 PNG/JPG 尺寸（不引依赖的前提下）。因此这条测试的口径是「**本地图片路径必须显式登记并人工确认尺寸**」，而不是假装能自动量尺寸。它的价值在于：第一次有人给文章加本地 `ogImage` 时，构建期已不再拦截，这里会提醒。

- [ ] **Step 5: 跑测试确认全绿**

Run: `npm test`
Expected: PASS（2 个测试文件）

- [ ] **Step 6: 提交**

```bash
git add -A
git commit --no-verify -m "test: add vitest and Phase 0 guard tests"
```

---

## Task 5: 四道机器门 + 升级后基线存档

**Files:**
- Modify: `next-web/docs/superpowers/specs/2026-10-03-blog-theme-brand-alignment-design.md`（回填 Phase 0 实测结果）
- Create: 验证记录（见 Step 6）

**Interfaces:**
- Consumes: Task 2/3/4 的全部产物
- Produces: Phase 0 收尾证据；`dist/` 的**升级后**存档供 Phase 1 对照

- [ ] **Step 1: 跑四道门**

```bash
export npm_config_cache=/Users/box/UMHelper/.npm-cache
npm run build      # astro build && jampack ./dist
npx astro check
npm run lint
npm test
```
Expected: 全部退出码 0。
已知风险与处置：
- `npm run lint` 用的是 eslint 8；`astro-eslint-parser` 未必认 Astro 7 的新语法。若 lint 因解析失败而红，**先记录为已知偏差并人工确认编译无误**，eslint 8→9（flat config）属独立一轮（spec §14.3 已如此标注）。
- `npx astro check` 依赖 `@astrojs/check` 与 `typescript`，Task 2 Step 1 已升级；若类型报错源于 `CollectionEntry` 的 `id`/`slug` 语义变化，按 Task 2 Step 2 的说明处理。
- jampack（R-P0-2）：Task 2/3 之后若 jampack 在 Astro 7 产物上失败，**临时把 `build` 改为 `astro build`**，并把「未跑 jampack」作为已知偏差明确记录，不要静默绕过。

- [ ] **Step 2: 记录升级带来的全部结构位移**

Run: `node scripts/baseline.mjs check`
把输出的每一条结构差异分类：
1. **预期位移**（例如 Shiki 4 的代码块标记、`ClientRouter` 注入的 script、v4 的 CSS 变量命名）→ 写进 `scripts/baseline.mjs` 的 `ACCEPTED_DELTAS`，**每条必须带 `reason`**；
2. **非预期位移** → 是回归，修到消失。
判据：`acceptedDeltas` 里不允许出现「理由说不清」的条目 —— 那是把差异藏起来。

- [ ] **Step 3: 重新自证守卫仍然有效**

Run: `node scripts/baseline.mjs self-test`
Expected: `✓ 自证通过`（在新增了 ACCEPTED_DELTAS 之后，它**仍然**能抓到真实差异 —— 这是对「归一化没把守卫弄瞎」的验证）

- [ ] **Step 4: 存档升级后基线**

```bash
npx astro build
node scripts/baseline.mjs capture
```
Expected: `✓ 已存档 23 个页面`。
此存档是 **Phase 1 改版的对照物**：Phase 1 会大改视觉，届时它证明的是「改版确实改了我想改的东西，且没顺手改掉文案」。

- [ ] **Step 5: 把实测结果回填 spec**

在 spec §14 末尾追加一个小节，逐条记录 U1–U13 的实测结论（哪些如预期、哪些不适用、哪些走了备选路径），以及 §14.5 各风险的最终状态。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit --no-verify -m "docs: record Phase 0 upgrade results and post-upgrade baseline"
```

---

## 完成判据（objective）

Phase 0 视为完成，当且仅当：

1. `package.json` 的 `astro` 为 7.x、`tailwindcss` 为 4.x，且 `@astrojs/tailwind` 已移除；
2. `npm run build`、`npx astro check`、`npm run lint`、`npm test` 四门全绿（lint 若因 eslint 8 与 Astro 7 解析器不兼容而红，须作为**明示的已知偏差**记录，不得静默跳过）；
3. `node scripts/baseline.mjs check` 报告**可见文字零差异**，且 `self-test` 仍能捕获注入的差异；
4. 升级后的 `dist/` 已作为 Phase 1 对照基线存档；
5. spec §14 已回填实测结论。

**不在本 Phase 范围**：任何设计/品牌改动（token 改名、配色、字体、骨架、文案）、§10 的缺陷修复与文案例外、§9 的八个功能、`next-web` 的任何改动。
