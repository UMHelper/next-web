# UMHelper Next Web 技术优化调研

## 1. 调研范围

- 构建与部署配置：`package.json`、`next.config.js`、`open-next.config.ts`、`wrangler.jsonc`
- 页面与路由：`app/**`
- 数据访问层：`lib/database/**`
- 交互组件：`components/**`

本次调研基于 2026-08-12 当前工作区代码，目标是识别会影响构建速度、运行性能、可靠性、可维护性和后续演进的问题，并形成后续优化参考。

## 2. 当前结论摘要

当前项目已经从“能运行但构建/写入链路不稳定”推进到“主链路基本稳定，但仍有明确优化空间”的状态。

截至 2026-08-12，本轮已经完成的关键修复：

1. 构建输出页数已从约 5000+ 收敛到 54 页，`npm run build` 可通过。
2. Supabase 客户端已拆分为 `browser/server/admin` 三层，避免继续混用公钥与高权限密钥。
3. 评论、回复写入已改为数据库自增主键，不再在应用层手工 `max(id) + 1`。
4. 评论聚合统计已下沉到数据库 RPC，评论页读取也已收敛为单次 RPC。
5. 搜索已改成 PostgreSQL RPC，去掉教师搜索的 N+1 查询。
6. `prof_with_course` 的重复数据、评论关联漂移和教师名尾部空格问题已在生产库完成清理，并加上写入自动 `trim` 触发器。
7. 课程详情页已经改成“本地库优先，缺字段时回源 UM API 并回填数据库”的模式。

当前剩余的核心技术债：

1. 数据库现在更稳定了，但“数据是否最新/完整”仍然依赖页面访问时的被动回填，还没有形成正式的同步任务。
2. 评论、课程、搜索链路已经优化，但仍缺少统一的 Next.js 缓存与失效策略。
3. 前端包体依然偏重，`/timetable` 路由首屏 JS 明显过大。
4. 类型系统和数据模型依旧偏弱，很多地方仍在使用 `any`。

## 2.1 生产库本轮已落地的数据库优化

- 评论写入：
  - 通过数据库 identity 生成主键。
  - 通过 RPC 在数据库内原子插入评论并刷新 `prof_with_course` 聚合统计。
- 投票写入：
  - 增加唯一索引，阻止重复 reaction / direction vote。
- 评论读取：
  - 新增 `get_comment_page` RPC，一次返回评论、回复和投票历史。
- 搜索：
  - 新增 `search_courses`、`search_instructors_with_courses` RPC。
  - 为课程代码与英文标题增加 trigram 索引。
- 关系表治理：
  - 清理 `prof_with_course` 的精确重复和 trim 后重复。
  - 将遗留评论引用迁回保留行。
  - 加唯一索引保护 `(course_id, prof_id)`。
- 教师名称治理：
  - 清理 `prof_info` / `prof_with_course` 中尾部空格。
  - 新增触发器，后续写入自动 `btrim(...)`。

线上校验结果：

- `prof_info` 尾部空格记录：`383 -> 0`
- `prof_with_course` 尾部空格记录：`756 -> 0`
- trim 后重复映射组：`522 -> 0`
- 评论悬空关联：`0`
- 已存在触发器：
  - `trg_normalize_prof_info_name`
  - `trg_normalize_prof_with_course_prof_id`

## 3. 已确认问题

### P0: 构建链路曾经失败，但目前已恢复

- 现象：
  - 历史上 `next build` 在类型检查阶段失败，且曾因为全量静态生成导致要产出约 5000+ 页面。
  - 截至 2026-08-12，构建已能通过，当前只生成 54 个页面。
- 当前影响：
  - 主问题已经从“无法构建”变成“局部路由包体仍然过大”。
- 建议：
  - 在 CI 中固定加入 `npm ci && npm run build`。
  - 下一步不再优先纠结页面数量，而是优先处理最大客户端包体。

### P0: 评论/回复接口手工主键问题已修复

- 相关文件：
  - [app/api/comment/[code]/[prof]/route.tsx](/Users/box/UMHelper/next-web/app/api/comment/[code]/[prof]/route.tsx:52)
  - [app/api/reply/route.ts](/Users/box/UMHelper/next-web/app/api/reply/route.ts:8)
- 当前状态：
  - 已改为数据库自增 identity。
  - 线上 sequence 已与现有 `comment.id` 对齐。
- 建议：
  - 后续继续保持“数据库生成主键，应用层只消费返回值”的原则。

### P0: 评论聚合更新风险已修复

- 相关文件：
  - [app/api/comment/[code]/[prof]/route.tsx](/Users/box/UMHelper/next-web/app/api/comment/[code]/[prof]/route.tsx:100)
- 当前状态：
  - 已改为数据库 RPC 内处理。
  - 已对线上 `prof_with_course` 聚合字段做过一次全量回填校正。
- 建议：
  - 如果未来评论量继续上升，可以进一步评估把聚合迁到物化视图或专门的统计表。

### P1: `generateStaticParams` 对大表做全量静态生成，直接拉慢 build

- 相关文件：
  - [app/course/[code]/page.tsx](/Users/box/UMHelper/next-web/app/course/[code]/page.tsx:35)
  - [app/professor/[...name]/page.tsx](/Users/box/UMHelper/next-web/app/professor/[...name]/page.tsx:6)
  - [app/catalog/[...departments]/page.tsx](/Users/box/UMHelper/next-web/app/catalog/[...departments]/page.tsx:23)
- 现状：
  - 课程页构建时全量扫描 `course_noporf`。
  - 教师页构建时全量扫描 `prof_with_course`。
  - 这会把大量动态数据提前搬到 build 阶段。
- 影响：
  - 数据量一大，build 时间线性增长。
  - 数据一旦频繁变动，静态生成收益会下降，但构建成本仍然保留。
  - Cloudflare/OpenNext 链路里，这类全量预渲染还会进一步放大部署时长。
- 建议：
  - 重新定义哪些页面真的值得预生成。
  - 对课程页/教师页改为：
    - 热门页面预生成。
    - 长尾页面走按需 ISR 或动态渲染。
  - 利用 Next.js 特性：
    - `revalidate`
    - `fetch(..., { next: { revalidate, tags } })`
    - `revalidateTag`
    - `unstable_cache`
  - 如果数据主源已经在 PostgreSQL，可优先做“按需缓存”而不是“全量静态路径枚举”。

### P1: 页面读取路径缺少缓存层，数据库和第三方 API 会被重复打

- 相关文件：
  - [lib/database/get-course-info.ts](/Users/box/UMHelper/next-web/lib/database/get-course-info.ts:30)
  - [lib/database/get-prof-info.ts](/Users/box/UMHelper/next-web/lib/database/get-prof-info.ts:17)
  - [lib/database/get-comment-list.ts](/Users/box/UMHelper/next-web/lib/database/get-comment-list.ts:3)
  - [app/reviews/[code]/[...prof]/page.tsx](/Users/box/UMHelper/next-web/app/reviews/[code]/[...prof]/page.tsx:25)
- 现状：
  - 评论页显式 `revalidate = 0` 且 `dynamic = "force-dynamic"`，每次请求都重新查库。
  - 课程页 `fetchCourseInfo` 虽然已经改为本地优先，但在本地字段不完整时仍会回源 UM API。
  - 没有统一缓存策略，也没有 tag-based 失效。
- 影响：
  - SSR TTFB 会随着上游 API 波动而波动。
  - 数据库和外部 API 压力无法平滑。
  - 页面性能优化基本只能依赖“机器更强”，而不是架构层优化。
- 建议：
  - 按数据特性拆缓存：
    - 课程基础信息：小时级或天级缓存。
    - 教师-课程映射：小时级缓存。
    - 评论列表：短 TTL 或 tag invalidation。
    - 投票/回复：局部动态。
  - 为数据库查询函数建立统一缓存包装层，例如 `unstable_cache`。
  - 评论提交成功后使用 `revalidateTag('review:course:prof')` 精准失效，而不是整页永久动态。

### P1: 第三方 API 调用直接耦合在页面读取链路中

- 相关文件：
  - [lib/database/get-course-info.ts](/Users/box/UMHelper/next-web/lib/database/get-course-info.ts:30)
- 现状：
  - 课程详情页仍保留对 `https://api.data.um.edu.mo/service/academic/course_catalog/all` 的 fallback。
  - 当前已补上 1 天缓存和超时控制，但仍然是页面链路上的回退逻辑。
- 风险：
  - 上游波动会直接拖慢页面渲染。
  - 页面读取链路依赖第三方 API 的可用性、证书兼容性和响应时间。
  - 在 Edge/Cloudflare 目标环境下，Node `https.Agent` 兼容性也不是长期稳妥方案。
- 建议：
  - 不要在页面请求时直连第三方教务 API。
  - 更合理的结构：
    - 定时同步 UM API 数据到 PostgreSQL。
    - 页面仅读本地 PostgreSQL。
    - 同步任务可单独跑在 Cron/Worker 中。
  - 如果暂时保留直连：
    - 增加超时、重试、断路保护。
    - 加缓存。
    - 让 fallback 成为显式策略，而不是页面逻辑里的混合控制流。

### P1: 数据库访问边界不清晰，server/browser/service-role 混用

- 相关文件：
  - [lib/database/database.js](/Users/box/UMHelper/next-web/lib/database/database.js:1)
- 当前状态：
  - 这一问题已完成第一轮治理，现有客户端已拆成 `shared/browser/server/admin`。
  - 但调用层还没有完全类型化，权限边界主要靠约定而非 schema types。
- 建议：
  - 下一步补 Supabase schema types，并把 RPC/表查询的返回值收紧。

### P1: Sitemap 生成存在重复全表扫描和异步写法问题

- 相关文件：
  - [app/sitemap.ts](/Users/box/UMHelper/next-web/app/sitemap.ts:5)
- 现状：
  - sitemap 生成会全量扫描课程表、教师表。
  - `fetchCatalogSitemap` 中使用 `faculty.map(async ...)`，但没有等待内部异步完成。
- 影响：
  - sitemap 内容可能不完整。
  - 构建阶段会额外增加数据库负载。
- 建议：
  - 改为 `for...of await` 或 `Promise.all` 正确等待。
  - sitemap 尽量基于已同步的轻量索引表生成。
  - 对于体量很大的站点，考虑 sitemap index 分片。

### P1: 搜索逻辑存在 N+1 查询

- 相关文件：
  - [lib/database/get-fuzzy-search.ts](/Users/box/UMHelper/next-web/lib/database/get-fuzzy-search.ts:17)
- 现状：
  - 教师搜索先查 `prof_info`，再对每个教师调用一次 `get_course_list_by_prof` RPC。
- 影响：
  - 搜索结果一多，数据库 round-trip 急剧增加。
- 建议：
  - 在 PostgreSQL 端一次性完成：
    - join
    - 聚合
    - 或单个 RPC 返回教师及其课程列表
  - 如果搜索是高频功能，建议引入专门的 search view 或全文索引。

### P1: 评论数据组装在 React 渲染阶段做了多轮 O(n²) 处理

- 相关文件：
  - [components/comments.tsx](/Users/box/UMHelper/next-web/components/comments.tsx:6)
- 现状：
  - 每条评论都反复 `filter(vote_history)`、再按 emoji `filter`、再按 reply 过滤。
- 影响：
  - 评论量上来后，页面渲染成本会快速增加。
  - 这些计算每次 render 都会重复执行。
- 建议：
  - 在服务端先归并成结构化数据：
    - `comment -> votes summary`
    - `comment -> replies[]`
  - 或在组件内先建 `Map`：
    - `voteByCommentId`
    - `replyByParentId`
  - 避免每个 comment 上做全量扫描。

### P1: 客户端包体偏重，存在明显的“能服务端就不要客户端”的空间

- 相关文件：
  - [components/search.tsx](/Users/box/UMHelper/next-web/components/search.tsx:1)
  - [components/course-filter.tsx](/Users/box/UMHelper/next-web/components/course-filter.tsx:1)
  - [app/timetable/page.tsx](/Users/box/UMHelper/next-web/app/timetable/page.tsx:1)
  - [components/comment-card.tsx](/Users/box/UMHelper/next-web/components/comment-card.tsx:1)
  - [components/bbs-updates.tsx](/Users/box/UMHelper/next-web/components/bbs-updates.tsx:1)
- 现状：
  - 搜索、筛选、评论卡片、课表等大量核心页面是重客户端组件。
  - 同时项目混用 MUI、Radix、Fancybox、`@aldabil/react-scheduler`、`axios` 等多套重量依赖。
  - 当前 `.next` 目录约 `483M`，`node_modules` 约 `1.4G`。
- 影响：
  - 首屏 JS 体积和 hydration 成本偏高。
  - 构建和冷启动也会受影响。
- 建议：
  - 先做依赖审计，识别是否可以去掉：
    - `axios` 改原生 `fetch`
    - MUI 与 shadcn/Radix 重叠部分择一
    - 非关键 Fancybox/动画库按需加载
  - 用 Next.js Server Components 承接能在服务端完成的数据获取与组装。
  - 对课表、评论互动、上传等高交互模块再保留客户端岛屿。

### P2: 组件中存在模块级副作用，不利于稳定渲染

- 相关文件：
  - [components/comment-card.tsx](/Users/box/UMHelper/next-web/components/comment-card.tsx:26)
- 现状：
  - `Fancybox.bind(...)` 在模块顶层直接执行。
- 风险：
  - 热更新、重复挂载、页面切换时可能出现副作用累积。
- 建议：
  - 移到 `useEffect`，并在卸载时做清理。

### P2: TypeScript 类型覆盖率较弱，大量 `any`

- 相关文件：
  - `app/**`
  - `lib/database/**`
- 现状：
  - 数据库读写、params、API 请求体大量使用 `any`。
- 影响：
  - build 虽然有类型检查，但实际约束力有限。
  - 重构时不容易发现字段名漂移或返回结构变化。
- 建议：
  - 先生成 Supabase/PostgreSQL 类型。
  - 为评论、课程、教师、投票建立领域模型类型。
  - 新增 RPC 返回类型和 route payload schema。

### P2: 运行时警告提示依赖元数据过旧

- 现象：
  - `npm run build` 输出 `Browserslist: caniuse-lite is outdated`
- 影响：
  - 不是主问题，但说明前端依赖维护节奏偏弱。
- 建议：
  - 纳入常规依赖维护。
  - 每月或每个迭代做一次锁文件刷新和构建回归。

## 4. 关于“能否使用 Next.js / PostgreSQL 特性优化”的建议

答案是可以，而且应该优先这么做。

### 4.1 Next.js 侧建议

- 用 Server Components 承接只读数据页面。
- 用 `unstable_cache` 包装高频只读数据库查询。
- 用 `fetch(..., { next: { revalidate, tags } })` 或自定义缓存策略管理外部/内部读取。
- 评论提交、投票、回复成功后使用 `revalidateTag` 精准失效。
- 将热门课程页做 ISR，长尾页按需生成，而不是全量 `generateStaticParams`。
- 把真正高交互的部分切成小型 client island，减少整页客户端化。

### 4.2 PostgreSQL 侧建议

- 用自增主键或 UUID，移除应用层手工分配 id。
- 用视图 / 物化视图 / 触发器维护统计聚合，避免应用层算均值。
- 用 SQL function/RPC 一次性返回评论树、投票汇总、教师搜索结果，减少 N+1。
- 给高频查询列补索引，例如：
  - `course_noporf.New_code`
  - `prof_with_course.course_id`
  - `prof_with_course.prof_id`
  - `comment.course_id`
  - `comment.replyto`
  - `vote.comment_id`
- 如果评论和投票量继续增长，可以考虑将统计表与明细表职责分开。

### 4.3 更合理的目标结构

- 第三方教务 API：
  - 由定时同步任务写入 PostgreSQL。
- 页面读取：
  - 只读 PostgreSQL，不直连第三方。
- 页面缓存：
  - 由 Next.js `revalidate/tag` 控制。
- 写操作：
  - 通过 route handler / server action 进入数据库事务或 SQL function。

## 5. 建议的优化优先级

### 第一阶段：数据同步与缓存治理

1. 把 UM API 数据同步改成定时任务，不再依赖页面访问时触发回填。
2. 给课程详情、教师详情、评论列表建立统一的 `revalidate/tag` 策略。
3. 为核心写接口补 `revalidateTag` 或其他精准失效机制。
4. 为关键 RPC 增加慢查询监控和执行耗时记录。

### 第二阶段：继续收缩查询与前端成本

1. 为 `/timetable` 做 bundle 审计，优先处理 555 kB 首屏包体。
2. 继续去掉不必要的客户端依赖，特别是重型日程和弹窗库。
3. 将评论/搜索等链路继续类型化，收缩 `any`。
4. 清理仍未使用的旧查询函数与兼容逻辑。

### 第三阶段：工程化补强

1. 把数据库迁移纳入固定流程，避免线上修复只存在于 SQL 文件和手工执行记录中。
2. 引入 Supabase schema types、payload schema 和基础数据库回归测试。
3. 建立线上数据质量巡检，例如重复映射、空格污染、聚合漂移计数。

## 6. 推荐落地任务清单

可以直接据此拆 issue：

1. 修复 `next build` 失败并补 CI 构建门禁。
2. 重构 Supabase 客户端分层：`browser/server/admin`。
3. 评论/回复主键改为数据库生成。
4. 评论插入与统计更新改为单个数据库事务/RPC。
5. 为课程页、教师页、评论页建立缓存与失效策略。
6. 下线页面请求路径中的 UM API 直连，改为异步同步入库。
7. 收缩 `generateStaticParams` 范围，仅保留高价值静态页。
8. 修复 sitemap 异步问题并做分片或轻量化生成。
9. 优化搜索 SQL/RPC，消除 N+1。
10. 优化评论组件数据预处理，避免 render 时重复扫描。
11. 做一次依赖减重和 bundle 审计。
12. 为数据库高频查询补索引和类型定义。

## 7. 这次调研的实测结果

- `npm run build`：
  - 已通过。
  - 当前产出 `54` 个静态页面。
- 构建日志同时出现：
  - `Browserslist: caniuse-lite is outdated`
- 当前最重页面：
  - `/timetable`：路由体积 `410 kB`，首屏 `555 kB`

## 8. 总结

你观察到的两个问题是准确的，而且背后不是单点问题，而是一组相互放大的结构性问题：

- build 慢，不只是“构建工具慢”，而是全量静态生成、重依赖、构建链路不健康共同造成的。
- 服务端请求耦合，不只是“请求写在 server 上”，而是数据源、缓存、权限、聚合和页面渲染责任没有分层。

如果后续只做局部修补，收益会有限。更合理的方向是：

- 先修构建与写入正确性。
- 再把数据库读写边界、缓存策略和第三方同步链路重建。
- 最后再做前端包体和交互性能收缩。
