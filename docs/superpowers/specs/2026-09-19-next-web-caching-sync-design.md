# next-web 缓存、数据同步与部署缓存设计（Phase 3）

> 状态：Draft，等待人工 review
> 日期：2026-09-19
> 前置阶段：Phase 1A/1B、Phase 2 已完成
> 后续计划：待 review 后生成；预计 `docs/superpowers/plans/2026-09-19-next-web-caching-sync.md`

---

## 1. 背景

Phase 1A/1B/2 已解决写接口安全、隐私边界、正确性和首屏 SSR/包体。当前剩下的系统性问题集中在“数据新鲜度、缓存和第三方依赖”：

1. **读路径缓存策略不统一**
   - `app/course/[code]/page.tsx`：`revalidate = 3600`
   - `app/professor/[...name]/page.tsx`：`revalidate = 3600`
   - `app/reviews/[code]/[...prof]/page.tsx`：`revalidate = 0` + `dynamic = "force-dynamic"`
   - `app/catalog/[...departments]/page.tsx`、`app/search/**`：没有显式 `revalidate`
   - `app/sitemap.ts`：`revalidate = 86400`
   - 没有一个统一的 tag / 失效策略；写评论、回复、投票后不会主动失效受影响的页面缓存。

2. **第三方 UM API 仍在页面请求链路**
   - `lib/database/get-course-info.ts` 的 `fetchCourseInfo` 在本地字段不完整时会调用 UM Open Data API，并执行 upsert。
   - iOS `/api/course` 是 `force-dynamic`，可能每次请求都触发 fallback + 写库。
   - 这与 audit 文档里的目标“定时同步到 PostgreSQL，页面只读本地库”不一致。

3. **Sitemap 仍低效**
   - `app/sitemap.ts` 对每个 faculty 单独查一次 `course_noporf`，并全量扫描课程表、教师课程映射表。
   - `lastModified` 永远 `new Date()`，对爬虫是误导。
   - `countUniqueValues` 使用 O(n²) 的 `includes`。

4. **Cloudflare/OpenNext 缓存未配置**
   - `open-next.config.ts` 为空。
   - `wrangler.jsonc` 中 R2 incremental cache binding 是注释状态。
   - 这意味着 Next 的 `revalidate` / ISR 在 Cloudflare 上可能不持久化，或者退化为 no-cache。

Phase 3 目标是把“读缓存 + 写失效 + 第三方同步 + 部署缓存”做成明确、可验证、可回滚的一层。

## 2. 目标与非目标

### 2.1 目标

- **G1**：课程、教师、统计等公开读路径统一使用 `unstable_cache` + tag。
- **G2**：写操作（评论、回复、投票、未来的管理写）成功后精准失效相关 tag，而不是整页永久 dynamic。
- **G3**：把 UM Open Data API 从页面请求链路移出；页面只读本地 PostgreSQL。
- **G4**：建立可运行的 UM 数据同步任务（外部 cron 或 Cloudflare Cron + 受保护 API）。
- **G5**：Sitemap 改成固定少量查询、稳定 `lastModified`、错误可降级。
- **G6**：Cloudflare OpenNext incremental cache / tag cache 配置明确；如果暂不启用 R2，则明确降级策略。
- **G7**：为缓存命中、失效和同步任务加可观测指标。

### 2.2 非目标

- **N1**：不改 UI、不改 Masonry、不改 Timetable。
- **N2**：不做 Supabase schema 大改；只允许新增必要的 updated_at / sync 元数据表。
- **N3**：不做完整类型治理和死代码清理（Phase 4）。
- **N4**：不引入外部 Redis/Upstash；优先使用 Next 缓存 + Supabase/Cloudflare 原生能力。
- **N5**：不重构 iOS API 的响应结构。

## 3. 范围分解

| 子阶段 | 主题 | 主要文件 |
|---|---|---|
| **3A** | 服务端读缓存与 tag | `lib/cache.ts`、`lib/database/*.ts`、各页面 |
| **3B** | 写路径失效 | `app/api/comment/**`、`app/api/reply/route.ts`、`app/api/vote/**` |
| **3C** | UM API 定时同步 | `lib/database/sync-um.ts`、`scripts/sync-um.mjs`、`.github/workflows/sync-um.yml`（或 Cloudflare Cron） |
| **3D** | Sitemap 轻量化 | `app/sitemap.ts` |
| **3E** | OpenNext/Cloudflare 缓存 | `open-next.config.ts`、`wrangler.jsonc` |

## 4. 设计

### 4.1 3A：读缓存层

新增 `lib/cache.ts`：

```ts
import { unstable_cache } from "next/cache";

export const CACHE_TAGS = {
  course: (code: string) => `course:${code.toUpperCase()}`,
  professor: (name: string) => `professor:${name.toUpperCase()}`,
  review: (code: string, prof: string) => `review:${code.toUpperCase()}:${prof.toUpperCase()}`,
  statistics: "statistics",
  catalog: "catalog",
};

export function cached<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  options: { revalidate: number; tags: string[] },
) {
  return unstable_cache(fn, keyParts, options);
}
```

建议缓存策略：

| 数据 | TTL | Tags |
|---|---:|---|
| `getCourseInfo` | 3600 | `course:CODE`, `catalog` |
| `fetchCourseListByProf` | 3600 | `professor:NAME` |
| `getProfListByCourse` | 3600 | `course:CODE` |
| `getReviewInfo` | 300 | `review:CODE:PROF`, `professor:NAME` |
| `getStatistics` | 3600 | `statistics` |
| `fetchCatalogList` | 3600 | `catalog` |
| `getScheduleList` | 1800 | `review:CODE:PROF` |

实现方式：

- 在 `lib/database/get-course-info.ts`、`get-prof-info.ts`、`get-statistics.ts` 中把纯查询函数改成 `cached(...)` 包装。
- 页面继续读取同样的函数，无需知道缓存细节。
- 保留 `unstable_cache` 的 key 参数包含函数实参，避免不同 code/prof 共用缓存。

**评论分页单独处理**：

- `get_comment_page_v2` 包含 viewer-specific `vote_history`，不能整体按 URL 缓存给所有用户。
- 本阶段有两种选择：
  - **推荐**：评论数据仍然每请求查询，但使用 `revalidate: 30` 缓存“公共部分”（不含 viewer 票），viewer vote 单独查询/合并。
  - **简化**：评论页保持 dynamic，只缓存课程/教师/统计；等后续评论量增大再拆。
- 决策：Phase 3A 采用简化方案，评论页继续 dynamic；3A 不强行缓存评论分页。

### 4.2 3B：写路径失效

在写操作成功后调用 Next `revalidateTag` / `revalidatePath`：

- 评论提交：
  - `revalidateTag(CACHE_TAGS.review(code, prof))`
  - `revalidateTag(CACHE_TAGS.course(code))`
  - `revalidateTag(CACHE_TAGS.professor(prof))`
  - `revalidateTag(CACHE_TAGS.statistics)`
  - `revalidateTag(CACHE_TAGS.catalog)`（如果是新课）
- 回复：
  - `revalidateTag(CACHE_TAGS.review(code, prof))`
- 投票：
  - `revalidateTag(CACHE_TAGS.review(code, prof))`

注意：

- `revalidateTag` 在 Route Handler 中调用即可；不要调用 `revalidatePath("/", "layout")`，避免整站失效。
- 如果 OpenNext 未配置 tag cache，`revalidateTag` 可能 no-op；此时退化为 TTL 到期刷新，不报错。
- 需要把 `code` / `prof` 从写请求上下文拿到；评论提交用 URL 参数，回复需要查父评论得到 course/prof，投票需要按 comment id 查 prof_with_course。

### 4.3 3C：UM API 定时同步

**目标**：页面请求链路不再调用 UM API；`fetchCourseInfo` 的 fallback 删除或只在 admin/同步脚本中使用。

同步任务设计：

- 新增 `lib/database/sync-um.ts`：
  - `syncCourseByCode(code)`：调用 UM API，把结果 upsert 到 `course_noporf`
  - `syncMissingCourses()`：找出 `course_noporf` 中字段不完整的课程，批量同步
  - `syncAllCourses()`：可选，全量同步（谨慎）
- 新增 `scripts/sync-um.mjs`：
  - 加载 `.env.local` 或环境变量
  - 使用 `SUPABASE_SECRET_KEY` 写库
  - 支持 `--missing`（默认）、`--all`、`--code=ACCT1000`
  - 输出统计：scanned / updated / failed
- 调度方式（二选一，需要人工确认）：
  - **方案 A（推荐，最简单）**：GitHub Actions scheduled workflow，每小时/每天调用 `node scripts/sync-um.mjs --missing`，secrets 存 `SUPABASE_URL` / `SUPABASE_SECRET_KEY` / `UM_OPEN_DATA_TOKEN`。
  - **方案 B**：Cloudflare Cron Trigger + 一个受保护的 Next Route Handler `/api/cron/sync-um`，用 `CRON_SECRET` 校验。OpenNext/Workers 对 Cron 支持需要额外配置，风险略高。
- 页面读取变更：
  - `fetchCourseInfo` 删除 `fetchCourseInfoByUMAPI` fallback；只读本地库。
  - 保留 `lib/database/get-course-info.ts` 中的 `normalizeLocalCourseInfo` 默认值。
  - 如果本地缺字段，页面显示默认值，不再触发写库。
- 外部依赖：
  - `UM_OPEN_DATA_TOKEN`
  - 定时任务 secret / GitHub Actions secrets
  - 需要一个可运行 Node 20+ 的调度环境

### 4.4 3D：Sitemap 轻量化

改造 `app/sitemap.ts`：

- `fetchCourseSitemap`：一次 `select("New_code")`，不要每个 faculty 查一次。
- `fetchReviewSitemap`：一次 `select("course_id,prof_id")`。
- `fetchCatalogSitemap`：**不再查库**，直接用 `faculty` / `faculty_dept` 常量生成。
- `countUniqueValues` 不再用于 sitemap。
- `lastModified`：
  - 如果表没有 `updated_at`，使用一个稳定的 `SITEMAP_LAST_MODIFIED` 常量（例如部署日期），而不是 `new Date()`。
  - 如果新增 `updated_at`（见下），则使用每行/每类的真实更新时间。
- 错误处理：
  - `data ?? []`
  - 查询失败时返回已有 sitemap，不抛错。
- 大数据量：
  - 如果 URL 数接近 50k，再拆 sitemap index；本阶段先记录数量阈值。

可选 schema 变更：

- 给 `course_noporf` / `prof_with_course` 增加 `updated_at timestamptz default now()` 与触发器，用于 sitemap 和缓存 debug。
- 该变更不是必须；如果做，需要独立 migration。

### 4.5 3E：OpenNext / Cloudflare 缓存

需要人工提供/确认的资源：

- 一个 R2 bucket（例如 `next-web-inc-cache`）
- Cloudflare account / worker 权限
- 决定是否启用 tag cache / queue

设计：

- `wrangler.jsonc` 启用 R2 binding（示例）：
  ```jsonc
  "r2_buckets": [
    {
      "binding": "NEXT_INC_CACHE_R2_BUCKET",
      "bucket_name": "next-web-inc-cache"
    }
  ]
  ```
- `open-next.config.ts` 配置 incremental cache：
  ```ts
  import { defineCloudflareConfig } from "@opennextjs/cloudflare";
  import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

  export default defineCloudflareConfig({
    incrementalCache: r2IncrementalCache,
  });
  ```
- 如果暂时不能创建 R2：
  - 明确所有需要缓存的页面保持 `dynamic = "force-dynamic"` 或使用短 TTL 但接受不持久化。
  - 在 spec 中记录“不使用 ISR”，不要假装 `revalidate` 有效。
- 需要验证：
  - 部署后首次访问 `/course/[code]` 触发缓存写入
  - 第二次访问命中缓存
  - `revalidateTag` 后数据更新

### 4.6 可观测性

- 为缓存函数加简单的 `console.log`/结构化日志：cache miss/set 不直接可见，至少记录 sync 任务统计。
- 为 UM 同步任务输出：
  - scanned / updated / failed / duration
- 为写路径失效加 `console.log`？避免过多日志，使用 Wrangler observability 已有采样即可。
- 可选：新增 `sync_runs` 表记录每次同步的开始/结束/状态，便于排查。

## 5. 外部依赖与人工操作

Phase 3 无法只靠代码完成，必须人工提供：

| 资源 | 用途 | 谁来提供 |
|---|---|---|
| R2 bucket + binding | OpenNext incremental cache | 人工在 Cloudflare 创建 |
| GitHub Actions secrets 或 Cron secret | 定时同步 UM 数据 | 人工配置 |
| `UM_OPEN_DATA_TOKEN` | 同步任务调用 UM API | 人工提供/轮换 |
| `SUPABASE_SECRET_KEY` | 同步任务写库 | 已在 Phase 1A 配置 |
| 是否允许新增 `updated_at` / `sync_runs` 表 | sitemap/监控 | 人工确认 |

如果 R2 / cron 暂时不能提供，Phase 3 可以降级为：

- 3A：只做 `unstable_cache` + TTL（无 tag 持久化，仍有效但进程内）
- 3C：先写同步脚本，手动运行；不接自动调度
- 3D：sitemap 轻量化照做
- 3E：不启用 R2，明确记录 no-ISR

## 6. 测试策略

- 单元测试：
  - `tests/cache-tags.test.ts`：tag 生成规则
  - `tests/sitemap.test.ts`：sitemap 组装逻辑、错误降级
  - `tests/sync-um.test.ts`：mocking UM API 与 Supabase，验证 missing/all/code 模式
- 集成/手动：
  - `/course/[code]` 二次访问命中缓存；更新课程后 tag 失效
  - 提交评论后课程/教师页统计更新
  - sitemap 输出数量与旧版对比
  - sync 脚本 `--missing` 可运行并输出统计
- 构建：
  - `npm run test` / `lint` / `tsc` / `build` / 隔离 `npm ci`

## 7. 发布与回滚

- 3A/3B：先部署缓存 + tag，观察命中率和数据延迟；出问题可改回 `dynamic`。
- 3C：先手动运行同步脚本，确认数据正确，再接 cron。
- 3D：sitemap 纯读，风险低。
- 3E：R2/OpenNext 配置需要 Cloudflare 部署验证；出问题可移除 binding 回到无 ISR。
- 数据库 migration（如果增加 updated_at / sync_runs）需要备份并单独执行。

## 8. 验收标准

- **AC1**：课程、教师、统计读路径至少 3 个函数使用 `unstable_cache`。
- **AC2**：评论/回复/投票成功后能触发对应 tag 失效（日志或集成测试可观察）。
- **AC3**：页面请求链路不再调用 UM Open Data API；grep 不到页面路径中的 UM fallback。
- **AC4**：`scripts/sync-um.mjs --missing` 可运行并输出 scanned/updated/failed。
- **AC5**：sitemap 查询次数为固定常量级（≤ 5 次），不再是 per-faculty 查询。
- **AC6**：sitemap `lastModified` 稳定，不再全部 `new Date()`。
- **AC7**：OpenNext/Cloudflare 缓存决策被明确记录；启用 R2 时二次访问命中，未启用时不宣称 ISR。
- **AC8**：`npm run test` / `lint` / `tsc` / `build` / `npm ci` 通过。

## 9. 后续

Phase 3 完成后：

- Phase 4：类型治理、死代码、依赖与配置审计、CI 门禁、`any` 收敛。
