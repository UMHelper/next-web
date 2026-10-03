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
- 测试规模：107 个测试文件（`tests/**`）；`verification/2026-09-21-clerk-auth-boundary-hardening.md` 记录过 49 files / 158 tests 全绿

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

- **G1**：14 篇技术项文章构成系列，读者读完能理解整站用到的优化技术，以及每项技术的**适用边界**
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

## 3. 系列结构：14 篇技术项

篇号即阅读顺序：① 是总览兼导航，②→④ 由外到内看请求链路，⑤⑥ 讲渲染策略，⑦→⑫ 讲数据与安全，⑬ 前端，⑭ 收尾回到"怎么保证不反弹"。

| # | 技术项 | 要回答的问题 | 必引证据 |
|---|---|---|---|
| ① | 总览 | 这次整站优化动了哪些技术，各自解决什么问题 | `technical-optimization-audit.md` §2/§5/§6、`README.md` |
| ② | SEO | 一个动态课程站怎么让搜索引擎读懂并收录 | `app/sitemap.ts:7`、`app/robots.ts`、`lib/seo.ts`、`lib/sitemap-data.ts`、`tests/sitemap.test.ts`、`tests/robots.test.ts`、`tests/seo/{metadata,json-ld,course-json-ld}.test.*`、`specs/2026-09-21-next-web-componentization-seo-design.md`、`verification/2026-09-21-next-web-componentization-seo.md` |
| ③ | 缓存（Next.js 层） | `revalidate`、`tags`、`revalidateTag` 怎么替代"整页动态渲染" | `lib/cache-tags.ts`、`lib/cache-invalidation.ts:1-22`、`app/course/[code]/page.tsx:9`、`app/professor/[...name]/page.tsx:11`、`app/reviews/[code]/[...prof]/page.tsx:13`（审计时为 `revalidate = 0` + `force-dynamic`）、`lib/database/get-public-comment-list.ts:1,7`、`app/api/admin/app-config/route.ts:1,57`、`specs/2026-09-19-next-web-caching-sync-design.md`；对照：全站 44 处 `force-dynamic` 现仅存于 `app/admin/**`、`app/compare/[token]`、`app/api/statistics` |
| ④ | 缓存（边缘层） | Workers 上缓存存在哪，R2 与 D1 各管什么 | `open-next.config.ts`、`wrangler.jsonc:36-46`（R2 `next-web-inc-cache`、D1 `next-web-tag-cache`） |
| ⑤ | RSC / client island | 只读页面怎么搬回服务端，客户端只留什么 | 审计 §P1 客户端包体、`components/comments.tsx:11,28`（`Map` 归并已落地）、`app/timetable/page.tsx`、全仓 60 个 `"use client"` 文件 |
| ⑥ | 静态生成策略 | 为什么不再全量 `generateStaticParams`，ISR 与按需渲染怎么分工 | `app/catalog/[...departments]/page.tsx:23`（全仓唯一剩余 `generateStaticParams`）、`app/course/[code]/page.tsx:9`、审计 §P1 |
| ⑦ | RLS 与权限边界 | 数据库怎么做到"默认拒绝" | `supabase/migrations/20260918_security_hardening.sql`、`lib/supabase/{shared,admin,server}.ts`、`verification/2026-09-18-write-api-security.md:49` |
| ⑧ | 数据库查询优化 | N+1 怎么消掉，索引怎么选 | `supabase/migrations/20260812_course_search_rpc.sql`（`pg_trgm` + `gin_trgm_ops`）、`20260812_prof_with_course_indexes.sql`、`lib/database/get-fuzzy-search.ts`、`tests/database/*-sql.test.ts`、审计 §P1 |
| ⑨ | 写入正确性 | 主键该谁生成，聚合更新怎么不放应用层 | `supabase/migrations/20260812_comment_write_rpc.sql`、`20260921_fix_id_sequences.sql`、`tests/database/fix-id-sequences-sql.test.ts`、审计 §2.1 |
| ⑩ | 写路径安全 | 鉴权 → 校验 → 限流 → 审计这条链怎么搭 | `lib/validation/**`（8 个 schema）、`lib/rate-limit.ts`、`lib/admin-audit.ts`、`supabase/migrations/20260918_rate_limit.sql`、`tests/security/**`、`tests/rate-limit.test.ts`、`verification/2026-09-18-write-api-security.md:41-51` |
| ⑪ | 数据同步 | 怎么做到页面不再直连第三方教务 API | `lib/update/**`、`scripts/sync-um.mjs`、`tests/update/**`（8 个）、`lib/telegram.ts`、`specs/plans/verification` 的 `2026-09-21-next-web-update-*` |
| ⑫ | 数据质量治理 | 脏数据怎么清、怎么防复发 | 审计 §2.1（`trg_normalize_prof_info_name`、`trg_normalize_prof_with_course_prof_id`、唯一索引） |
| ⑬ | 前端渲染与包体 | 瀑布流、图片、hydration 一致性怎么做 | `lib/masonry-split.ts`、`tests/masonry-split.test.ts`、`lib/ads/ad-config-server.ts`、`lib/ads/ad-slots.tsx`、`tests/ads/ad-slots.test.ts`、`verification/2026-10-02-masonry-ads.md`、审计 §7 |
| ⑭ | 验证机制 | 怎么保证优化不反弹 | `vitest.config.ts`、`tests/**`（107 个文件）、`verification/2026-09-21-clerk-auth-boundary-hardening.md:30`、`tests/no-dead-deps.test.ts`、`tests/no-legacy-timetable-cart.test.ts` |

合并余地：⑨⑩ 可合为"写入链路"，③④ 可合为"缓存两级"，合并后为 12 篇。是否合并由实施计划决定。

## 4. 每篇的固定骨架（blog 深度文）

1. **TL;DR**（≤150 字）：无代码、无术语，非技术读者读完这段就够
2. **这项技术要解决什么问题**：从通用层面讲，没做过这个项目的人也能懂
3. **我们原来的写法，错在哪**：给现象，有数字就上数字
4. **技术怎么用**：关键代码，能标 `file:line` 就标
5. **落地后的效果**：引用 verification 里的实测结果
6. **适用边界**：什么情况下**不该**用这项技术
7. **延伸阅读**：仓库内文件 + 官方文档

篇幅 2500–4000 字。第 6 节是系列的核心价值，不允许省略或写成一句空话。

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
| **专有名词** | **卡片上不出现只有我们自己知道的词**：产品名（What2REG / 选课系统）、内部功能名一律不写；要举例就写通用场景（"一个列表页"），具体数字可以留（"每 5 分钟更新一次"） |
| **出处** | **不写"来源：项目内的 X 文档"这类读者无法核实的指代**。要么给出读者能自行判断的具体事实，要么整行不写；需要引导下一篇时，写具体悬念（"下一篇：数据库怎么做到默认拒绝"） |
| 图片 | 6–9 张，1080×1440：封面（大字标题 + 一句话价值）+ 每要点一张 + 尾图（团队 / 仓库链接 / CTA） |

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

- **R1 篇目偏多**：14 篇 × 2 形态是重活。若节奏跟不上，按"砍深度不砍篇目"处理——B/C/D 各挑一篇深写，其余压缩为对应篇章的一节，而不是删掉技术项。
- **R2 部分优化缺前后对照数据**：例如 RSC 化之后的包体收益、缓存命中率都没留下量化记录。这些篇只做定性说明 + 代码级解释，不编数字（对应 N5）。
- **R3 卡片图排版未定样**：需要在写第一篇笔记前先出 1 张样张给人工确认（字号、留白、封面样式），避免 14 篇返工。
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
