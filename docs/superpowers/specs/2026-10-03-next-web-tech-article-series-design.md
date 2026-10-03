# next-web 优化技术系列文章设计

> 状态：Draft，等待人工 review
> 日期：2026-10-03
> 前置：`blog`（AstroPaper v3，`blog.umhelper.com`）的 `src/content/config.ts` 内容 schema 与 `astro.config.ts` markdown 配置；next-web 的 `docs/technical-optimization-audit.md` 与 `docs/superpowers/{specs,plans,verification}/**`；本机 Google Chrome（headless 截图）
> 后续计划：review 通过后，用 `writing-plans` 生成实施计划

---

## 1. 背景

### 1.1 素材现状

next-web 在 2026-08 到 2026-10 之间做过一轮覆盖整站的优化，留下了三类可引用的原始素材：

| 素材 | 位置 | 提供什么 |
|---|---|---|
| 整站审计 | `docs/technical-optimization-audit.md`（389 行） | 优化前的问题清单、实测数字、优化优先级 |
| 设计 spec | `docs/superpowers/specs/*.md`（20 份，不含本文） | 每项优化"当时为什么这么选" |
| 实施与验证 | `docs/superpowers/plans/*.md`、`docs/superpowers/verification/*.md` | 落地过程与可复核结果 |

可用的量化锚点（本文写作时已核对）：

- 构建：`next build` 曾失败，且全量静态生成约 5000+ 页面 → 现产出 54 个页面（`technical-optimization-audit.md` §3、§7）
- 包体：`/timetable` 路由 410 kB、首屏 555 kB（同上 §7）
- 数据质量：`prof_info` 尾空格 383 → 0、`prof_with_course` 尾空格 756 → 0、trim 后重复映射 522 → 0、评论悬空关联 0（同上 §2.1）
- 广告位投放实测：9.8% / 7.7% / 8.9%（`verification/2026-10-02-masonry-ads.md`）
- 测试规模：`find tests -name "*.test.ts*" | wc -l` 现取（2026-10-03 为 115）；`verification/2026-09-21-clerk-auth-boundary-hardening.md` 记录过当时 49 files / 158 tests 全绿

> 注意：仓库在被并行修改，上面这类计数（测试数、页面数、缓存命中项）**写作时必须现取并注明命令**，不要沿用本文档的数字（对应 R6）。

### 1.2 渠道现状

blog 是独立仓库（`git@github.com:UMHelper/blog.git`），目前 3 篇文章。发布一篇新文章的硬约束：

- `blog/src/content/config.ts`：`author`、`pubDatetime`、`title`、`postSlug`、`tags`、`description` 必填；`ogImage` 若提供必须 ≥1200×630
- `blog/astro.config.ts`：`remark-toc` + `remark-collapse`（`test: "Table of contents"`），shiki 主题 `one-dark-pro` 且 `wrap: true`
- `blog/src/config.ts`：`postPerPage = 3`

小红书：正文上限 1000 字，读者实际在图片上消费内容，代码块不可读。

### 1.3 已确认的决策

| 项 | 结论 |
|---|---|
| 主题 | 讲整站优化用到的**技术**（SEO、缓存、RLS…），不是优化流水账、也不是审计报告复述 |
| 渠道 | blog + 小红书，一主题两形态 |
| 分层 | 每个主题 = 1 篇 blog 深度文 + 1 条小红书图文笔记；深度文开头带 ≤150 字无术语 TL;DR |
| 语言 | 全中文，技术术语保留英文原词 |
| 配图 | 卡片图由本机 Chrome headless 渲染，零新 npm 依赖、不联网 |

## 2. 目标与非目标

### 2.1 目标

- **G1**：13 篇技术项文章构成系列，读者读完能理解整站用到的优化技术，以及每项技术的**适用边界**
- **G2**：每篇的技术结论与数字都能指到仓库里的具体文件或 verification 记录，可复核
- **G3**：每个主题同时产出小红书图文笔记（文案 + 卡片图），可直接发布
- **G4**：卡片图渲染可重复执行，同输入产出同结果
- **G5**：系列结构与转换规则固定下来，后续加篇不需要重新决策

### 2.2 非目标

- **N1**：不写团队与项目八卦
- **N2**：不重写 `technical-optimization-audit.md`，也不逐条复述它
- **N3**：不修改 blog 现有 3 篇文章与站点结构
- **N4**：不引入新的构建依赖或联网服务
- **N5**：没有实测支撑的收益不写成结论——只做定性说明，并在文中明确标注"未量化"

## 3. 系列结构：13 篇技术项

篇号即阅读顺序：①→③ 由外到内看请求链路，④⑤ 讲渲染策略，⑥→⑪ 讲数据与安全，⑫ 前端，⑬ 收尾回到"怎么保证不反弹"。

| # | 技术项 | 要回答的问题 | 必引证据 |
|---|---|---|---|
| ① | SEO | 一个动态课程站怎么让搜索引擎读懂并收录 | `app/sitemap.ts:7`、`app/robots.ts`、`lib/seo.ts`、`lib/sitemap-data.ts`、`tests/sitemap.test.ts`、`tests/robots.test.ts`、`tests/seo/{metadata,json-ld,course-json-ld}.test.*`、`specs/2026-09-21-next-web-componentization-seo-design.md`、`verification/2026-09-21-next-web-componentization-seo.md` |
| ② | 缓存（Next.js 层） | `revalidate`、`tags`、`revalidateTag` 怎么替代"整页动态渲染" | `lib/cache-tags.ts`、`lib/cache-invalidation.ts:1-22`、`app/course/[code]/page.tsx:9`、`app/professor/[...name]/page.tsx:11`、`app/reviews/[code]/[...prof]/page.tsx:13`（审计时为 `revalidate = 0` + `force-dynamic`）、`lib/database/get-public-comment-list.ts:1,7`、`app/api/admin/app-config/route.ts:1,57`、`specs/2026-09-19-next-web-caching-sync-design.md`；对照：全站 44 处 `force-dynamic` 现仅存于 `app/admin/**`、`app/compare/[token]`、`app/api/statistics` |
| ③ | 缓存（边缘层） | Workers 上缓存存在哪，R2 与 D1 各管什么 | `open-next.config.ts`、`wrangler.jsonc:36-46`（R2 `next-web-inc-cache`、D1 `next-web-tag-cache`） |
| ④ | RSC / client island | 只读页面怎么搬回服务端，客户端只留什么 | 审计 §P1 客户端包体、`components/comments.tsx:11,28`（`Map` 归并已落地）、`app/timetable/page.tsx`、全仓 60 个 `"use client"` 文件 |
| ⑤ | 静态生成策略 | 为什么不再全量 `generateStaticParams`，ISR 与按需渲染怎么分工 | `app/catalog/[...departments]/page.tsx:23`（全仓唯一剩余 `generateStaticParams`）、`app/course/[code]/page.tsx:9`、审计 §P1 |
| ⑥ | RLS 与权限边界 | 数据库怎么做到"默认拒绝" | `supabase/migrations/20260918_security_hardening.sql`、`lib/supabase/{shared,admin,server}.ts`、`verification/2026-09-18-write-api-security.md:49` |
| ⑦ | 数据库查询优化 | N+1 怎么消掉，索引怎么选 | `supabase/migrations/20260812_course_search_rpc.sql`（`pg_trgm` + `gin_trgm_ops`）、`20260812_prof_with_course_indexes.sql`、`lib/database/get-fuzzy-search.ts`、`tests/database/*-sql.test.ts`、审计 §P1 |
| ⑧ | 写入正确性 | 主键该谁生成，聚合更新怎么不放应用层 | `supabase/migrations/20260812_comment_write_rpc.sql`、`20260921_fix_id_sequences.sql`、`tests/database/fix-id-sequences-sql.test.ts`、审计 §2.1 |
| ⑨ | 写路径安全 | 鉴权 → 校验 → 限流 → 审计这条链怎么搭 | `lib/validation/**`（8 个 schema）、`lib/rate-limit.ts`、`lib/admin-audit.ts`、`supabase/migrations/20260918_rate_limit.sql`、`tests/security/**`、`tests/rate-limit.test.ts`、`verification/2026-09-18-write-api-security.md:41-51` |
| ⑩ | 数据同步 | 怎么做到页面不再直连第三方教务 API | `lib/update/**`、`scripts/sync-um.mjs`、`tests/update/**`（8 个）、`lib/telegram.ts`、`specs/plans/verification` 的 `2026-09-21-next-web-update-*` |
| ⑪ | 数据质量治理 | 脏数据怎么清、怎么防复发 | 审计 §2.1（`trg_normalize_prof_info_name`、`trg_normalize_prof_with_course_prof_id`、唯一索引） |
| ⑫ | 前端渲染与包体 | 瀑布流、图片、hydration 一致性怎么做 | `lib/masonry-split.ts`、`tests/masonry-split.test.ts`、`lib/ads/ad-config-server.ts`、`lib/ads/ad-slots.tsx`、`tests/ads/ad-slots.test.ts`、`verification/2026-10-02-masonry-ads.md`、审计 §7 |
| ⑬ | 验证机制 | 怎么保证优化不反弹 | `vitest.config.ts`、`tests/**`（107 个文件）、`verification/2026-09-21-clerk-auth-boundary-hardening.md:30`、`tests/no-dead-deps.test.ts`、`tests/no-legacy-timetable-cart.test.ts` |

合并余地：⑧⑨ 可合为"写入链路"，②③ 可合为"缓存两级"，合并后为 11 篇。是否合并由实施计划决定。

> **2026-10-03 人工决定**：删去 ① 总览篇（原导航篇），系列由 14 篇改为 13 篇，表内篇号按剩余技术项的原顺序重排（SEO 起为 ①，验证机制止于 ⑬）；总览篇的正文、小红书笔记与卡片图一并删除，两篇剩余笔记的卡片总篇数与篇号同步重排。

## 4. 每篇的固定骨架（blog 深度文）

1. **TL;DR**（≤150 字）：无代码、无术语，非技术读者读完这段就够
2. **这项技术要解决什么问题**：从通用层面讲，没做过这个项目的人也能懂
3. **我们原来的写法，错在哪**：给现象，有数字就上数字
4. **技术怎么用**：关键代码，能标 `file:line` 就标
5. **落地后的效果**：引用 verification 里的实测结果
6. **适用边界**：什么情况下**不该**用这项技术
7. **延伸阅读**：仓库内文件 + 官方文档

篇幅 2500–4000 字。第 6 节是系列的核心价值，不允许省略或写成一句空话。

**博客标准（人工要求：整体按"一篇好博客"来审，而不是按规则打勾）**：

| # | 判据 | 不合格的样子 |
|---|---|---|
| A | **3 句内有读者能认领的问题或场景** | 自我介绍开头、目录说明开头、"本文将介绍" |
| B | **读完能拿走一个可迁移的判断**（该不该这么做、什么前提下不该） | 只交代"我们做了什么" |
| C | **有事件顺序**：遇到什么 → 试了什么 → 为什么选这条 → 代价是什么 | 平铺罗列问题清单 |
| D | **正文以段落推进，表格与清单合计不超过约三分之一** | 仓库地图、命令统计表、逐条挂 `file:line` 的清单占主体 |
| E | **数字出现在它支撑的句子里** | 数字集中堆放成表 |
| F | **不出现**仓库路径、行号、文档章节号（§3 P1）、迁移文件名、shell 命令 | 这些出现在正文任何位置 |
| G | **不假设读者知道我们的项目结构** | 直接写 `lib/update/`、`pg_trgm`、`search_path` 而不解释 |
| H | **至少一处真实的代价、弯路或事故**（素材必须来自 verification / 提交历史，不得虚构） | 只写成功结果 |
| I | **结尾落在判断或悬念上** | 结尾是来源清单或"后续 13 篇按顺序发布" |
| J | **小节标题本身有信息量** | "落地效果""延伸阅读"这类空标签充当唯一导航 |
| K | 2500–4000 中文字；段落不超过约 5 行；相邻小节不重复 | 同一件事在两节里说两遍 |

任一条不满足即为文风不合格，评审须判 ❌。这条标准的优先级高于本节的骨架条款：**骨架服务于文章，文章不服务于骨架**——如果某一节为了满足骨架而变成清单，就改动骨架，而不是保留清单。

**真实世界的技术博客写法（2026-10-03 检索，有出处；优先级高于本地骨架条款）**

来源：[PostHog 工程手册 · Writing blogs as an engineer](https://posthog.com/handbook/engineering/writing-blogs)、[Julia Evans · Patterns in confusing explanations](https://jvns.ca/blog/confusing-explanations/)、[Julia Evans · Some tactics for writing in public](https://jvns.ca/blog/2023/08/07/tactics-for-writing-in-public/)。

*骨架*（PostHog 原文给出的通用骨架，取代本系列原先的六段式）：

| 段 | 内容 |
|---|---|
| Hook | 那个让你意外的结果，或者你踩到的痛 |
| Context | 当时的状态，够读者跟上就行 |
| Journey | 调查过程：试了什么、什么失败了、什么成了；**takeaway 写在旅程里，不另起一节** |
| Resolution | 实际改成了什么，给具体数字或图 |

PostHog 原话：「Use descriptive titles along the way rather generic ones like "Background" or "What we learned." If someone was skimming the piece, would the title give them the details they were looking for?」——本系列此前的「落地效果」「适用边界」「延伸阅读」正是被点名的反面。

*姿态*（PostHog）：像写邮件、Slack 消息或 RFC 那样写，不追求"某种博客体"；先想读者的视角与"你想让他记住什么"；两个自检——「这事值得发给一个做工程的朋友吗？」「两年前的你会觉得有用吗？」；「读者能看出是不是 AI 写的，然后打折看待它。」

*解释的清晰度自查表*（Julia Evans 的 13 条"让人看不懂的模式"，逐条对照）：1 对读者知识做过时假设｜2 对读者知识前后期望不一致｜3 生硬的类比｜4 干巴巴的解释配花哨插图｜5 不真实的例子｜6 没有意义的术语｜7 缺关键信息｜8 一次引入太多概念｜9 开头就抽象｜10 没有支撑的断言｜11 没有例子｜12 说"错误做法"却不说错在哪｜13 只说 what 不说 why。配套做法：**给一个具体的人写**（同事、朋友或两年前的自己），不要写给"所有人"；讲事实与故事；不懂的地方直接说"我不确定"。

*本系列首稿的实测命中*（人工否决的实证）：9、13、11、2、7、8 全部命中；10 与 12 属反向偏离（过度引用、却不把代价说清）。

*由此推出的硬规则*（与前两条并列，优先于骨架）：
- **标题必须写出症状与结果**，对照 PostHog 示例「Untangling Tokio and Rayon in production: From 2s latency spikes to 94ms flat」。抽象名词式标题（如「缓存失效要按粒度做」）不合格。
- 小节标题按"扫读者能否拿到信息"来写。
- 一次只引入一个新概念；先解释它是什么、为什么需要它，再往下走。
- 每个抽象判断后面必须跟一个具体例子。
- 开头先交代这是什么产品、读者为什么要在意；结尾给读者一个能带走的判断。

**叙述口吻（人工否决首稿后新增，优先级高于本节其余条款）**：

- **开头必须是场景或具体处境**，不能是「这个站是……」这类自我定义句。读者点进来是因为遇到了同类问题，不是因为关心我们是谁。
- **禁止过程叙述**：正文不得出现「写作时」「现取」「（写作时统计）」以及任何说明"这个数字什么时候数的"的旁白。数字要么是事实，要么不写。
- **禁止仓库内部词汇**：`全仓`、`这个仓`、`§P1` 这类只在仓库语境里有意义的指代不进正文。
- **证据下移**：正文只留读者需要的数字与结论（例如"预渲染路径从 5000+ 收敛到 54 条"）；`file:line`、文档路径、grep 命令统一放进文末「来源」一节，供想核对的人查阅，不打断阅读。
- **用"我们"讲述**：可以讲当时的处境、犹豫、选错过的路和付出的代价。技术判断保留理由与适用边界，但不写成评审记录。
- **不得虚构**：场景与细节必须来自仓库里真实记录的事实（审计、verification、提交历史），不能编造具体时间、人物或对话。
- 未量化的收益仍须标注，但用自然说法（"命中率我们没测过"），不用"未量化"这种标签式措辞。

**语言要求**：和卡片同一套标准——术语准确、句式简洁、面向专业读者。不喊口号、不排比、不写"则 / 值得注意的是"、不用"把 X 改成 Y"的模板句；每个技术判断都要给出理由（当时有哪些选择、代价是什么），不空下结论。

## 5. 双渠道转换规则

### 5.1 blog 深度文

frontmatter 模板：

```yaml
---
author: Box
pubDatetime: 2026-10-05T12:00:00Z
title: <中文标题>
postSlug: next-web-<topic>
featured: false
draft: false
tags:
  - next-web
  - <技术项 tag，如 caching / seo / rls>
description: <一句话说清这篇讲什么技术、解决什么问题>
---
```

约定：

- `postSlug` 统一 `next-web-` 前缀，便于系列聚合
- 正文含 `## Table of contents`，命中 `remark-collapse` 折叠
- 代码块交给 shiki，不贴长文；超过 30 行的代码只贴关键片段并 `file:line` 指向仓库
- 仓库内引用写成相对路径或仓库文件路径，不写本地绝对路径

### 5.2 小红书笔记

| 项 | 规则 |
|---|---|
| 标题 | ≤20 字，痛点式（"页面一到高峰期就慢，我们改了 3 处"） |
| 正文 | ≤900 字（给话题标签留余量） |
| 结构 | 钩子 → 3 个要点（每个要点对应一张图）→ 一句结论 → 话题标签 |
| 代码 | 一律不出现，改成"改前 vs 改后"对比 |
| 术语 | 换中文类比，英文不裸出现（`revalidateTag` → "给缓存贴标签，改哪儿清哪儿"） |
| **术语写法** | **英文简写（英文全称或中文翻译）**：`ISR（增量静态再生成）`、`TTFB（首字节时间）`、`RLS（行级安全）`。没有通用简写的术语用中文（按标签失效）。**大字标题不带括号注释**，保持版面干净 |
| **系列标签** | 固定为「**选咩课优化**」（人工指定）；不用"选课系统"这类泛称，也不用产品英文名 |
| **专有名词** | 卡片正文不出现读者看不懂的内部说法（"课程详情页""评论页"这种库表级称呼）；要举例就写通用场景（"一个列表页"），具体数字可以留（"每 5 分钟一次"） |
| **语气** | **术语准确、句式简洁**——是专业，不是口语，也不是口号。禁止：口号式句型（"每次 X 都 Y"）、三项排比、"把 X 改成 Y"模板句、"则 / 随即 / 值得注意的是"这类书面词、网络用语（"白查""加机器""你们也这样吗"）。判断直接陈述（"全页动态渲染等于放弃缓存"），含糊的后果要写准（"首屏耗时跟着上游接口波动"） |
| **出处** | **不写"来源：项目内的 X 文档"这类读者无法核实的指代**。要么给出读者能自行判断的具体事实，要么整行不写；需要引导下一篇时，写具体悬念（"下一篇：数据库怎么做到默认拒绝"） |
| 图片 | 1080×1440。**第 1 批先出 3 张**（封面 / 对比或清单 / 尾图 CTA）；**第 2 批起补齐到 6–9 张**（封面 + 每个要点一张 + 尾图）。先跑通形态，再堆量 |

### 5.3 卡片图管线

新增 `blog/scripts/xhs-render.mjs`（唯一新增工具，零 npm 依赖）：

- 输入：每张卡片的 HTML 模板（含标题、正文、可选对比表/架构图）
- 渲染：本机 Chrome headless `--screenshot --window-size=1080,1440 --force-device-scale-factor=1`
- 字体：`PingFang SC`（本机可用），不依赖 Web Font
- 输出：`blog/public/xhs/<slug>/01.png`、`02.png`…

边界：**不碰** `blog/src/pages/og.png.ts`（AstroPaper 的 satori OG 管线，其 `satori`/`@resvg/resvg-js` 依赖当前未安装），两套互不影响。

## 6. 交付物与目录布局

| 交付物 | 位置 | 说明 |
|---|---|---|
| 系列设计（本文） | `next-web/docs/superpowers/specs/2026-10-03-next-web-tech-article-series-design.md` | 沿用 next-web 的 superpowers 目录约定 |
| 实施计划 | `next-web/docs/superpowers/plans/2026-10-03-next-web-tech-article-series.md` | 由 `writing-plans` 生成 |
| 验证记录 | `next-web/docs/superpowers/verification/2026-10-03-next-web-tech-article-series.md` | 每篇的取证与核对结果 |
| blog 成稿 | `blog/src/content/blog/next-web-<topic>.md` | 深度文 |
| 小红书文案 | `blog/xhs/<slug>/note.md` | 纯文案（标题 + 正文 + 标签 + 配图说明） |
| 小红书卡片图 | `blog/public/xhs/<slug>/*.png` | 1080×1440 |
| 渲染脚本 | `blog/scripts/xhs-render.mjs` | 可重复执行 |

跨仓库边界：设计/计划/验证留在 next-web，成稿与素材落在 blog 仓库；两边分别提交，不混在一个 commit 里。

## 7. 验证方式（判定一篇合格的清单）

每篇交付前逐条核对：

- [ ] 文中每个数字都能指到 `technical-optimization-audit.md`、`verification/*.md` 或代码 `file:line`
- [ ] 第 6 节"适用边界"有实质内容，不是套话
- [ ] blog frontmatter 通过 `blog/src/content/config.ts` 的 schema（`npm run build` 在 blog 仓库能过）
- [ ] `postSlug` 有 `next-web-` 前缀，`tags` 含 `next-web`
- [ ] 正文含 `## Table of contents`
- [ ] 小红书正文 ≤900 字，卡片 6–9 张且均为 1080×1440
- [ ] 卡片图无代码、无裸英文术语
- [ ] 渲染脚本重跑产出与已提交图片一致（确定性）
- [ ] 未量化的收益已显式标注"未量化"

## 8. 风险与开放问题

- **R1 篇目偏多**：13 篇 × 2 形态是重活。若节奏跟不上，按"砍深度不砍篇目"处理——B/C/D 各挑一篇深写，其余压缩为对应篇章的一节，而不是删掉技术项。
- **R2 部分优化缺前后对照数据**：例如 RSC 化之后的包体收益、缓存命中率都没留下量化记录。这些篇只做定性说明 + 代码级解释，不编数字（对应 N5）。
- ~~**R3 卡片图排版未定样**~~ **已解决（2026-10-03）**：封面卡与对比卡样张已渲染并经人工确认（板式通过；文案经三轮修正：去掉产品泛称 → 去掉口语化 → 术语准确、句式简洁）。样式常量集中在 `blog/scripts/xhs-render.mjs` 的 `THEME`。
- **R4 跨仓库提交边界**：spec/plan/verification 在 next-web，成稿在 blog，需在实施计划里明确两边的提交顺序与信息格式。
- **R5 系列聚合页**：blog 目前靠 `tags` 聚合，`postSlug` 前缀只影响 URL。是否需要专门的系列导航页，等第 1 批发布后按实际效果决定。
- **R6 事实漂移**：文章引用的代码行号会随后续提交变化。约定引用以文件路径 + 函数/常量名为准，行号只作辅助。

## 9. 参考

- `docs/technical-optimization-audit.md`：整站审计与实测数字
- `docs/superpowers/specs/2026-09-19-next-web-caching-sync-design.md`：缓存策略
- `docs/superpowers/specs/2026-09-18-next-web-write-api-security-design.md`：写路径安全
- `docs/superpowers/specs/2026-09-21-next-web-componentization-seo-design.md`：组件化与 SEO
- `docs/superpowers/specs/2026-09-21-next-web-update-pipeline-design.md`：数据同步
- `docs/superpowers/verification/2026-10-02-masonry-ads.md`：瀑布流与广告位
- `docs/development-guide.md`：本地开发与部署
