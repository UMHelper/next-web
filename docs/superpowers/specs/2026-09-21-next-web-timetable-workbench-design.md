# Next Web 课表完整工作台设计（P3）

- 日期：2026-09-21
- 状态：Draft（待 review）
- 依赖：`2026-09-21-next-web-timetable-planner-core-design.md`（P1）
- 前置交付：`2026-09-21-next-web-timetable-share-compare-design.md`（P2，建议已完成）

---

## 1. 背景

P1 让 `/timetable` 能管理方案和看周视图，但选课仍然要跳到 `/search/course/[code]`、`/course/[code]`、`/reviews/[code]/[...prof]` 等页面。P3 把选课闭环搬进 `/timetable`：

- 左边搜索课程或教师，应用 faculty / department 筛选；
- 点击课程 → 选择教师 → 查看 section 和上课时间 → 直接加入；
- 右边周视图、学分、冲突数即时更新；
- 全程不离开 `/timetable`。

这是“边选课边看”的完整形态，也是本次交互优化的最终目标。

---

## 2. 目标与非目标

### 2.1 本期目标（In scope）

1. `/timetable` 支持课程 / 教师双模式搜索。
2. 支持 faculty / department 筛选，department 选项依赖 faculty。
3. 课程模式：课程 → 教师 → section → 加入。
4. 教师模式：教师 → 课程 → section → 加入。
5. 结果分页或“加载更多”，避免一次返回过多数据。
6. 搜索结果、选中的课程 / 教师 / section 通过 URL query 保存，支持刷新和返回。
7. 工作台复用 P1 的加入规则、冲突检测、自动保存和 FloatingPlanner 状态。
8. 桌面端左右分栏；移动端用全屏底部 Sheet 搜索，主视图保留周表。
9. 新增只读 catalog API 和对应 SQL RPC，供 Web 工作台使用。

### 2.2 非目标（Out of scope）

- 拖拽课程或调整时间。
- 导出图片 / PDF、课表打印。
- 修改课程、教师、offer、schedule 原始数据。
- 匿名用户使用工作台；P3 要求 Clerk 登录。
- AI 推荐、自动排课、冲突求解。
- 替换现有 `/search`、`/course`、`/reviews` 页面；它们仍然可用。
- iOS 客户端接口改造；新 API 只服务 Web 工作台。

---

## 3. 决策摘要

| 主题 | 决策 |
|---|---|
| 页面形态 | `/timetable` 从管理页升级为工作台 |
| 桌面布局 | 左侧搜索/筛选/结果，右侧方案头 + WeekGrid + 已选列表 |
| 移动布局 | 主视图 + 全屏底部 Sheet 搜索 |
| 搜索模式 | 课程 / 教师双模式 |
| 筛选 | faculty + department，department 依赖 faculty |
| 结果分页 | 每页 20，滚动/按钮加载更多 |
| URL 状态 | `mode` / `q` / `code` / `prof` / `faculty` / `department` |
| 加入逻辑 | 完全复用 P1 provider action 和冲突规则 |
| 数据来源 | 新 catalog API + 新 SQL RPC，不调用 iOS 专用 `/api/course` / `/api/fuzzy_search` |
| 缓存 | filters 可缓存；搜索和 section 数据动态读取 |

---

## 4. 页面布局

### 4.1 桌面端

```text
┌────────────────────────────────────────────────────────────────────┐
│ 方案选择器 │ 方案名 │ term │ 学分 │ 冲突 │ 分享 │ 新建            │
├───────────────────┬────────────────────────────────────────────────┤
│ 搜索与筛选面板     │  WeekGrid（完整周视图）                        │
│ - 模式切换         │                                                │
│ - 搜索框           │                                                │
│ - faculty/department│                                               │
│ - 结果列表         │                                                │
│ - 课程详情/教师列表 │                                                │
│ - section 列表     │                                                │
├───────────────────┴────────────────────────────────────────────────┤
│ 已选 section 横向列表：删除 / 冲突 / 学分                        │
└────────────────────────────────────────────────────────────────────┘
```

- 左侧面板宽度约 360–420px，固定高度内滚动。
- 右侧 WeekGrid 占满剩余空间，纵向可滚动。
- 已选 section 列表默认折叠，显示 `已选 N 门 · X 学分 · Y 冲突`。
- `FloatingPlanner` 在 `/timetable` 隐藏。

### 4.2 移动端

- 顶部保留方案选择器和摘要。
- 主区域是 WeekGrid，允许横向滚动。
- 底部 fixed 按钮 “搜索课程” → 打开全屏 Sheet。
- Sheet 内是同样的双模式搜索、筛选和 drill-down 流程。
- 加入成功后 toast，Sheet 不自动关闭，允许连续加入；用户主动关闭后回到周视图。

---

## 5. 搜索流程

### 5.1 课程模式

1. 输入课程码 / 课程名，debounce 300ms。
2. 调 `GET /api/timetable/catalog/search?type=course&q=&faculty=&department=&page=1`。
3. 结果列表展示课程码、英文名、faculty/department、是否 offered。
4. 点击课程：
   - 调 `GET /api/timetable/catalog/courses/[code]`；
   - 展示课程基础信息和教师列表。
5. 点击教师：
   - 调 `GET /api/timetable/catalog/courses/[code]/[prof]/sections`；
   - 展示当前学期 section 和对应时间地点。
6. 点击 section 旁的 “加入” → 走 P1 加入规则。
7. 已存在的 section 显示“已加入”；同课程不同 section 显示“替换”；冲突显示红色提示。

### 5.2 教师模式

1. 输入教师名，debounce 300ms。
2. 调 `GET /api/timetable/catalog/search?type=instructor&q=&faculty=&department=&page=1`。
3. 结果展示教师名和可授课程数。
4. 点击教师：
   - 展示该教师与筛选条件匹配的课程列表。
5. 点击课程：
   - 进入与课程模式相同的 section 列表。
6. 选择 section 加入。

### 5.3 筛选

- `faculty` 对应 `course_noporf.Offering_Unit`。
- `department` 对应 `course_noporf.Offering_Department`。
- department 选项在 faculty 改变后重新加载；faculty 为 `All` 时显示全部 department。
- 筛选变化后重置分页到第一页。
- 清除筛选后恢复完整结果。
- 教师模式筛选语义：只保留与该 faculty/department 课程有关联的教师。

### 5.4 URL 状态

- `?mode=course|instructor`
- `?q=<keyword>`
- `?faculty=<faculty>`
- `?department=<department>`
- `?code=<courseCode>`
- `?prof=<prof>`
- `?page=<page>`

使用 `router.replace` 更新 query，避免每敲一个字符都写 history；点击结果才写 `push`，让浏览器返回能回到上一级。

---

## 6. API 与数据层

所有 `/api/timetable/catalog/*` 要求 Clerk 登录，`dynamic = "force-dynamic"`，响应 `Cache-Control: private, no-store`，并加搜索 rate limit。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/timetable/catalog/filters` | 返回 faculty / department 选项 |
| `GET` | `/api/timetable/catalog/search?type=&q=&faculty=&department=&page=` | 课程 / 教师搜索结果，分页 |
| `GET` | `/api/timetable/catalog/courses/[code]` | 课程基础信息 + 教师列表 |
| `GET` | `/api/timetable/catalog/courses/[code]/[prof]/sections` | 该教师当前学期 section + schedules |

### 6.1 数据来源

- 课程基础信息：复用 `fetchCourseInfo` / `course_noporf`。
- 教师与课程关系：复用 `prof_with_course`。
- section 和上课时间：复用 `getScheduleList`，但它后续应改为 `getAppConfig()` + 服务端 term 过滤。
- 搜索与筛选：新增 SQL RPC。

### 6.2 新增 SQL RPC

```sql
-- 课程搜索 + faculty/department 筛选
create or replace function public.search_planner_courses(
  keyword text,
  faculty text,
  department text,
  page_limit integer,
  page_offset integer
) returns table (
  course_code text,
  course_title_eng text,
  course_title_chi text,
  offering_unit text,
  offering_department text,
  credits text,
  is_offered integer,
  total_count bigint
)
language sql
stable
as $$
  with filtered as (
    select
      c.*,
      count(*) over() as total_count
    from public.course_noporf c
    where (
      keyword is null
      or btrim(keyword) = ''
      or c."New_code" ilike '%' || btrim(keyword) || '%'
      or c."courseTitleEng" ilike '%' || btrim(keyword) || '%'
      or c."courseTitleChi" ilike '%' || btrim(keyword) || '%'
    )
      and (
        faculty is null
        or btrim(faculty) = ''
        or btrim(faculty) = 'All'
        or c."Offering_Unit" = btrim(faculty)
      )
      and (
        department is null
        or btrim(department) = ''
        or btrim(department) = 'All'
        or c."Offering_Department" = btrim(department)
      )
    order by c."New_code"
    limit greatest(page_limit, 1)
    offset greatest(page_offset, 0)
  )
  select
    c."New_code",
    c."courseTitleEng",
    c."courseTitleChi",
    c."Offering_Unit",
    c."Offering_Department",
    c."Credits",
    c."Is_Offered",
    c.total_count
  from filtered c;
$$;
```

```sql
-- 教师搜索 + 按 faculty/department 关联课程过滤
create or replace function public.search_planner_instructors(
  keyword text,
  faculty text,
  department text,
  page_limit integer,
  page_offset integer
) returns table (
  prof_id text,
  course_count bigint,
  total_count bigint
)
language sql
stable
as $$
  with matched as (
    select
      p.prof_id,
      count(distinct p.course_id) as course_count
    from public.prof_with_course p
    join public.course_noporf c
      on c."New_code" = p.course_id
    where (
      keyword is null
      or btrim(keyword) = ''
      or p.prof_id ilike '%' || btrim(keyword) || '%'
    )
      and (
        faculty is null
        or btrim(faculty) = ''
        or btrim(faculty) = 'All'
        or c."Offering_Unit" = btrim(faculty)
      )
      and (
        department is null
        or btrim(department) = ''
        or btrim(department) = 'All'
        or c."Offering_Department" = btrim(department)
      )
    group by p.prof_id
  )
  select
    m.prof_id,
    m.course_count,
    count(*) over() as total_count
  from matched m
  order by m.prof_id
  limit greatest(page_limit, 1)
  offset greatest(page_offset, 0);
$$;
```

约束：

- 使用 `ILIKE` + `pg_trgm` 索引保持现有模糊搜索风格。
- `faculty` / `department` 为空或 `'All'` 时不过滤。
- RPC 保持 `security invoker`，不要用 `security definer`。
- 返回 `total_count` 供“加载更多”判断。
- 搜索 RPC 是只读、公开数据；但仍只通过 Web API 调用。

### 6.3 分页

- 默认 `pageSize = 20`。
- 返回 `{ items, page, pageSize, total }`。
- 前端滚动到底部或点击“加载更多”获取下一页。
- 切换模式、关键词、faculty、department 时重置 page = 1。

---

## 7. 与 P1 状态层的集成

P3 不新增客户端 store。所有加入/替换/删除都调用 P1 的 provider action：

```ts
addSectionToPlan({ planClientRef, section });
replaceSectionInPlan({ planClientRef, oldKey, section });
removeSectionFromPlan({ planClientRef, key });
```

- 加入后立即更新 reducer + localStorage，悬浮层/WeekGrid 同步刷新。
- 冲突检测继续用 P1 的 `detectScheduleConflicts`。
- 自动保存、离线 outbox、409 冲突处理全部复用，不在工作台重写。
- 工作台只负责“发现课程和 section”，不直接写服务端 API。

---

## 8. 状态、错误与空状态

| 状态 | UI |
|---|---|
| 搜索中 | 结果区 skeleton |
| 无结果 | “没有找到匹配课程/教师”，可清除筛选 |
| 搜索失败 | 内联错误 + 重试按钮 |
| 课程无教师 | “暂无可选教师” |
| 教师无 section | “当前学期没有可用 section” |
| 加入成功 | toast + section 变已加入 |
| 已加入 | 按钮禁用/显示已加入 |
| 同课程不同 section | 替换确认框 |
| 时间冲突 | 允许加入，但卡片和 WeekGrid 标记冲突 |
| 未登录 | 整个工作台引导登录 |
| 学期数据不可用 | 说明当前 term 无 timetable 数据 |

URL 参数非法时回退到默认状态，不抛错。

---

## 9. 性能与体验

- 搜索 debounce 300ms；请求使用 `AbortController`，避免旧结果覆盖新结果。
- 同一 query + page 的结果在内存中短暂缓存，返回上一级不重复请求。
- section 数据只在选中教师后请求，避免为每个结果预取。
- WeekGrid 只渲染当前方案，不因为搜索结果变化重渲染。
- 移动端 Sheet 关闭后不卸载整个工作台，保留搜索状态。
- 搜索结果中的 offered / faculty / department 信息来自 course 数据，不额外请求。

---

## 10. 测试与验收

### 10.1 单元测试

- URL query 序列化/解析：mode、keyword、faculty、department、code、prof、page。
- department 依赖 faculty 的选项过滤。
- 分页 helper：重置、加载更多、total 判断。
- 搜索请求去抖与 abort（fake timers）。

### 10.2 API 测试

- 未登录访问 catalog 返回 401。
- 课程搜索按 keyword + faculty + department 过滤。
- 教师搜索只返回与筛选课程关联的教师。
- 分页 total 正确。
- course / sections 接口调用合法 code、prof、term。
- 非法参数返回 400/422。
- rate limit 生效。

### 10.3 组件测试

- 课程模式 drill-down：搜索 → 课程 → 教师 → section → 加入。
- 教师模式 drill-down。
- 筛选变化重置分页和详情。
- 已加入、替换、冲突三种按钮状态。
- 无结果、加载中、错误、无 section。
- 移动端 Sheet 打开/关闭后状态保持。

### 10.4 手动验收

- 在 `/timetable` 完成“搜 ACCT → 选教师 → 加 section”，不离开页面。
- 切到教师模式，按 faculty/department 筛选后仍能完成加入。
- 加入后 WeekGrid、学分、冲突数立即更新。
- 刷新页面后 URL 状态可恢复搜索结果和选中详情。
- 移动端 Sheet 内可以连续加入多个 section。
- 与 P1 的悬浮预览、自动保存、409 冲突行为一致。

### 10.5 验收标准

- 工作台全流程无需跳转其他页面。
- 课程和教师双模式都能按 faculty/department 过滤。
- 所有加入动作只走 P1 provider，不产生第二套写路径。
- 搜索 API 不触碰 iOS 专用接口。
- 结果分页/加载更多可用。
- 移动端搜索不遮挡 WeekGrid 的主要操作。

---

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 模糊搜索 + 多筛选查询慢 | ILIKE/trgm 索引、分页、unstable_cache filters、只查必要列 |
| 教师筛选语义不直观 | UI 明确显示“筛选作用于教师关联课程”，提供清除按钮 |
| 工作台请求过多 | debounce、abort、按需加载 sections、内存缓存 |
| URL query 与 UI 状态不同步 | 单一 `serializePlannerQuery` / `parsePlannerQuery` helper，测试覆盖 |
| 新 RPC 与现有搜索口径不一致 | 复用 `pg_trgm` 和 `course_noporf` 字段；不修改现有 RPC |
| 移动端 Sheet 遮挡主视图 | Sheet 可关闭、加入后不强制关闭、打开时保留主视图状态 |
| P1 状态层与工作台耦合 | 工作台只调用 provider action，不直接操作 localStorage 或 API |
