# next-web 首页统计栏目设计

> 状态：Draft，等待人工 review
> 日期：2026-09-19
> 前置：首页已有 `CommentBank`（读取 `statistics` 表的各学院课程/评论统计）
> 后续计划：review 通过后，用 `writing-plans` 生成实施计划

---

## 1. 背景

当前首页 `app/page.tsx` 通过 `components/comment-bank.tsx` 展示 7 个学院的课程数和评论数。该实现存在几个问题：

- 直接读取 `statistics[0]` 到 `statistics[6]`，如果数据库行数不足 7 行会抛错；
- 学院统计和图标硬编码，新增/删除学院都要改 UI；
- 链接使用绝对地址 `https://www.umeh.top/...`，本地开发和预览环境无法跳转；
- 首页没有“近期热门课程”这一层信息。

用户已确认：

- 统一为一个统计栏目，而不是保留两套独立栏目；
- “近期”定义为最近 30 天；
- 热门排名只按最近 30 天的顶层评论数，不使用点赞、表情或平均分参与排序。

本设计把现有 `CommentBank` 重构为统一的首页统计栏目，并新增“近 30 天热门课程 Top 5”。

## 2. 目标与非目标

### 2.1 目标

- **G1**：首页新增统一的 `HomeStatistics` 板块，同时展示学院统计和近 30 天热门课程。
- **G2**：热门课程按最近 30 天可见顶层评论数从多到少排序，只取 Top 5。
- **G3**：评论数相同时，按最新评论时间降序，再按课程代码升序，保证结果稳定。
- **G4**：学院统计改为根据 `statistics` 表动态渲染，数据不足 7 行时不崩溃。
- **G5**：聚合在数据库侧完成，新增 `get_popular_courses` RPC，并配合 `unstable_cache` 缓存 1 小时。
- **G6**：评论写入后通过现有 `statistics` cache tag 刷新热门课程。
- **G7**：提供空态、错误降级和单元测试。
- **G8**：本地 `schema.sql + seed.sql` bootstrap 不包含新 RPC 时，应用层有开发降级路径。

### 2.2 非目标

- **N1**：点赞、表情反应、平均分不参与热门排序。
- **N2**：不新增客户端 API route；首页 Server Component 直接读取数据库。
- **N3**：不修改 iOS `GET /api/statistics` 的返回结构。
- **N4**：不新增全站总览数字（总课程数、总评论数等）。
- **N5**：不修改课程详情页、教授页或评论页。
- **N6**：不新增实时推送或 WebSocket；刷新粒度为 1 小时或评论写入后的 tag 失效。

## 3. 指标定义

### 3.1 有效评论

满足以下条件的评论计入“近 30 天评论”：

- `comment.replyto is null`
- `comment.hidden <> 1`
- `comment.pub_time >= (now() at time zone 'UTC') - interval '30 days'`

回复不计入，因为热门课程反映的是新评价数量，不是讨论串长度。

### 3.2 时间窗口

- 固定 30 天，由应用层常量 `POPULAR_COURSE_DAYS = 30` 传给 RPC。
- RPC 参数仍允许传其他天数，便于后续复用；默认值为 30。
- 参数会被钳制到 `1..365`，避免异常窗口。

### 3.3 排序规则

```text
comment_count DESC
latest_comment_at DESC
course_code ASC
```

平均分 `avg_result` 只作为卡片辅助信息展示，不参与排序。

### 3.4 时区

应用写入 `comment.pub_time` 时使用 UTC：

```ts
new Date().toISOString().slice(0, 19).replace("T", " ")
```

因此 SQL 中统一使用 `(now() at time zone 'UTC')` 作为当前时间，避免数据库会话时区不同带来的偏移。

## 4. 数据库设计

### 4.1 Migration

新增文件：

```text
supabase/migrations/20260919_homepage_statistics.sql
```

内容为幂等的 index 和函数创建，不修改已有表结构。

### 4.2 新增索引

```sql
create index if not exists comment_recent_visible_idx
on public.comment (pub_time desc)
where replyto is null and hidden <> 1;
```

该索引服务近 30 天评论筛选和排序。

### 4.3 RPC 签名

```sql
create or replace function public.get_popular_courses(
  target_days integer default 30,
  result_limit integer default 5
)
returns table (
  course_code text,
  course_title_eng text,
  course_title_chi text,
  offering_unit text,
  comment_count bigint,
  avg_result real,
  latest_comment_at timestamp without time zone
)
```

### 4.4 RPC 实现

```sql
create or replace function public.get_popular_courses(
  target_days integer default 30,
  result_limit integer default 5
)
returns table (
  course_code text,
  course_title_eng text,
  course_title_chi text,
  offering_unit text,
  comment_count bigint,
  avg_result real,
  latest_comment_at timestamp without time zone
)
language sql
stable
security invoker
set search_path = public
as $function$
  with recent_comments as (
    select
      comment.course_id,
      comment.result,
      comment.pub_time
    from public.comment
    where comment.replyto is null
      and comment.hidden <> 1
      and comment.pub_time >= (now() at time zone 'UTC')
        - make_interval(days => greatest(least(coalesce(target_days, 30), 365), 1))
  )
  select
    course."New_code"::text as course_code,
    course."courseTitleEng"::text as course_title_eng,
    course."courseTitleChi"::text as course_title_chi,
    course."Offering_Unit"::text as offering_unit,
    stats.comment_count,
    stats.avg_result,
    stats.latest_comment_at
  from (
    select
      prof_with_course.course_id,
      count(*)::bigint as comment_count,
      avg(recent_comments.result)::real as avg_result,
      max(recent_comments.pub_time) as latest_comment_at
    from recent_comments
    join public.prof_with_course
      on prof_with_course.id = recent_comments.course_id
    group by prof_with_course.course_id
  ) as stats
  join public.course_noporf as course
    on course."New_code" = stats.course_id
  order by
    stats.comment_count desc,
    stats.latest_comment_at desc,
    course."New_code" asc
  limit greatest(least(coalesce(result_limit, 5), 50), 1);
$function$;
```

### 4.5 权限

安全模型与现有 RPC 一致：`security invoker`，只允许服务端 service role 调用。

```sql
revoke all on function public.get_popular_courses(integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_popular_courses(integer, integer)
  to postgres, service_role;
notify pgrst, 'reload schema';
```

### 4.6 迁移顺序

1. 先在目标数据库执行 migration（additive，可安全回滚）。
2. 再部署前端代码。
3. 如果代码先部署而 migration 未执行，`getPopularCourses` 会走本地降级查询，不会阻塞首页。

## 5. 应用层设计

### 5.1 类型

在 `lib/database/types.ts` 新增：

```ts
export type FacultyStatisticRow = {
  id: number;
  name: string;
  course_num: number;
  comment_num: number;
};

export type PopularCourseRow = {
  courseCode: string;
  courseTitleEng: string;
  courseTitleChi: string | null;
  offeringUnit: string;
  commentCount: number;
  avgResult: number;
  latestCommentAt: string;
};
```

`getStatistics` 的返回类型从 `any` 收紧为 `FacultyStatisticRow[]`。

### 5.2 热门课程读取

新增：

```text
lib/database/get-popular-courses.ts
```

公开接口：

```ts
export const POPULAR_COURSE_DAYS = 30;
export const POPULAR_COURSE_LIMIT = 5;

export async function fetchPopularCourses(): Promise<PopularCourseRow[]>;

export const getPopularCourses = unstable_cache(
  fetchPopularCourses,
  ["popular-courses"],
  { revalidate: 3600, tags: [CACHE_TAGS.statistics] },
);
```

`fetchPopularCourses` 逻辑：

1. 调用 `supabaseServer.rpc("get_popular_courses", { target_days: 30, result_limit: 5 })`；
2. RPC 成功时把 snake_case 行映射为 `PopularCourseRow`；
3. RPC 失败时记录 `console.error`，进入本地降级；
4. 本地降级只查询最近评论、`prof_with_course` 和 `course_noporf`，用纯函数聚合后取 Top 5；
5. 降级路径最多读取 1000 条最近评论，仅用于本地开发，不保证生产数据完整性。

### 5.3 纯聚合函数

为便于单元测试，导出：

```ts
export function aggregatePopularCourses(
  comments: RecentCommentRow[],
  links: CourseLinkRow[],
  courses: CourseMetaRow[],
  limit = POPULAR_COURSE_LIMIT,
): PopularCourseRow[];
```

排序规则与 SQL 完全一致，避免本地和生产结果行为不一致。

### 5.4 缓存与失效

- `getPopularCourses` 和 `getStatistics` 共用 `CACHE_TAGS.statistics`；
- 评论写入后 `invalidateAfterCommentWrite()` 已经会调用 `revalidateTag(CACHE_TAGS.statistics)`；
- 回复和投票不改变排序，因此不新增投票失效逻辑；
- 首页其余内容不受影响。

## 6. UI 设计

### 6.1 组件拆分

新增：

- `components/home-statistics.tsx`：统一栏目 Server Component，并行获取学院统计和热门课程；
- `components/faculty-statistics.tsx`：学院统计卡片；
- `components/popular-courses.tsx`：热门课程 Top 5 列表。

删除或替换：

- `components/comment-bank.tsx`：由 `FacultyStatistics` 替代。

修改：

- `app/page.tsx`：用 `<HomeStatistics />` 替换 `<CommentBank />`。

### 6.2 布局

桌面端：

- 外层 `max-w-screen-xl`, 上下 padding 与现有首页一致；
- 标题：`Course Statistics`；
- 副标题：`Faculty coverage and the most discussed courses in the last 30 days.`；
- 两栏 grid：
  - 左栏：学院统计
  - 右栏：近 30 天热门课程 Top 5

移动端：

- 热门课程显示在上；
- 学院统计显示在下；
- 学院卡片 2 列，热门课程单列。

### 6.3 学院统计

- 遍历 `statistics` 返回的每一行，不假设固定行数；
- 每张卡片显示：
  - 学院名
  - `course_num courses`
  - `comment_num comments`
- 图标根据学院名动态选择，未知学院使用默认 `School` 图标；
- 使用 `<Link href={`/catalog/${encodeURIComponent(row.name)}`}>`，不再使用绝对域名；
- 空数据时显示 `Statistics are not available yet.`。

### 6.4 热门课程

- 每项显示：
  - 排名 `1..5`
  - 课程代码
  - 课程英文名
  - 学院名
  - `X comments in 30 days`
  - 平均分，保留 1 位小数
- 整项链接到 `/course/{courseCode}`；
- 空数据时显示 `No recent activity yet.`；
- 平均分 `avgResult` 为 0 时显示 `N/A`，不伪造分数。

### 6.5 语言

继续沿用首页当前英文 UI 文案，不新增全站 i18n。

## 7. 错误与空态

- RPC 失败：记录日志，走本地降级；降级也失败则返回 `[]`；
- `getStatistics` 查询失败：现有实现已经返回 `[]`；
- 学院统计为空：仅显示空态，不崩溃；
- 热门课程为空：仅显示空态；
- 不因为统计栏目失败而影响首页其他模块渲染。

## 8. 测试策略

### 8.1 单元测试

新增 `tests/database/popular-courses.test.ts`：

- 验证 `fetchPopularCourses` 调用 RPC 时传入 `target_days: 30` 和 `result_limit: 5`；
- 验证 snake_case RPC 行正确映射为 `PopularCourseRow`；
- 验证 RPC 报错时进入降级路径；
- 验证 `aggregatePopularCourses` 按评论数、最新评论时间、课程代码排序；
- 验证 limit 生效。

新增 `tests/components/popular-courses.test.tsx`：

- 渲染空数组时显示空态；
- 渲染有数据时显示排名、课程代码、评论数和平均分；
- 课程链接为 `/course/{code}`。

### 8.2 SQL 验证

- 使用 `scripts/apply-sql.mjs` 或 `psql` 在 `begin; ... rollback;` 中执行 migration；
- 调用一次 `select * from public.get_popular_courses(30, 5);`；
- 确认返回列名、类型和排序。

### 8.3 命令

```bash
npm run test
npm run lint
npx tsc --noEmit
npm run build
```

## 9. 验收标准

- [ ] 首页只显示一个统一统计栏目，不再出现旧 `CommentBank`。
- [ ] 学院统计根据 `statistics` 表动态渲染，只有 1 行数据时也不崩溃。
- [ ] 热门课程展示近 30 天评论数最多的 Top 5。
- [ ] 排序为评论数降序、最新评论时间降序、课程代码升序。
- [ ] 点赞、表情、平均分不参与排序。
- [ ] 数据为空时显示空态。
- [ ] 评论写入后统计 tag 失效，下一轮渲染读取新聚合结果。
- [ ] 本地数据库没有 `get_popular_courses` RPC 时，降级路径可以展示 seed 数据。
- [ ] `npm run test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。

## 10. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 30 天窗口内某门课评论量远大于其他课，榜单被单一课程占据 | 这是当前真实数据分布；排序目标可解释，后续可再讨论加权或分页 |
| `pub_time` 是 `timestamp without time zone`，可能受时区影响 | SQL 显式使用 UTC，与应用写入逻辑一致 |
| 本地 bootstrap 只导入 schema + seed，不含新 RPC | 应用层提供降级查询；生产以 migration 为准 |
| PostgREST 默认最多返回 1000 行 | 生产走数据库 RPC，不受该限制；降级仅用于本地 |
| 学院图标映射遗漏新学院 | 未命中时使用默认图标，不抛错 |

## 11. 上线顺序

1. Review 本设计并确认。
2. 用 `writing-plans` 生成实施计划。
3. 按计划实现并测试。
4. 在目标数据库执行 `20260919_homepage_statistics.sql`。
5. 部署前端。
6. 手动验证首页统计栏目和热门课程 Top 5。
