# next-web 优化技术系列文章 实施计划（第 1 批：基建 + ① ② ③）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 固化"blog 长文 + 小红书图文"的双形态生产流程，并交付系列前三篇（① 总览、② SEO、③ 缓存）。

**Architecture:** 素材全部来自 next-web 仓库已有的审计、specs、plans、verification 与代码本体；成稿落 blog 仓库（Astro Paper），小红书卡片由 blog 仓库内的本地 Chrome 渲染脚本产出。设计与计划留在 next-web，两个仓库分开提交。

**Tech Stack:** Node 20+（渲染脚本零 npm 依赖）、本机 Google Chrome（headless 截图）、Astro Paper v3（blog）、Markdown + shiki、git。

**Spec:** `next-web/docs/superpowers/specs/2026-10-03-next-web-tech-article-series-design.md`

## Global Constraints

以下规则来自 spec，每个任务都隐含包含：

- 系列标签固定为「**选咩课优化**」；小红书卡片右上角编号为 `NN / 14`。
- blog 长文 2500–4000 字，七段骨架，**第 6 段"适用边界"不允许省略或写成空话**。
- blog 长文开头必须有 **≤150 字 TL;DR**，无代码、无术语。
- blog frontmatter 必须通过 `blog/src/content/config.ts` 的 schema：`author`、`pubDatetime`、`title`、`postSlug`、`tags`、`description` 必填。
- `postSlug` 统一 `next-web-` 前缀；`tags` 必须含 `next-web`；正文必须含 `## Table of contents`（命中 `remark-collapse` 的 `test: "Table of contents"`）。
- 小红书卡片：1080×1440；笔记正文 ≤900 字；**不出现代码**。**第 1 批每篇先出 3 张**（封面 / 对比或清单 / 尾图 CTA），第 2 批起补齐到 6–9 张。
- 术语写法：**英文简写（英文全称或中文翻译）**，如 `ISR（增量静态再生成）`、`TTFB（首字节时间）`、`RLS（行级安全）`；没有通用简写的术语用中文（按标签失效）；**大字标题不带括号注释**。
- 语气：**术语准确、句式简洁**，面向专业读者。禁止：口号式句型（"每次 X 都 Y"）、三项排比、"把 X 改成 Y"模板句、"则 / 随即 / 值得注意的是"这类书面词、网络用语。
- 卡片正文不出现读者看不懂的内部功能名（"课程详情页""评论页"）；要举例写通用场景（"列表页"），具体数字可以留。
- 不写"来源：项目内的 X 文档"这类无法核实的指代。
- **每个数字与结论必须能指到 `file:line` 或 verification 文档**；没有实测支撑的收益标注"未量化"。
- **计数一律现取**：仓库在被并行修改，测试数/页面数等用命令当场取，不沿用文档里的旧数字。
- 零新 npm 依赖；渲染不联网。
- 非目标（来自 spec §2.2）：不写团队与项目八卦；不重写 `technical-optimization-audit.md`；不修改 blog 现有 3 篇文章与站点结构。

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `blog/scripts/xhs-render.mjs` | 卡片渲染器：模板（cover / compare / list）、Chrome headless 截图、排版体检 |
| `blog/xhs/<slug>/cards.mjs` | 一篇笔记的卡片文案数据（每篇一个文件） |
| `blog/xhs/<slug>/note.md` | 一篇笔记的标题、正文、标签、配图说明 |
| `blog/public/xhs/<slug>/NN-<kind>.png` | 渲染产物（提交进仓库） |
| `blog/src/content/blog/next-web-<topic>.md` | blog 长文（一篇一个文件） |
| `next-web/docs/superpowers/verification/2026-10-03-next-web-tech-article-series-batch1.md` | 第 1 批的取证与核对记录 |

slug 对照（全系列，本计划只做前三个）：

| # | 技术项 | slug |
|---|---|---|
| ① | 总览 | `next-web-overview` |
| ② | SEO | `next-web-seo` |
| ③ | 缓存（Next.js 层） | `next-web-caching` |
| ④ | 缓存（边缘层） | `next-web-edge-cache` |
| ⑤ | RSC / client island | `next-web-rsc` |
| ⑥ | 静态生成策略 | `next-web-static-rendering` |
| ⑦ | RLS 与权限边界 | `next-web-rls` |
| ⑧ | 数据库查询优化 | `next-web-query-optimization` |
| ⑨ | 写入正确性 | `next-web-write-correctness` |
| ⑩ | 写路径安全 | `next-web-write-security` |
| ⑪ | 数据同步 | `next-web-data-sync` |
| ⑫ | 数据质量治理 | `next-web-data-quality` |
| ⑬ | 前端渲染与包体 | `next-web-frontend-bundle` |
| ⑭ | 验证机制 | `next-web-verification` |

后续批次按同一模板另开计划：④⑤⑥ / ⑦⑧⑨ / ⑩⑪⑫ / ⑬⑭。

---

### Task 1: 提交 blog 侧渲染管线与已确认样张

**Files:**
- Modify: `blog/.gitignore`（已加 `.xhs-tmp/`）
- Create: `blog/scripts/xhs-render.mjs`（已存在，待提交）
- Create: `blog/xhs/next-web-caching/cards.mjs`（已存在，待提交）
- Create: `blog/public/xhs/next-web-caching/01-cover.png`、`02-compare.png`（已存在，待提交）

**Interfaces:**
- Produces: 渲染器 CLI `node scripts/xhs-render.mjs --slug <slug> [--only N] [--check] [--list]`；`blog/xhs/<slug>/cards.mjs` 的导出约定（`export const cards` 或 `export default`，数组元素含 `kind` 字段）；三种模板名 `cover` / `compare` / `list`。
- Consumes: 无。

- [ ] **Step 1: 确认工作区状态，识别不属于本计划的改动**

```bash
cd /Users/box/UMHelper/blog && git status --short
```

Expected: 看到 `M .gitignore`、`?? public/xhs/`、`?? scripts/`、`?? xhs/`，**以及一个不属于本计划的 `M package-lock.json`**（文件时间早于本次工作）。后面的 `git add` 必须逐个写路径，**禁止 `git add -A` 或 `git add .`**。

- [ ] **Step 2: 只暂存本计划的文件**

```bash
cd /Users/box/UMHelper/blog
git add .gitignore scripts/xhs-render.mjs xhs/next-web-caching public/xhs/next-web-caching
git status --short
```

Expected: 暂存区里是 `.gitignore`、`scripts/xhs-render.mjs`、`xhs/next-web-caching/cards.mjs`、`public/xhs/next-web-caching/` 下两个 PNG；`package-lock.json` 仍在未暂存区。

- [ ] **Step 3: 提交**

```bash
cd /Users/box/UMHelper/blog
git commit -m "feat(xhs): add card renderer and confirmed caching series cards"
```

- [ ] **Step 4: 验证渲染可复现（同输入同输出）**

```bash
cd /Users/box/UMHelper/blog
node scripts/xhs-render.mjs --slug next-web-caching
shasum -a 256 public/xhs/next-web-caching/*.png
node scripts/xhs-render.mjs --slug next-web-caching
shasum -a 256 public/xhs/next-web-caching/*.png
```

Expected: 两次输出的 SHA-256 完全一致；两次都打印 `已渲染 2 张卡片`。

- [ ] **Step 5: 验证排版体检通过**

```bash
cd /Users/box/UMHelper/blog && node scripts/xhs-render.mjs --slug next-web-caching --check
```

Expected: 两张卡都输出 `内容底部 N/1440`、`右边界 N/1080`、`中文体 命中`、`✓ 未被裁切，字体命中`；退出码 0。允许出现 `· 字形 ink 溢出（不影响显示）` 的提示行。

- [ ] **Step 6: 确认没有遗留 headless 进程**

```bash
ps -eo pid,command | grep "xhs-tmp" | grep -v grep | wc -l
```

Expected: `0`。非 0 时按 PID 精确清理（`kill -9 <pid>`），**不要用 `pkill Chrome`**——用户自己的浏览器会一起被杀。

---

### Task 2: ① 总览篇 blog 成稿

**Files:**
- Create: `blog/src/content/blog/next-web-overview.md`

**Interfaces:**
- Consumes: Task 1 的提交（无代码依赖）；spec §3 的 14 项技术项编号。
- Produces: 系列导航文，后续 13 篇在"延伸阅读"里回链本文；本文的 14 行技术项表格是后续篇目文案的编号来源。

- [ ] **Step 1: 现取所有计数（不要沿用文档里的数字）**

```bash
cd /Users/box/UMHelper/next-web
ls docs/superpowers/specs/*.md | grep -v tech-article-series | wc -l
ls docs/superpowers/verification/*.md | grep -v tech-article-series | wc -l
ls supabase/migrations/*.sql | wc -l
find tests -name "*.test.ts*" | wc -l
grep -rn "export const revalidate" app | wc -l
grep -rn "force-dynamic" app | wc -l
grep -rl '"use client"' components app | wc -l
sed -n '/## 2. 当前结论摘要/,/## 3. 已确认问题/p' docs/technical-optimization-audit.md
```

Expected: 每条命令都有输出；把数字抄进正文，并在正文里标注这是"写作时统计"。

- [ ] **Step 2: 写 frontmatter（逐字使用）**

```yaml
---
author: Box
pubDatetime: 2026-10-05T12:00:00Z
title: 一次整站优化动了哪些技术
postSlug: next-web-overview
featured: false
draft: false
tags:
  - next-web
  - performance
description: 把整站优化拆成 14 项能单独复用的技术：构建、缓存、权限、查询、同步、包体，每项都说清适用边界。
---
```

- [ ] **Step 3: 写正文，七段骨架逐段落地**

必须按顺序出现这些二级标题：

```markdown
## Table of contents

## TL;DR

## 这次优化解决什么问题

## 我们原来的状态

## 14 项技术分别是什么

## 落地效果

## 适用边界

## 延伸阅读
```

各段的硬要求：

1. `## TL;DR`：≤150 字，无代码无术语。
2. `## 这次优化解决什么问题`：讲清"构建慢"和"服务端耦合"是两个不同的病，不是一个"性能问题"。
3. `## 我们原来的状态`：只写有出处的现象，逐条标来源，例如全量静态生成约 5000+ 页面、`/timetable` 路由 410 kB / 首屏 555 kB（来源：`docs/technical-optimization-audit.md` §3、§7）。
4. `## 14 项技术分别是什么`：表格，14 行，列 = 编号 / 技术项 / 解决什么问题 / 主要文件，逐行照抄 spec §3 的技术项与必引证据。
5. `## 落地效果`：只写能指到 `file:line` 或 verification 的数字；没有量化的写"未量化"。
6. `## 适用边界`：至少三条"这项系列里的做法不适合什么场景"（例如：数据量小到一个请求能全量返回时，RPC 化是过度设计）。
7. `## 延伸阅读`：链到 `docs/technical-optimization-audit.md` 与本系列 spec。

- [ ] **Step 4: 逐条核对 spec §7 的质检清单**

对照 spec §7：数字可查、适用边界有实质内容、frontmatter 字段齐全、`postSlug` 前缀、`tags` 含 `next-web`、正文含 `## Table of contents`、未量化项已标注。发现不合格项就地改。

- [ ] **Step 5: 用构建验证 frontmatter schema**

```bash
cd /Users/box/UMHelper/blog && npm run build
```

Expected: 构建成功，无 content collection 校验报错。若报 `ogImage` 或必填字段错误，按 `blog/src/content/config.ts` 修正 frontmatter 后重跑。

- [ ] **Step 6: 提交**

```bash
cd /Users/box/UMHelper/blog
git add src/content/blog/next-web-overview.md
git commit -m "docs(blog): add series overview on next-web optimization"
```

---

### Task 3: ① 总览篇 小红书笔记与卡片

**Files:**
- Modify: `blog/scripts/xhs-render.mjs`（新增 `list` 模板）
- Create: `blog/xhs/next-web-overview/cards.mjs`
- Create: `blog/xhs/next-web-overview/note.md`
- Create: `blog/public/xhs/next-web-overview/*.png`（渲染产物）

**Interfaces:**
- Consumes: Task 1 的渲染器 CLI 与 `cards` 导出约定。
- Produces: `list` 与 `tail` 两个新模板的卡片结构 —— `{ kind: "list", series, seq, title, items: [{ index, text }], note?, brand, right }`、`{ kind: "tail", series, seq, title, body, cta, brand, right }`，后续篇目直接复用。

- [ ] **Step 1: 给渲染器加 `list` 模板**

在 `blog/scripts/xhs-render.mjs` 中，紧跟 `compareCard` 之后插入：

```js
/** 清单卡：一项技术的若干要点（总览/导航用） */
function listCard(card) {
  const items = card.items
    .map((it) => `<li><span class="idx">${it.index}</span><span class="txt">${it.text}</span></li>`)
    .join("");
  return shell(
    `${topbar(card.series, card.seq)}
     <div class="stage">
       <div class="card-title">${card.title}</div>
       <ul class="list">${items}</ul>
       ${card.note ? `<div class="note">${card.note}</div>` : ""}
     </div>
     ${footer(card.brand, card.right)}`,
    `
    .card-title { font-size: 62px; font-weight: 700; line-height: 1.32; margin-bottom: 40px; }
    .list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 22px; }
    .list li { display: flex; gap: 22px; align-items: baseline; font-size: 36px; line-height: 1.5; }
    .list .idx { color: ${THEME.accent}; font-variant-numeric: tabular-nums; font-size: 30px; }
    .note { margin-top: 36px; font-size: 30px; line-height: 1.6; color: ${THEME.textDim}; }
    `,
  );
}
```

紧跟其后插入尾图卡模板：

```js
/** 尾图卡：收尾 + 引导（每篇笔记最后一张） */
function tailCard(card) {
  return shell(
    `${topbar(card.series, card.seq)}
     <div class="stage">
       <div class="card-title">${card.title}</div>
       <div class="tail-body">${card.body}</div>
       <div class="cta">${card.cta}</div>
     </div>
     ${footer(card.brand, card.right)}`,
    `
    .card-title { font-size: 68px; font-weight: 700; line-height: 1.32; margin-bottom: 40px; }
    .tail-body { font-size: 38px; line-height: 1.66; color: ${THEME.text}; max-width: 880px; }
    .cta {
      margin-top: 56px; padding: 30px 40px; border-radius: 24px;
      background: ${THEME.bgSoft}; border: 1px solid ${THEME.rule};
      font-size: 34px; line-height: 1.5; color: ${THEME.accent};
    }
    `,
  );
}
```

并把注册行改为：

```js
const TEMPLATES = { cover: coverCard, compare: compareCard, list: listCard, tail: tailCard };
```

- [ ] **Step 2: 验证新模板可用且未破坏已有卡片**

```bash
cd /Users/box/UMHelper/blog
node --check scripts/xhs-render.mjs
node scripts/xhs-render.mjs --slug next-web-caching --check
```

Expected: 语法检查无输出（通过）；缓存篇两张卡的体检仍然全过（回归验证）。

- [ ] **Step 3: 写卡片文案 `cards.mjs`**

```js
/**
 * 小红书卡片定义：① 总览
 * 规则见 next-web/docs/superpowers/specs/2026-10-03-next-web-tech-article-series-design.md §5.2
 */

const series = { label: "选咩课优化", total: 14 };

const cards = [
  {
    kind: "cover",
    series,
    seq: 1,
    title: [{ text: "整站优化" }, { text: "拆成 14 项技术", highlight: true }],
    subtitle: "构建、缓存、权限、查询、同步、包体，每一项都单独讲清适用边界。",
    brand: "UMHelper · What2REG@UM",
    right: "系列第 1 篇",
  },
  {
    kind: "list",
    series,
    seq: 1,
    title: "先看地图，再看细节",
    items: [
      { index: "01", text: "构建：不再全量预渲染" },
      { index: "02", text: "SEO：metadata、sitemap、结构化数据" },
      { index: "03", text: "缓存：按数据变更频率分层" },
      { index: "04", text: "权限：数据库默认拒绝访问" },
      { index: "05", text: "查询：把聚合下沉到数据库" },
      { index: "06", text: "同步：页面不再直连第三方接口" },
    ],
    note: "14 项技术的完整清单在长文里，本篇只做导航。",
    brand: "UMHelper · What2REG@UM",
    right: "下一篇：SEO 到底改了什么",
  },
  {
    kind: "tail",
    series,
    seq: 1,
    title: "后面 13 篇怎么排",
    body: "每篇只讲一项技术：它解决什么问题、我们原来的写法错在哪、怎么改、改完什么效果、以及什么情况下不该这么用。",
    cta: "想看哪一项先讲？评论区说一声。",
    brand: "UMHelper · What2REG@UM",
    right: "完整清单在同名长文",
  },
];

export { cards };
export default cards;
```

- [ ] **Step 4: 写笔记文案 `note.md`**

结构固定为四块，逐块写全：

```markdown
# 标题
整站优化拆成 14 项技术

# 正文
（≤900 字。开头一句说明做了什么范围的工作；中间按 3 个要点展开，每个要点对应一张图；结尾一句给结论。不出现代码，术语按"英文简写（中文翻译）"写法。）

# 标签
#网站优化 #性能优化 #Next.js #前端开发 #程序员

# 配图
01-cover.png —— 封面
02-list.png —— 14 项技术的地图（正文 3 要点对应此图）
03-tail.png —— 尾图，引导评论
```

- [ ] **Step 5: 渲染并体检**

```bash
cd /Users/box/UMHelper/blog
node scripts/xhs-render.mjs --slug next-web-overview
node scripts/xhs-render.mjs --slug next-web-overview --check
```

Expected: 打印 `已渲染 3 张卡片 → public/xhs/next-web-overview/`；体检三张都 `✓ 未被裁切，字体命中`，退出码 0。

- [ ] **Step 6: 数字校验（笔记里出现的数字必须与 Task 2 正文一致）**

```bash
cd /Users/box/UMHelper/blog
grep -o "14" xhs/next-web-overview/note.md | wc -l
grep -c "14 项" src/content/blog/next-web-overview.md
```

Expected: 两处都 > 0；笔记里若出现其他数字（页面数、测试数），必须能在 Task 2 的正文里找到同一个数字。

- [ ] **Step 7: 提交**

```bash
cd /Users/box/UMHelper/blog
git add scripts/xhs-render.mjs xhs/next-web-overview public/xhs/next-web-overview
git commit -m "docs(xhs): add overview note cards and list template"
```

---

### Task 4: ② SEO 篇 blog 成稿

**Files:**
- Create: `blog/src/content/blog/next-web-seo.md`

**Interfaces:**
- Consumes: Task 2 的总览篇（在"延伸阅读"回链 ①）。
- Produces: ② 的小红书笔记（Task 5）复用的三条"改前/改后"事实。

- [ ] **Step 1: 取证（逐条执行，记录输出）**

```bash
cd /Users/box/UMHelper/next-web
grep -rn "generateMetadata" app | wc -l
cat app/robots.ts
sed -n '1,30p' app/sitemap.ts
sed -n '44,86p' app/sitemap.ts
ls components/seo tests/seo
sed -n '1,40p' lib/seo.ts
sed -n '1,45p' lib/sitemap-data.ts
```

Expected: `robots.ts` 里能看到 `disallow: ["/admin/", "/api/", "/submit/", "/search/", "/sign-in", "/sign-up"]` 与 `sitemap: "https://umeh.top/sitemap.xml"`；`sitemap.ts` 第 79 行是 `Promise.all([...])`（审计里"未 await 的 async map"已修）；`components/seo/` 下有 `json-ld.tsx` 与 `course-json-ld.tsx`。

- [ ] **Step 2: 写 frontmatter（逐字使用）**

```yaml
---
author: Box
pubDatetime: 2026-10-06T12:00:00Z
title: SEO 不只是加 meta：动态渲染站的收录改造
postSlug: next-web-seo
featured: false
draft: false
tags:
  - next-web
  - seo
description: metadata、sitemap、robots、结构化数据在一个动态渲染站里各自解决什么，哪些属于过度设计。
---
```

- [ ] **Step 3: 写正文，七段骨架逐段落地**

```markdown
## Table of contents

## TL;DR

## 搜索引擎在动态站上会遇到什么

## 我们原来的写法

## 怎么改

## 落地效果

## 适用边界

## 延伸阅读
```

硬要求：

1. `## TL;DR`：≤150 字，无代码无术语。
2. `## 我们原来的写法`：写清 sitemap 里 `faculty.map(async ...)` 没被 await 导致 sitemap 可能不完整、并且构建期重复全表扫描（来源：`docs/technical-optimization-audit.md` §P1 Sitemap）。
3. `## 怎么改`：metadata 生成（`app/**` 下 9 处 `generateMetadata`）、`app/robots.ts` 的分区规则、`app/sitemap.ts:79` 的 `Promise.all` 与 `revalidate = 86400`、结构化数据组件（`components/seo/json-ld.tsx`、`components/seo/course-json-ld.tsx`）。
4. `## 落地效果`：只写能指到 `file:line` 或 verification 的结论；hero 图从 4 MB 的 `felina2.jpeg` 换成 `public/images/hero-*.jpg` 可引 `verification/2026-09-21-next-web-componentization-seo.md`。
5. `## 适用边界`：至少三条，必须包含"什么时候不需要 sitemap 分片""什么时候结构化数据是负收益（内容与标记不一致会被判作弊）"。
6. `## 延伸阅读`：`docs/superpowers/specs/2026-09-21-next-web-componentization-seo-design.md`、① 总览篇。

- [ ] **Step 4: 逐条核对质检清单**

1. 文中每个数字都能指到 `docs/technical-optimization-audit.md`、`verification/*.md` 或代码 `file:line`
2. 第 6 段"适用边界"有实质内容，不是套话
3. frontmatter 能通过 `blog/src/content/config.ts` 的 schema（`npm run build` 过）
4. `postSlug` 有 `next-web-` 前缀，`tags` 含 `next-web`
5. 正文含 `## Table of contents`
6. 小红书正文 ≤900 字、卡片 3 张且均 1080×1440（第 1 批规模）
7. 未量化的收益已显式标注"未量化"

发现不合格项就地改，改完重跑本步骤。

- [ ] **Step 5: 构建验证**

```bash
cd /Users/box/UMHelper/blog && npm run build
```

Expected: 构建成功。

- [ ] **Step 6: 提交**

```bash
cd /Users/box/UMHelper/blog
git add src/content/blog/next-web-seo.md
git commit -m "docs(blog): add SEO optimization article"
```

---

### Task 5: ② SEO 篇 小红书笔记与卡片

**Files:**
- Create: `blog/xhs/next-web-seo/cards.mjs`
- Create: `blog/xhs/next-web-seo/note.md`
- Create: `blog/public/xhs/next-web-seo/*.png`

**Interfaces:**
- Consumes: Task 3 的 `list` 模板与 `cards` 导出约定；Task 4 的三条事实。
- Produces: 无（② 为独立笔记）。

- [ ] **Step 1: 写 `cards.mjs`**

```js
/**
 * 小红书卡片定义：② SEO
 * 规则见 next-web/docs/superpowers/specs/2026-10-03-next-web-tech-article-series-design.md §5.2
 */

const series = { label: "选咩课优化", total: 14 };

const cards = [
  {
    kind: "cover",
    series,
    seq: 2,
    title: [{ text: "动态渲染的站" }, { text: "也能被收录", highlight: true }],
    subtitle: "收录靠三件事：可枚举的 URL、准确的 metadata、能被解析的结构化数据。",
    brand: "UMHelper · What2REG@UM",
    right: "第 2 篇",
  },
  {
    kind: "compare",
    series,
    seq: 2,
    title: "sitemap 的两种写法",
    sides: [
      {
        tone: "bad",
        label: "改之前",
        points: [
          "把异步生成写在 map 里，没有等待完成",
          "结果可能不完整，构建期还重复全表扫描",
          "robots.txt 没有区分可收录与不可收录的路径",
        ],
      },
      {
        tone: "good",
        label: "改之后",
        points: [
          "用 Promise.all 收齐所有分支再返回",
          "sitemap 自身也带缓存时长，构建期不再反复查库",
          "robots 明确排除管理后台、接口、提交页",
        ],
      },
    ],
    note: "结构化数据只在内容与标记一致时才加分，凑标记属于负收益。",
    brand: "UMHelper · What2REG@UM",
    right: "下一篇：缓存按粒度分层",
  },
  {
    kind: "tail",
    series,
    seq: 2,
    title: "收录是长期活",
    body: "sitemap 决定搜索引擎能不能找到页面，metadata 决定摘要长什么样，结构化数据决定能不能出富摘要。三件事都能验证，别凭感觉。",
    cta: "你们站有没有收录问题？评论区聊聊。",
    brand: "UMHelper · What2REG@UM",
    right: "完整技术文在同名长文",
  },
];

export { cards };
export default cards;
```

- [ ] **Step 2: 写 `note.md`**

```markdown
# 标题
动态渲染的站也能被收录

# 正文
（≤900 字。开头一句说明这次改的是收录链路；中间按 3 个要点展开：sitemap 要能被完整生成、metadata 要准确、结构化数据要与内容一致；结尾一句给结论。不出现代码，术语按"英文简写（中文翻译）"写法。）

# 标签
#SEO #网站优化 #Next.js #前端开发

# 配图
01-cover.png —— 封面
02-compare.png —— sitemap 的两种写法
03-tail.png —— 尾图，引导评论
```

- [ ] **Step 3: 渲染并体检**

```bash
cd /Users/box/UMHelper/blog
node scripts/xhs-render.mjs --slug next-web-seo
node scripts/xhs-render.mjs --slug next-web-seo --check
```

Expected: `已渲染 3 张卡片`；体检三张全过，退出码 0。

- [ ] **Step 4: 提交**

```bash
cd /Users/box/UMHelper/blog
git add xhs/next-web-seo public/xhs/next-web-seo
git commit -m "docs(xhs): add SEO note cards"
```

---

### Task 6: ③ 缓存篇 blog 成稿

**Files:**
- Create: `blog/src/content/blog/next-web-caching.md`

**Interfaces:**
- Consumes: Task 1 已提交的卡片（同一 slug 的卡片文案可作为长文的事实校验源）。
- Produces: 与卡片一致的三个数字：详情页 1 小时、列表页 5 分钟、写入后按标签失效。

- [ ] **Step 1: 取证（逐条执行）**

```bash
cd /Users/box/UMHelper/next-web
grep -rn "export const revalidate" app
grep -rn "force-dynamic" app | wc -l
cat lib/cache-tags.ts
sed -n '1,25p' lib/cache-invalidation.ts
sed -n '1,12p' lib/database/get-public-comment-list.ts
sed -n '50,60p' app/api/admin/app-config/route.ts
cat open-next.config.ts
sed -n '36,50p' wrangler.jsonc
```

Expected: `revalidate` 出现在 `app/course/[code]/page.tsx:9`（3600）、`app/professor/[...name]/page.tsx:11`（3600）、`app/reviews/[code]/[...prof]/page.tsx:13`（300）、`app/sitemap.ts:7`（86400）；`CACHE_TAGS` 六个标签；`open-next.config.ts` 里是 `r2IncrementalCache` + `d1NextTagCache`；`wrangler.jsonc` 里 R2 bucket `next-web-inc-cache`、D1 `next-web-tag-cache`。

- [ ] **Step 2: 写 frontmatter（逐字使用）**

```yaml
---
author: Box
pubDatetime: 2026-10-07T12:00:00Z
title: 缓存失效要按粒度做：从整页动态到标签失效
postSlug: next-web-caching
featured: false
draft: false
tags:
  - next-web
  - caching
description: 什么时候可以用时间缓存、什么时候必须按标签失效，以及边缘缓存里 R2 与 D1 各自负责什么。
---
```

- [ ] **Step 3: 写正文，七段骨架逐段落地**

```markdown
## Table of contents

## TL;DR

## 缓存到底在解决什么问题

## 我们原来的写法

## 怎么改

## 落地效果

## 适用边界

## 延伸阅读
```

硬要求：

1. `## 我们原来的写法`：写清评论页是 `revalidate = 0` + `dynamic = "force-dynamic"`，每次请求都查库（来源：`docs/technical-optimization-audit.md` §P1 页面读取路径缺少缓存层）；并给出当时的对照——全站 44 处 `force-dynamic`。
2. `## 怎么改`：三层——页面级 `revalidate`（1 小时 / 5 分钟 / sitemap 24 小时）、数据级 `unstable_cache`（`lib/database/get-public-comment-list.ts:7`）、写入路径 `revalidateTag`（`lib/cache-invalidation.ts`）；再讲边缘侧 `open-next.config.ts` 的 R2 增量缓存与 D1 标签缓存。
3. `## 落地效果`：写清"写入路径触发失效、时间到期只是兜底"这一机制；没有命中率数据就写"未量化"。
4. `## 适用边界`：至少三条，必须包含"什么时候不该用标签失效（写多读少、或数据本身就没被多人读）""什么时候该直接关掉缓存"。
5. `## 延伸阅读`：`docs/superpowers/specs/2026-09-19-next-web-caching-sync-design.md`、① 总览篇。

- [ ] **Step 4: 与卡片口径对齐（同一篇的两种形态不能自相矛盾）**

```bash
cd /Users/box/UMHelper
grep -n "1 小时\|5 分钟\|按标签失效\|按缓存标签失效" blog/xhs/next-web-caching/cards.mjs
grep -n "1 小时\|5 分钟\|按标签失效" blog/src/content/blog/next-web-caching.md
```

Expected: 时长数字（1 小时 / 5 分钟）与失效机制在两边一致；不一致就改长文或改卡片，不能两边各写一套。

- [ ] **Step 5: 逐条核对质检清单**

1. 文中每个数字都能指到 `docs/technical-optimization-audit.md`、`verification/*.md` 或代码 `file:line`
2. 第 6 段"适用边界"有实质内容，不是套话
3. frontmatter 能通过 `blog/src/content/config.ts` 的 schema（`npm run build` 过）
4. `postSlug` 有 `next-web-` 前缀，`tags` 含 `next-web`
5. 正文含 `## Table of contents`
6. 小红书正文 ≤900 字、卡片 3 张且均 1080×1440（第 1 批规模）
7. 未量化的收益已显式标注"未量化"

- [ ] **Step 6: 构建验证**

```bash
cd /Users/box/UMHelper/blog && npm run build
```

Expected: 构建成功。

- [ ] **Step 7: 提交**

```bash
cd /Users/box/UMHelper/blog
git add src/content/blog/next-web-caching.md
git commit -m "docs(blog): add caching optimization article"
```

---

### Task 7: ③ 缓存篇 小红书笔记

**Files:**
- Create: `blog/xhs/next-web-caching/note.md`
- Modify: `blog/public/xhs/next-web-caching/*.png`（仅当文案变动时重渲）

**Interfaces:**
- Consumes: Task 1 已提交的 `blog/xhs/next-web-caching/cards.mjs`。
- Produces: 无。

- [ ] **Step 1: 给 ③ 的 cards.mjs 补一张尾图卡**

在 `blog/xhs/next-web-caching/cards.mjs` 的 `cards` 数组末尾、`];` 之前插入：

```js
  {
    kind: "tail",
    series,
    seq: 3,
    title: "缓存的判断标准",
    body: "先问数据多久变一次，再问变了之后谁必须立刻看到。前者决定缓存时长，后者决定要不要按标签失效。",
    cta: "你们的缓存时长是怎么定的？评论区说说。",
    brand: "UMHelper · What2REG@UM",
    right: "完整技术文在同名长文",
  },
```

- [ ] **Step 2: 写 `note.md`**

```markdown
# 标题
缓存失效要按粒度做

# 正文
（≤900 字。开头一句说明原来每次请求都查库；中间按 3 个要点展开，必须复述卡片上的三条改后做法：按数据变更频率分层、写入后按缓存标签失效、未变更的数据继续命中；结尾一句给结论。不出现代码，术语按"英文简写（中文翻译）"写法。）

# 标签
#缓存 #性能优化 #网站优化 #Next.js

# 配图
01-cover.png —— 封面
02-compare.png —— 列表页的两种缓存策略
03-tail.png —— 尾图，引导评论
```

- [ ] **Step 3: 重渲并体检（本步改了卡片，必须重渲）**

```bash
cd /Users/box/UMHelper/blog
node scripts/xhs-render.mjs --slug next-web-caching
node scripts/xhs-render.mjs --slug next-web-caching --check
```

Expected: `已渲染 3 张卡片`；体检三张全过，退出码 0。此前 2 张的 SHA-256 会变（新增了尾图卡，属预期）。

- [ ] **Step 4: 数字一致性校验**

```bash
cd /Users/box/UMHelper/blog
grep -n "1 小时\|5 分钟" xhs/next-web-caching/note.md xhs/next-web-caching/cards.mjs src/content/blog/next-web-caching.md
```

Expected: 三处数字一致。

- [ ] **Step 5: 提交**

```bash
cd /Users/box/UMHelper/blog
git add xhs/next-web-caching/cards.mjs xhs/next-web-caching/note.md public/xhs/next-web-caching
git commit -m "docs(xhs): add caching note copy and tail card"
```

---

### Task 8: 第 1 批验证文档

**Files:**
- Create: `next-web/docs/superpowers/verification/2026-10-03-next-web-tech-article-series-batch1.md`

**Interfaces:**
- Consumes: Task 1–7 的全部产物与命令输出。
- Produces: 第 1 批的取证记录，供后续批次照抄格式。

- [ ] **Step 1: 重新跑一遍全部可复现检查并留证**

```bash
cd /Users/box/UMHelper/blog
node scripts/xhs-render.mjs --list
node scripts/xhs-render.mjs --slug next-web-overview --check
node scripts/xhs-render.mjs --slug next-web-seo --check
node scripts/xhs-render.mjs --slug next-web-caching --check
shasum -a 256 public/xhs/*/*.png
npm run build
```

Expected: `--list` 列出 3 个 slug；三份体检全过；构建成功。

- [ ] **Step 2: 记录两仓库的提交哈希**

```bash
cd /Users/box/UMHelper/blog && git log --oneline -6
cd /Users/box/UMHelper/next-web && git log --oneline -3
```

- [ ] **Step 3: 写验证文档**，必须包含四块：

1. 取证表：每篇的每个数字 → 来源（`file:line` 或 verification 文档）。
2. 质检清单：spec §7 九条的逐条结果。
3. 渲染体检输出：三条 `--check` 的原始输出粘贴。
4. 未量化项清单：系列里哪些结论目前没有实测数据，明确标注。
5. **已知偏差**：第 1 批每篇只出 3 张卡片，低于 spec §5.2 的 6–9 张；原因是先跑通形态再堆量，第 2 批补齐。写明这是有意为之，不是漏做。
6. **未决事项**：blog 是否需要专门的系列聚合页（spec §8 R5），等第 1 批发布后按实际效果决定。
7. 两仓库提交哈希。

- [ ] **Step 4: 核对"未量化项"没有在成稿里被写成结论**

```bash
cd /Users/box/UMHelper/blog
grep -rn "命中率\|提升.*%\|快了.*倍" src/content/blog/next-web-*.md
```

Expected: 命中即需人工确认该数字有出处；无出处则改为定性描述并标注"未量化"。

- [ ] **Step 5: 提交**

```bash
cd /Users/box/UMHelper/next-web
git add docs/superpowers/verification/2026-10-03-next-web-tech-article-series-batch1.md
git commit -m "docs: verification for article series batch 1"
```

- [ ] **Step 6: 交付确认**

对照 spec §2.1 的目标逐条确认：G1（本批 3 篇构成本系列的入口与两条主线）、G2（每个数字有出处）、G3（小红书文案 + 卡片齐备）、G4（渲染可复现）、G5（规则已固化，后续批次无需重新决策）。任何一条不满足，回到对应任务修，不要带着缺口开下一批。

---

## 批次边界

本计划到此为止。第 2 批（④ 缓存边缘层、⑤ RSC、⑥ 静态生成策略）另开计划，必须复用本计划已固化的：渲染器 CLI、`list` 模板、note.md 结构、验证文档格式、两仓库提交边界。
