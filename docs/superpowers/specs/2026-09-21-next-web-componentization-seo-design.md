# next-web 前端组件化与 SEO 优化设计（Phase 1-3）

> 状态：Draft，待用户 review
> 日期：2026-09-21
> 仓库：`next-web`
> 审查基线：`npm run lint`、`npm test`、`npm run build` 已通过
> 后续路径：本 spec 通过后进入 writing-plans，再进入 executing-plans

---

## 1. 背景

当前 next-web 已具备可工作的 App Router 页面、Supabase 数据层、Clerk 登录和基础 SEO 文件，但存在两组结构性问题：

1. **组件化不足**：搜索表单、讲师卡片、timetable 卡片、评论卡片、提交表单存在大量重复或巨型客户端组件。
2. **SEO/渲染能力未展开**：课程页对 bot 隐藏正文；讲师页缺 metadata；robots 允许全站；根 layout 的 ClerkProvider 让公共页也进入动态渲染；首页 LCP 依赖 4 MB 的 CSS 背景图。

优化前必须保留现有行为：

- 登录、退出、评论、回复、投票、举报、管理后台逻辑不变。
- API 返回契约不变；Phase 3 允许新增只读投票查询接口，不改已有接口语义。
- 数据库 schema 不变。
- 不重做视觉设计，只做语义、组件边界和性能优化。

---

## 2. 目标与非目标

### 2.1 目标

- **G1**：公共页具备完整 metadata：`metadataBase`、title template、description、canonical、Open Graph、Twitter Card。
- **G2**：课程描述和 ILO 服务端可见，不再依赖 UA 判断；删除 bot 专用隐藏逻辑。
- **G3**：搜索页、submit、admin、sign-in、sign-up、timetable 页不被索引；robots 明确 disallow。
- **G4**：sitemap URL 全部合法、无尾斜杠，特殊字符使用统一 URL builder。
- **G5**：降低重复组件：搜索表单收敛为一个实现，讲师卡片评分块收敛，timetable 组件重命名并复用。
- **G6**：拆分 `CommentCard` 和提交页，减少 `/reviews`、`/submit` 首屏客户端包。
- **G7**：公共静态页不再被 ClerkProvider 无条件拖入动态渲染；评价页去掉 `force-dynamic` 后可使用缓存数据。
- **G8**：测试、lint、构建继续通过，并为 URL、metadata、robots、组件接口补测试。

### 2.2 非目标

- **N1**：不修改 Clerk 登录流程产品行为。
- **N2**：不改数据库 schema、RLS、RPC 函数签名；Phase 3 只新增只读 web 投票状态接口。
- **N3**：不重做页面视觉风格，不替换 Tailwind、Radix UI、Clerk。
- **N4**：不处理 `admin` 控制台的功能性改造，只加 noindex/metadata。
- **N5**：不升级 Next.js 主版本；Phase 3 若需要 Clerk 升级，只作为独立技术决策记录，不混入本 spec。

---

## 3. 现状证据

### 3.1 构建输出

最近一次 `npm run build` 结果：

- `/reviews/[code]/[...prof]`：路由 JS 51.5 kB，First Load JS 243 kB。
- `/submit/[code]/[prof]`：First Load JS 173 kB。
- `/timetable`：First Load JS 150 kB。
- shared JS 87.6 kB，Middleware 48.5 kB。
- 大多数公开页标记为 `ƒ` 动态渲染，只有 `/catalog/[...departments]` 因 `generateStaticParams` 标记为 `●`。

### 3.2 关键问题文件

| 问题 | 位置 |
|---|---|
| bot UA 控制课程正文显隐 | `app/course/[code]/page.tsx:186-233` |
| ClerkProvider 在根 layout | `app/layout.tsx:38` |
| 讲师页无 metadata | `app/professor/[...name]/page.tsx:1-36` |
| robots 无 disallow | `app/robots.ts:4-12` |
| sitemap 不完整编码 | `app/sitemap.ts:17-39` |
| 搜索表单重复 | `components/search.tsx:41-61`、`components/search-button.tsx:23-43`、`app/search/layout.tsx:22-45`、`app/timetable/page.tsx:21+` |
| 讲师卡片重复 | `components/prof-card.tsx` 的 `ProfCard` 与 `ProfCourseCard` |
| 评论组件巨型化 | `components/comment-card.tsx`（616 行，顶层 import Fancybox） |
| 提交页巨型化 | `app/submit/[code]/[prof]/page.tsx`（466 行） |
| catalog 批量 prefetch | `components/catalog-navigation.tsx:15-24` |
| 首页大图 | `components/search.tsx:63` + `public/felina2.jpeg`（约 4 MB） |
| 评价页强制动态 + 服务端 auth | `app/reviews/[code]/[...prof]/page.tsx:25-26,67` |

---

## 4. 方案总览

### 4.1 已考虑方案

**方案 A：分阶段增量改造（选用）**

- Phase 1 做 SEO 基础、内容可见性、URL 和图片优化。
- Phase 2 做组件抽取和巨型组件拆分。
- Phase 3 做 route group、公共页去 ClerkProvider 动态化、评价页缓存化。

理由：每一步都可独立验证，Phase 1 不依赖 Phase 3，能先获得 SEO 和 Core Web Vitals 收益。

**方案 B：保留根 ClerkProvider，只做数据缓存和 metadata**

- 风险最小，但公共页仍为 `ƒ`，静态化收益拿不到。

**方案 C：先升级 Clerk / 新版本能力，再静态化**

- 可能简化 Phase 3，但升级属于独立风险，不应混在组件化和 SEO 改造里。

### 4.2 分阶段边界

| 阶段 | 主题 | 是否改变行为 | 主要产物 |
|---|---|---|---|
| Phase 1 | SEO 基础、正文可见、robots/sitemap、图片 | 页面可见性提升、URL 规范化 | `lib/site.ts`、metadata、JSON-LD、robots/sitemap、优化图片 |
| Phase 2 | 组件化重构 | 不改变 UI 行为 | SearchForm、RatingStatsCard、Timetable 组件、CommentCard 拆分、Submit 拆分 |
| Phase 3 | 渲染与缓存架构 | 改变渲染方式和 request-time 行为 | public/auth route group、公共 AuthControls、评价页缓存、只读投票接口 |

---

## 5. Phase 1：SEO 与性能基础

### 5.1 站点配置模块

新增 `lib/site.ts`：

```ts
export const SITE_URL = "https://umeh.top";
export const SITE_NAME = "What2Reg @ UM 澳大選咩課";
export const SITE_SHORT_NAME = "What2Reg @ UM";

export function absoluteUrl(path: string): string;
export function buildCoursePath(code: string): string;
export function buildCatalogPath(departments: string[]): string;
export function buildProfessorPath(name: string): string;
export function buildReviewPath(code: string, prof: string, page?: number): string;
export function buildSearchPath(kind: "course" | "instructor", value: string): string;
```

约束：

- `buildReviewPath` 必须用 `encodeURIComponent` 编码每个 path segment，page > 1 使用 path 后缀，不使用 `?page=`。
- 所有页面内链接、sitemap、canonical、JSON-LD 统一使用该模块。
- 旧 URL 兼容：当前 `?page=` 和尾随数字仍能解析，但新写入一律使用 canonical path。

### 5.2 根 metadata

修改 `app/layout.tsx`：

- `metadataBase: new URL(SITE_URL)`。
- `title.default: SITE_NAME`。
- `title.template: "%s | What2Reg @ UM"`。
- 默认 description、keywords、Open Graph、Twitter Card。
- 保留 `manifest`、icon、apple-touch-icon，删除未上架的 `apple-itunes-app` 占位 meta。
- `<html lang="zh-Hant">`；英文法律页在内容容器上标 `lang="en"`。
- 移除 `maximumScale: 1` 和 `userScalable: false`。
- GTM 脚本只在 `process.env.GTM_ID` 存在时渲染，避免 ID 为 `undefined`。

### 5.3 动态页 metadata

| 页面 | title | description/canonical 规则 |
|---|---|---|
| 首页 | 品牌 absolute title | canonical `/`，OG image 使用优化后的 hero |
| `/course/[code]` | `CODE · Course Title` | canonical `/course/CODE`；description 取课程名 + faculty + course description 截断 |
| `/professor/[...name]` | `PROF_NAME 課程評價` | 新增 `generateMetadata`；canonical `/professor/NAME` |
| `/reviews/[code]/[...prof]` | `PROF | CODE 評價` | canonical 当前 path；page > 1 使用 `/page/N` |
| `/catalog/[...departments]` | 当前 faculty/dept | description 写课程数量或 faculty 名，补 canonical |
| `/search/*` | 搜索关键词 | **noindex, follow**；不写入 sitemap |
| `/submit/*` | Submit Review | **noindex, nofollow** |
| `/timetable` | Timetable Simulator | **noindex, nofollow** |
| `/admin/*` | Admin | **noindex, nofollow** |
| `/sign-in`、`/sign-up` | Sign In / Sign Up | **noindex, nofollow** |
| 法律页 | 中英文各自 title | `alternates.languages`，英文/中文 canonical 对指 |

### 5.4 结构化数据

新增 `components/seo/json-ld.tsx`，服务端渲染 `<script type="application/ld+json">`。

- 根：`Organization` + `WebSite`，`WebSite.potentialAction` 指向 `/search/course/{search_term_string}`。
- `/course/*`：`Course` + `BreadcrumbList`。
- `/professor/*`：`Person` + `BreadcrumbList`。
- `/reviews/*`：`BreadcrumbList`；不输出 Google 不认可的 self-serving AggregateRating，除非后续确认课程实体满足富媒体要求。

### 5.5 课程正文可见性

修改 `app/course/[code]/page.tsx`：

- 删除 `googleBotCourseInfo` 的 `hidden` 和 `show-for-bot` 脚本。
- Course Description / ILO 改为正常可见区块；长内容用 `<details>` 折叠也可以，但 HTML 中必须存在。
- 课程代码、课程标题、讲师列表补语义化 heading。
- `generateMetadata` 复用 `fetchCourseInfo`，description 从课程名、faculty、description 生成。

### 5.6 robots 与 sitemap

`app/robots.ts`：

```ts
rules: [{
  userAgent: "*",
  allow: "/",
  disallow: ["/admin/", "/api/", "/submit/", "/search/", "/sign-in", "/sign-up"],
}]
```

`sitemap`：

- 只包含首页、法律页、catalog、course、可索引的 professor/review 页。
- 所有 URL 由 `lib/site.ts` 生成，不带尾斜杠，特殊字符完整编码。
- `lastModified` 优先使用资源更新时间；没有时继续使用全局数据库更新时间。
- 保持 `revalidate = 86400`。

### 5.7 首页 LCP 图片

- 将 `public/felina2.jpeg` 处理为 WebP/AVIF 多尺寸，建议：
  - `public/images/hero-1280.webp`
  - `public/images/hero-1920.webp`
  - `public/images/hero-2560.webp`
- `components/search.tsx` 改为 `next/image`，桌面与移动端取不同 sizes，首屏图加 `priority`。
- 删除未引用资产：`felina.jpeg`、`bg2.jpg`、`bg3.jpg`、`banner.jpg`。
- 保留 `qrcode.jpeg` 等实际使用图片。

### 5.8 Phase 1 验收

- 课程页 HTML 直接包含 course description / ILO。
- `/robots.txt` 包含 disallow，`/sitemap.xml` URL 可访问且无尾斜杠。
- `/course/ACCT1000`、`/professor/...`、`/reviews/...` HTML 包含唯一 title、description、canonical。
- 首页 hero 首屏资源不再是 4 MB JPEG。
- `npm run lint`、`npm test`、`npm run build` 通过。

---

## 6. Phase 2：组件化重构

### 6.1 SearchForm 统一

新增：

- `components/search/search-form.tsx`
- `components/search/search-card.tsx`
- `components/search/search-dialog.tsx`

`SearchForm` 接口：

```ts
type SearchFormVariant = "hero" | "header" | "inline";

type SearchFormProps = {
  variant: SearchFormVariant;
  defaultCode?: string;
  defaultMode?: "course" | "instructor";
  onSubmitted?: () => void;
  className?: string;
};
```

规则：

- 用 `form.watch("is_prof")` 驱动 UI，不再维护第二个 `is_prof` state。
- 搜索跳转统一调用 `buildSearchPath`。
- `components/search.tsx`、`components/search-button.tsx`、`app/search/layout.tsx`、`app/timetable/page.tsx` 都改为消费该实现。
- `app/search/layout.tsx` 移除 `"use client"`，只保留 server layout + client `SearchHeader` island。

### 6.2 RatingStatsCard

新增 `components/course/rating-stats-card.tsx`：

```ts
type RatingStats = {
  result: number | null;
  grade: number | null;
  hard: number | null;
  reward: number | null;
  comments: number | null;
  isOffered?: boolean;
};

type RatingStatsCardProps = {
  title: string;
  href: string;
  stats: RatingStats;
  labels?: {
    overall: string;
    grade: string;
    hard: string;
    reward: string;
  };
};
```

- `ProfCard` 和 `ProfCourseCard` 都基于它实现。
- 保留 `get_bg`、`get_gpa` 的现有视觉表现。
- Offered 标签抽为 `OfferedBadge`。

### 6.3 Timetable 组件

- `components/timetable-card.tsx` 重命名为 `components/timetable-schedule-card.tsx`，导出 `TimetableScheduleCard`。
- `components/timetable-cart.tsx` 里的内部 `TimetableCard` 重命名为 `TimetableCartItem`。
- 新增 `components/timetable/schedule-list.tsx` 复用日期/时间/地点三列渲染。

### 6.4 CommentCard 拆分

`components/comment-card.tsx` 拆为：

- `components/review/comment-card.tsx`：对外导出 `CommentCard`，保持 props 不变。
- `components/review/comment-header.tsx`：日期、举报、头像、评分。
- `components/review/comment-body.tsx`：正文 + 图片。
- `components/review/comment-vote-bar.tsx`：赞/踩/表情投票。
- `components/review/reply-list.tsx` + `reply-editor.tsx`。
- `components/review/comment-image.tsx`：图片展示；Fancybox 只在有图时 `dynamic(..., { ssr: false })` 引入。

约束：

- `Comments` 组件不需要改 props。
- Fancybox 不再出现在评价页初始客户端 bundle。
- 投票/回复 API 调用逻辑保持不变，只移动文件。

### 6.5 提交页拆分

`app/submit/[code]/[prof]/page.tsx` 拆为：

- `app/submit/[code]/[prof]/page.tsx`：server wrapper；把 `app/submit/[code]/[prof]/layout.tsx` 中的 `generateMetadata` 上移到 page，layout 若无其他职责则删除。
- `components/submit/submit-comment-form.tsx`：client form。
- `components/submit/rating-field.tsx`：复用于 Overall、Grade、Workload。
- `components/submit/image-upload-field.tsx`。
- `lib/validation/submit-comment.ts`：把 `formSchema` 从组件内移到模块级。

### 6.6 其他组件清理

- `components/banner.tsx` 去 `"use client"`。
- `components/cs-banner.tsx` 删除 `return null` 后的不可达 JSX，修复 CS banner 逻辑。
- `components/catalog-navigation.tsx` 删除批量 `router.prefetch`，保留 `<Link>` 的视口 prefetch。
- `components/course-filter.tsx` 去重复 state；大列表过滤改 `useMemo`，Phase 3 再改 URL 驱动。
- 所有列表 key 改为稳定业务 ID。

### 6.7 Phase 2 验收

- 搜索行为在首页、搜索页、timetable、Navbar Dialog 四处一致。
- `/reviews` First Load JS 明显下降；Fancybox 不进入初始 bundle。
- `/submit` 首屏包下降。
- 新增组件测试：
  - `SearchForm` 切换、提交路径、默认值。
  - `RatingStatsCard` 标签与绑定。
  - `CommentCard` 拆分后投票/回复调用路径。
- `npm run lint`、`npm test`、`npm run build` 通过。

---

## 7. Phase 3：渲染、缓存与 Clerk 隔离

### 7.1 目标结构

根 layout 只保留 `<html>`、`<body>`、全局 metadata 和全局 CSS；站点 chrome 与 Clerk 移到 route group。

```text
app/
  layout.tsx                  // 无 ClerkProvider，只做 html/body
  (public)/
    layout.tsx                // PublicNavbar + Banner + main + Footer
    page.tsx                  // /
    catalog/...
    course/...
    professor/...
    privacy-policy/...
    terms-of-service/...
    timetable/...
    search/...                // 无登录态依赖，可 noindex
  (auth)/
    layout.tsx                // ClerkProvider + AppNavbar
    reviews/...
    submit/...
    admin/...
    sign-in/...
    sign-up/...
  api/...
  robots.ts
  sitemap.ts
  manifest.ts
  not-found.tsx              // 根 404；若无 chrome，改为简单 SiteShell/品牌首页链接
```

### 7.2 公共布局的登录控件

新增：

- `components/layout/site-shell.tsx`：共享 Navbar 位置、Banner、Footer、`main` landmarks。
- `components/layout/public-navbar.tsx`。
- `components/layout/app-navbar.tsx`。
- `components/auth/public-auth-controls.tsx`。

要求：

- `public-auth-controls.tsx` 使用 `dynamic(..., { ssr: false })` 或纯客户端挂载，内部包 Clerk 客户端 provider，渲染 Sign In / UserButton / AdminEntry。
- 服务端渲染阶段显示静态占位，不调用 `headers()`/`cookies()`。
- `(auth)/layout.tsx` 继续使用服务端 `ClerkProvider`，保证 reviews、submit、admin 的 `auth()` 和 `useUser` 行为不变。
- `MobileSidebar` 通过 slot 接收 auth controls，不能在公共布局里直接 import Clerk UI。

### 7.3 评价页缓存化

当前 `app/reviews/[code]/[...prof]/page.tsx` 同时做：

- 读取 `auth()`；
- 查询 viewer-specific `vote_history`；
- 强制 `revalidate = 0` + `dynamic = "force-dynamic"`。

改造：

1. 新增 cached 公共评论查询：
   - `getPublicCommentPage(courseId, page)` 使用 `unstable_cache`，viewerId 固定为 `null`。
   - tags：`CACHE_TAGS.comment`、`CACHE_TAGS.course`、`CACHE_TAGS.professor`，revalidate 300。
2. 新增 web 只读接口 `GET /api/vote/me?comment_ids=...`：
   - Clerk `auth()` 认证；
   - 只返回当前用户对指定 comment 的 `vote_history`；
   - 不返回他人投票，不改变现有 POST 语义。
3. `CommentCard` 或新增 `ReviewViewerState` 客户端组件：
   - 初始不显示用户自己的投票状态；
   - 挂载后调用 `GET /api/vote/me` 覆盖自己的 vote/emoji 状态。
4. `ReviewPage`：
   - 删除 `auth()`；
   - 删除 `force-dynamic` 和 `revalidate = 0`；
   - 使用 path-based 分页 `/reviews/{code}/{prof}/page/{n}`；
   - `ReviewPagination` 改由 `buildReviewPath` 生成链接；
   - 页面设置 `revalidate = 300`，热门评价页可通过 `generateStaticParams` 预渲染。
5. 缓存失效：
   - `CACHE_TAGS` 增加 `comment`；
   - `invalidateAfterCommentWrite`、`invalidateAfterReplyWrite`、`invalidateAfterVoteWrite` 都增加 `revalidateTag(CACHE_TAGS.comment)`。

### 7.4 搜索与 catalog 渲染

- `/search/*` 仍 noindex，但迁移到 `(public)`，不依赖 Clerk。
- `/catalog/*` 保留 `generateStaticParams`；`CourseFilter` 的筛选条件改为 URL query，服务端初始渲染列表，客户端只做小范围过滤。
- `/catalog` 根页补 faculty 列表，避免空正文。

### 7.5 Middleware

- Phase 3 先保留现有 Clerk middleware 行为，避免破坏登录态。
- 若 build + 线上验证发现 middleware 让静态页无法被 CDN 缓存，再单独收窄 matcher；该决策记录在 verification 文档，不阻塞 Phase 1/2。

### 7.6 Phase 3 验收

- `npm run build` 中 `/`、`/privacy-policy`、`/terms-of-service` 至少不再因为根 layout 的 ClerkProvider 被标记为强制动态。
- `/catalog/[...departments]` 继续可静态生成。
- `/reviews/*` 不再使用 `force-dynamic`；重复请求命中 cached public comments。
- 登录/未登录状态下 Navbar 显示、评论投票、回复、submit 行为不回归。
- 新增 `GET /api/vote/me` 有测试，未登录返回 401，正常返回只含当前用户投票。
- `npm run lint`、`npm test`、`npm run build` 通过。

---

## 8. 文件与接口变更清单

### 新增

- `lib/site.ts`
- `components/seo/json-ld.tsx`
- `components/search/search-form.tsx`
- `components/search/search-card.tsx`
- `components/search/search-dialog.tsx`
- `components/course/rating-stats-card.tsx`
- `components/timetable-schedule-card.tsx`
- `components/timetable/schedule-list.tsx`
- `components/review/*`
- `components/submit/*`
- `components/layout/site-shell.tsx`
- `components/layout/public-navbar.tsx`
- `components/layout/app-navbar.tsx`
- `components/auth/public-auth-controls.tsx`
- `app/api/vote/me/route.ts`
- `lib/database/get-public-comment-list.ts`

### 修改

- `app/layout.tsx`
- `app/robots.ts`
- `app/sitemap.ts`
- `lib/sitemap-data.ts`
- `app/course/[code]/page.tsx`
- `app/professor/[...name]/page.tsx`
- `app/reviews/[code]/[...prof]/page.tsx`
- `app/catalog/page.tsx`
- `app/search/layout.tsx`
- `app/timetable/page.tsx`
- `app/submit/[code]/[prof]/page.tsx`
- `app/submit/[code]/[prof]/layout.tsx`
- `components/search.tsx`
- `components/search-button.tsx`
- `components/prof-card.tsx`
- `components/comment-card.tsx`
- `components/catalog-navigation.tsx`
- `components/course-filter.tsx`
- `components/banner.tsx`
- `components/cs-banner.tsx`
- `lib/cache-tags.ts`
- `lib/cache-invalidation.ts`
- `components/review-pagination.tsx`

### 删除

- `public/felina.jpeg`
- `public/bg2.jpg`
- `public/bg3.jpg`
- `public/banner.jpg`

---

## 9. 测试与验证策略

### 9.1 自动化测试

新增或调整：

- `tests/site-urls.test.ts`：`buildCoursePath`、`buildReviewPath`、特殊字符、page 后缀。
- `tests/robots.test.ts`：disallow 列表。
- `tests/sitemap.test.ts`：不包含 noindex 路由，URL 无尾斜杠。
- `tests/seo/metadata.test.ts`：根 metadata、讲师 metadata、课程 metadata 字段。
- `tests/components/search-form.test.tsx`。
- `tests/components/rating-stats-card.test.tsx`。
- `tests/components/comment-card-split.test.tsx`。
- `tests/api/vote-me.test.ts`。

### 9.2 手工验证

- 开发服务器访问 `/robots.txt`、`/sitemap.xml`。
- 查看课程页源码，确认描述/ILO 与 title/canonical/JSON-LD。
- 首页 Lighthouse 检查 LCP 图片请求大小。
- 登录、退出、评论、回复、投票、举报、管理后台 smoke test。

### 9.3 构建验证

每阶段结束运行：

```bash
npm run lint
npm test
npm run build
```

并对比 build 路由表行，记录：

- public 静态页 `○`/`●` 数量；
- `reviews` / `submit` First Load JS 变化；
- 仍未静态化的页面及原因。

---

## 10. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| Clerk 公共布局隔离后登录控件闪烁 | UX | `dynamic ssr:false` + 骨架占位；保留 auth group 原行为 |
| 公共页静态化与 Clerk middleware 冲突 | 缓存/登录异常 | Phase 3 先保留 middleware；单独做 build + 真机 smoke，不达标则回退到方案 B |
| 评价页缓存后用户投票状态滞后 | 功能 | 客户端只读接口补 viewer state；写操作仍立即调用现有 API |
| `buildReviewPath` 编码变更产生 URL 变体 | SEO 重复 | 全站统一 builder；sitemap/canonical 使用同一函数；旧式 URL 继续可解析 |
| 图片优化改变视觉 | UI | 保留原图备份到 `tmp/`；只替换格式和 sources，不改变构图 |
| 组件拆分引入行为回归 | 功能 | 先补组件测试，保持对外 props 不变，小步提交 |

---

## 11. 总体验收

- Phase 1、2、3 的验收项全部满足。
- `npm run lint`、`npm test`、`npm run build` 全部通过。
- 无数据库 schema 或已有 API 契约破坏。
- 课程页正文可被爬虫直接读取；首页/法律页在 build 中不再因根 ClerkProvider 被强制动态。
- 搜索、submit、admin、sign-in/up、timetable 不被索引。
- 组件重复和巨型客户端组件显著减少；评价页/提交页首屏 JS 下降。

---

## 12. 决策记录

- **D1**：选用方案 A，Phase 1-3 顺序执行，Phase 3 的 Clerk 隔离以 spike + smoke 验证为门禁。
- **D2**：评价页分页统一为 path-based `/page/{n}`，`?page=` 仅保留兼容解析。
- **D3**：`reviews` 的 viewer-specific 投票状态通过新增 `GET /api/vote/me` 获取，不把用户数据写入公共缓存。
- **D4**：不输出 Google 不认可的 self-serving `AggregateRating`；只输出 `Course`/`Person`/`BreadcrumbList`/`WebSite`。
- **D5**：本 spec 不包含 Clerk 主版本升级；若 Phase 3 spike 证明 v4 无法隔离，则 Phase 3 降级为方案 B，并在 verification 文档中记录原因。
