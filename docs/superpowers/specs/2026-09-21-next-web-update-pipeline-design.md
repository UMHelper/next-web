# Next Web 学期更新流水线设计（umeh-update → web）

- 日期：2026-09-21
- 状态：Draft（待 review）
- 取代：`docs/update-page-plan.md`（旧草案，写于当前 `admin-auth` / 数据库变更之前）

---

## 1. 背景

`umeh-update/` 是一个本地 Python 脚本（`main.py` + `update_comment.py`），用来每学期把教务处的 Excel 时间表写进 Supabase：

- 硬编码 Supabase url / anon key、UM Open Data token
- `pandas` 读 Excel，`Thread` 每 500 行并发
- 手动注释/取消注释来执行不同任务

目标：把这些写库流程迁移到 `next-web` 的 admin 控制台里，由白名单管理员在网页上完成。

### 关键约束

部署目标是 Cloudflare Workers（OpenNext，见 `open-next.config.ts` / `wrangler.jsonc`）。Workers 的 **CPU 时间**上限最长 5 分钟，且 Serverless 函数不适合承担随数据量线性增长的循环。因此：

> **服务端只做「鉴权 + 中转」；Excel 解析、迭代、UM 调用编排、批处理全部在浏览器执行。**

数据库（Supabase/Postgres）不受此限制，可以用 SQL 函数承担「原子落库」。

---

## 2. 目标与非目标

### 本期目标（In scope）

1. 在 `/admin/update` 提供网页版更新工具，支持两种模式：
   - **流水线模式**：一键跑 3 个阶段
   - **单项模式**：6 个任务单独勾选/执行
2. 迁移这 6 个任务：

   | # | 任务（Python 名） | 作用 |
   |---|---|---|
   | 1 | `set_all_no_offerd_thread` | 重置所有 `Is_Offered` / `is_offered` 为 0 |
   | 2 | `course_no_porf_check` / `preenrollment_check` | 补齐缺失课程 + 标记 offered |
   | 3 | `set_offered` | 批量把 Excel 里的 course 标为 offered |
   | 4 | `add_time_location` | 补齐上课时间地点维表 |
   | 5 | `add_prof_course` | 补齐 `prof_with_course` |
   | 6 | `add_offer_schedule` | 写入 `offer` + `schedule` |

3. 支持两种 Excel：
   - **Add/Drop**：旧 15 列格式 + 新 16 列格式（**按表头名解析**，自动兼容）
   - **Pre-enrollment**：`*-p.xlsx`（`header=1`，另一套列）
4. 运营配置落库：current year/sem、pre-enrollment 开关、database last update（见第 5 节）。
5. 课表数据硬化：`offer` / `schedule` / `time_location` 规范化 + dedupe + 唯一索引 + 服务端按学期过滤（见第 6 节）。

### 非目标（Out of scope）

- `update_comment`：数据库已有权威的 `refresh_prof_with_course_stats()`（只统计 `replyto is null and hidden <> 1`，由 `insert_comment_and_refresh_prof_stats` RPC 调用）；Python 版统计口径与其不一致，不再迁移。
- `import_postgraduate_course`：已有 `/api/admin/sync-um` + `lib/admin/sync-um.ts`，本期不迁。
- 自动切换「当前学期」：见第 5 节，改为显式发布。
- 断点续跑（IndexedDB checkpoint）：写 RPC 幂等，失败直接重跑。
- 不改 `comment` / `vote` 的写入路径。
- 不改 `offer.course_id` / `schedule.course_id` / `time_location.date` 这些「误导性列名」（记入第 15 节，未来再议）。

---

## 3. 决策摘要

| 主题 | 决策 |
|---|---|
| 写库凭据 | **方案 C**：浏览器零凭据；服务端提供透明 PostgREST 转发，`SUPABASE_SECRET_KEY` 永不离开服务端 |
| 服务端职责 | 只做鉴权 + 一次 `fetch` 转发；无循环、无业务计算 |
| 写操作合并 | **方案 2**：批处理 + 少量原子 SQL RPC |
| 读操作合并 | lookup 进写 RPC；浏览器只保留 1 次 scoped 读（`admin_resolve_known_codes`）+ UM API 去重并发 |
| 运行模式 | 流水线（3 阶段）+ 单项（6 任务）并存，共用同一套 task 实现 |
| Excel | 按表头名解析，兼容旧 15 列 / 新 16 列 add/drop；支持 pre-enrollment |
| 运营配置 | 单行表 `app_config`，服务端 `unstable_cache` 读取，`/api/admin/app-config` 写入 |
| 学期语义 | 「目标学期」（写入 offer 用）≠「当前线上学期」（线上过滤用） |
| 跑完更新 | 只自动刷 `database_last_update`；切当前学期走显式「发布」 |
| 课表 | 保留三表结构；规范化值 + dedupe + 唯一索引 + `get_schedule_list` 服务端过滤 |

---

## 4. 架构与信任边界

```
┌──────────────────────────────────────────────────────────────┐
│ 浏览器 /admin/update（platform admin）                         │
│  ├─ SheetJS 解析 Excel（两种格式，按表头名）                    │
│  ├─ 迭代 / 去重 / 分批 / UM 并发（p-limit）                     │
│  ├─ supabase-js baseUrl = /api/admin/supabase                  │
│  └─ 进度条 / 日志 / cancel                                     │
└───────────────┬───────────────────────────┬──────────────────┘
                │ 所有 DB 读写都走中转        │ UM API 走代理
                ▼                           ▼
┌───────────────────────────┐   ┌──────────────────────────┐
│ ALL /api/admin/supabase/  │   │ GET /api/admin/um-proxy  │
│      [...path]            │   │ （隐藏 UM token）         │
│ 鉴权 + 注入 secret + 转发  │   └──────────────────────────┘
└─────────────┬─────────────┘
              ▼
      Supabase PostgREST  /rest/v1/*
      （含 RPC）
```

### 信任边界

- 浏览器**不持有**任何写库凭据。它只有 publishable key（本来就是公开的）。
- 服务端转发前**丢弃**浏览器带来的 `Authorization` / `Cookie`，改为服务端 `SUPABASE_SECRET_KEY` 走 `apikey`。
- 两个入口都要求 **platform admin**（`requireAdmin({ platformOnly: true })`），比其他 `/admin` 页面更严。

### 为什么不让服务端执行循环

- Workers CPU 上限（5 min）会被数据量线性增长打爆。
- 服务端若代跑循环，还会把每次 DB 往返都变成「浏览器 → Worker → Supabase」双跳。
- 浏览器只发出**几十次批量调用**，Worker 每次都只是「鉴权 + 转发」，CPU 几乎为 0。

---

## 5. 运营配置 `app_config`

### 5.1 表结构

```sql
create table if not exists public.app_config (
  id integer primary key default 1 check (id = 1),
  current_year integer not null,
  current_sem integer not null check (current_sem in (1, 2)),
  is_preenrollment_open boolean not null default true,
  database_last_update date,
  updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.app_config (id, current_year, current_sem, is_preenrollment_open, database_last_update)
values (1, 2026, 1, true, current_date)
on conflict (id) do nothing;
```

### 5.2 读取

`lib/config/app-config.ts`（`server-only`）：

```ts
export const getAppConfig = unstable_cache(
  async () => { /* supabaseServer.from("app_config").select(...).eq("id", 1).maybeSingle() */ },
  ["app-config"],
  { tags: [CACHE_TAGS.appConfig], revalidate: 300 },
);
```

- 加 `CACHE_TAGS.appConfig = "app-config"` 到 `lib/cache-tags.ts`。
- 读不到行时返回硬编码默认值（`2026 / 1 / true / null`），保证线上不会 500。

### 5.3 写入

`GET|POST /api/admin/app-config`：

- `GET`：返回当前配置（供客户端组件/诊断）。
- `POST`：zod 校验后 `supabaseServer.from("app_config").upsert(...)`，`revalidateTag("app-config")`，写 `admin_audit_log`（新增 action `config.update`）。
- 鉴权：platform admin。

> 这条路由很轻，不进「透明转发」路径，但同样受鉴权保护。

### 5.4 消费方改造

| 现值 | 消费方 | 改造 |
|---|---|---|
| `NEXT_PUBLIC_CURRENT_YEAR/SEM` | `lib/database/get-schedule-list.ts`、`components/search.tsx` | 服务端 `await getAppConfig()`；客户端由 `app/page.tsx` 传 props |
| `IS_PREENROLLMENT_OPEN` | `app/reviews/[code]/[...prof]/page.tsx`、`components/prof-card.tsx` | `await getAppConfig()` |
| `NEXT_PUBLIC_DATABASE_LAST_UPDATE` | `lib/sitemap-data.ts`、`components/search.tsx` | `getSitemapLastModified()` 改成 async；props |

清理：部署后从 `.env.local`、Vercel、`cloudflare-env.d.ts` 移除这 4 个变量；`lib/sitemap-data.ts` 调用方要相应 `await`。

### 5.5 两个「学期」概念

| 概念 | 含义 | 来源 |
|---|---|---|
| **目标学期** | 「落排课」写入 `offer` 的 `(year, sem)` | `/admin/update` 输入，默认=当前学期，可填下一学期 |
| **当前线上学期** | 线上 timetable/reviews 过滤显示的学期 | `app_config.current_year/sem` |

- 跑完成功：**只**更新 `database_last_update`。
- 「发布为当前学期」是单独按钮 → 改 `current_year/sem` + 清缓存。
- 这样支持「提前灌下一学期数据，但线上仍显示本学期」。

---

## 6. 课表模型评估与优化

### 6.1 现状

关系链（见 `docs/development-guide.md` §8）：

```
prof_with_course -> offer -> schedule -> time_location
```

- `offer(id, year, sem, section, course_id)`，其中 `course_id` 实际是 `prof_with_course.id`（一个「课程×老师×学期」的开课记录）。
- `time_location(id, date, times, location)`，是共享维表；`date` 实际是**星期**。
- `schedule(id, course_id, time_location_id)`，其中 `course_id` 实际是 `offer.id`。

规模（来自开发文档）：`offer` ~10083、`schedule` ~10077、`time_location` ~5593。

### 6.2 发现的问题

1. **值格式不统一**
   - `date`：seed 是 `'Mon'`，Excel/Python 是 `'TUE'`；而 `lib/timetable-events.ts` 的 `WEEK_DAY` 只认大写 `MON..FRI` → `'Mon'` 会算出 `NaN` 日期。
   - `times`：seed 是 `'09:00 - 10:15'`（带空格），Python 生成 `'13:00-14:15'`（不带）。
   - `section`：seed `'A01'`，Python 写入 Excel 里可能是数字 `1`。
2. **缺唯一约束**：`offer` / `schedule` / `time_location` 都没有唯一索引（`prof_with_course` 已有 `prof_with_course_course_prof_unique_idx`）。跑更新脚本会重复插入。
3. **查询低效**：`get_schedule_list(course_code, prof)` 返回**所有学期**，由 `lib/database/get-schedule-list.ts` 在 JS 里按 env 过滤。
4. **列名误导**：`offer.course_id` 不是课程号，`schedule.course_id` 不是课程号，`time_location.date` 不是日期。

### 6.3 决策

**保留三表结构**，只做「硬化 + 规范化」：

- 共享 `time_location` 维表是合理的（同一时段/教室被多门课复用），强行合并成宽表会造成大量冗余。
- 重命名列会波及 `get_schedule_list` / `get_offer_list_by_prof` 等 RPC 与 iOS 依赖面，收益低、风险高 → 本期不改，只加 `COMMENT ON COLUMN` 说明语义。

### 6.4 规范化规则

| 字段 | 规则 |
|---|---|
| `time_location.date` | 大写 3 字母星期：`MON..SUN`，`CHECK (date ~ '^(MON\|TUE\|WED\|THU\|FRI\|SAT\|SUN)$')` |
| `time_location.times` | 去掉空格，`HH:MM-HH:MM`，加正则 `CHECK` |
| `time_location.location` | `btrim` |
| `offer.section` | `btrim`（不强制数字，保留 `A01` 这类） |

### 6.5 `get_schedule_list` 重写

```sql
create or replace function public.get_schedule_list(
  course_code text,
  prof text,
  target_year integer,
  target_sem integer
) returns table (year integer, sem integer, section text, date text, times text, location text)
language sql
stable
security invoker
set search_path = public
as $$
  select o.year, o.sem, o.section, tl.date, tl.times, tl.location
  from public.get_offer_list_by_prof(course_code, prof) o
  join public.schedule s on s.course_id = o.id
  join public.time_location tl on tl.id = s.time_location_id
  where o.year = target_year and o.sem = target_sem
  order by o.section, tl.date, tl.times, tl.location
$$;
```

- 唯一调用方 `lib/database/get-schedule-list.ts` 改为：`await getAppConfig()` 拿当前学期 → 传给 RPC，删掉 JS 过滤。
- 该 RPC 无 `security definer`，沿用现有 `search_path` 约定。

---

## 7. 服务端表面

### 7.1 透明转发 `ALL /api/admin/supabase/[...path]`

契约：

- 鉴权：`requireAdmin({ platformOnly: true })`；未登录 401、非白名单 403。
- 允许方法：`GET / POST / PATCH / DELETE / HEAD`。
- 路径约束：
  - 必须以 `rest/v1/` 开头（`rpc` 也在其下：`rest/v1/rpc/<fn>`）
  - 拒绝包含 `://`、`..`、`%2f%2e` 等
  - 只拼到 `${NEXT_PUBLIC_SUPABASE_URL}/<path>`，禁止用户控制 host
- 转发请求头：
  - 设置 `apikey: SUPABASE_SECRET_KEY`
  - **删除** `Authorization`、`Cookie`、`x-forwarded-*`、`host`
  - 透传 `prefer`、`content-type`、`accept`、`range`、`content-profile`
- 转发响应：透传 status、`content-type`、`content-range`，去掉 `set-cookie`。
- Body 上限：2 MB（超了返回 413；浏览器据此降小 chunk）。
- 实现：一次 `fetch`，无循环。

> 若 PostgREST 只带 `apikey` 返回 401（需要验证），则回退为同时带 `Authorization: Bearer <SUPABASE_SECRET_KEY>`；但优先只发 `apikey`，因为 `sb_secret_*` 是 opaque token。

### 7.2 UM 代理 `GET /api/admin/um-proxy`

- Query：`resource`（白名单：`course_catalog/all`、`course_catalog/v1.0.0/all`、`courses/all`）+ `course_code`。
- 服务端拼 URL，带 `UM_OPEN_DATA_TOKEN`（当前是 `lib/admin/sync-um.ts` 里同一套 UM API）。
- 透传 JSON 响应；`AbortSignal.timeout(15s)`。

### 7.3 配置 `GET|POST /api/admin/app-config`

见第 5.3 节。

---

## 8. 浏览器引擎

### 8.1 文件布局

```
app/admin/update/
  page.tsx            # Server Component + platform admin 守卫
  update-client.tsx   # "use client" 主体
lib/update/
  relay-client.ts     # createClient(origin + "/api/admin/supabase", publishableKey)
  excel.ts            # 按表头名解析 add/drop + pre-enrollment
  prof-name.ts        # unidecode 包装 + " / " 拆分
  um-api.ts           # 调 /api/admin/um-proxy，去重 + p-limit
  tasks/*.ts          # 6 个任务
  pipeline.ts         # 3 阶段预置
  runner.ts           # 串行调度 / 进度 / abort / run context
  types.ts
lib/config/app-config.ts
lib/cache-tags.ts     # 加 appConfig
```

侧栏 `components/admin/admin-nav.tsx` 加一项 `Update`（platformOnly）。

### 8.2 relay client

```ts
export function createRelayClient() {
  const base = `${window.location.origin}/api/admin/supabase`;
  return createClient(base, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

之后 task 代码就是普通 supabase-js：`.from("offer").select(...)`、`.rpc("admin_apply_schedule", ...)`。

### 8.3 Excel 解析（按表头名）

不按列号，按表头文本定位；同时容忍合并单元格/空行。

**Add/Drop**（表头行 = 含 `Course Code` 的那一行）列名映射：

| 语义 | 表头 | 旧 15 列 | 新 16 列 |
|---|---|---|---|
| unit | `Offering Unit` | 0 | 0 |
| dept | `Offering Department` | 1 | 1 |
| code | `Course Code` | 2 | 2 |
| title | `Course Title` | 3 | 3 |
| section | `Section` | 4 | 4 |
| medium | `Medium of Instruction` | 6 | 6 |
| teacher | `Teacher Information` | 8 | 8 |
| day | `Day` | **10** | **11** |
| timeFrom | `Time From` | **11** | **12** |
| timeTo | `Time To` | **12** | **13** |
| location | `Classroom` | **13** | **14** |

> 旧 `main.py` 硬编码 `day=10 / from=11 / to=12 / location=13`，对新 16 列文件会错位一位（把 `Lab Information` 当日期）。按表头名解析即修复。

**Pre-enrollment**（`header=1`）：`Offering Unit / Offering Department / Course Code / Course Type / Course Title / Credit Units / ...`，只用 `unit / dept / code / title`；没有 day/time/location，因此 pre-enrollment 模式下只允许 reset / check-courses / set-offered。

**单元格归一化**：
- 时间：`"13:00"`、`"13:00:00"`、Excel serial、`Date` → 统一 `HH:MM`；两者拼成 `HH:MM-HH:MM`。
- 星期：统一大写（`Mon` → `MON`）。
- 空 / NaN → `null`，按要求 skip。

### 8.4 UM API

- 只对「`admin_resolve_known_codes` 未命中」的 code 调。
- `Map<code, course|null>` 去重（同一 code 只查一次）。
- `p-limit(6)` 并发；失败重试交给 runner。

### 8.5 run context

```ts
type RunContext = {
  mode: "add-drop" | "pre-enrollment";
  targetYear: number; targetSem: number;
  rows: ScheduleRow[];
  knownCodes: Set<string>;              // 由 admin_resolve_known_codes 得到
  umCache: Map<string, UmCourse | null>;
  onProgress(done: number, total: number, log?: string): void;
  signal: AbortSignal;
};
```

---

## 9. 任务与 RPC 契约

### 9.1 RPC 列表

全部 `security definer`、`set search_path = public`、`revoke all from public, anon, authenticated`、`grant execute to postgres, service_role`。

| RPC | 作用 |
|---|---|
| `admin_reset_offered()` | 事务内 `course_noporf.Is_Offered=0` + `prof_with_course.is_offered=0`，返回计数 |
| `admin_resolve_known_codes(codes text[])` | 返回 `codes` 中已存在于 `course_noporf` 的子集（1 次 scoped 读） |
| `admin_upsert_offered_courses(payload jsonb)` | `payload = {inserts:[完整课程行...], offered_codes:[...]}`：新课程整行插入 `Is_Offered=1`；已有课程只 `Is_Offered=1`（不覆盖其他字段） |
| `admin_mark_offered(codes text[])` | 批量 `Is_Offered=1`（单项 `set-offered` 用） |
| `admin_apply_schedule(payload jsonb, scope text)` | 原子落库 `time_location` / `prof_with_course` / `offer` / `schedule`；`scope ∈ {time_location, prof_course, offer, all}` |

`admin_apply_schedule` 的 `payload`：

```json
{
  "year": 2026,
  "sem": 1,
  "rows": [
    { "code": "ACCT1000", "prof": "CHAN Tai Man", "section": "001",
      "day": "MON", "times": "09:00-10:15", "location": "E11-101" }
  ]
}
```

内部顺序（靠唯一索引 `on conflict do nothing/update` 幂等）：

1. `time_location`：`(date, times, location)`
2. `prof_with_course`：`(course_id, prof_id)`，`on conflict do update set is_offered = 1`
3. `offer`：`(prof_with_course.id, section, year, sem)`
4. `schedule`：`(offer.id, time_location.id)`

`scope` 控制写到哪一步；`offer` / `all` 会自带前置步骤（FK 依赖 `course -> pwc -> offer -> schedule`）。返回各表 inserted/skipped 计数。

### 9.2 6 个单项任务

| 任务 | 读取 | 写入 |
|---|---|---|
| `reset-offered` | — | `admin_reset_offered()`（破坏性，二次确认） |
| `check-courses` | `admin_resolve_known_codes(codes)` | 未命中 code 走 UM 补全 → `admin_upsert_offered_courses` |
| `set-offered` | — | `admin_mark_offered(codes)` |
| `add-time-location` | — | `admin_apply_schedule(rows, 'time_location')` |
| `add-prof-course` | — | `admin_apply_schedule(rows, 'prof_course')` |
| `add-offer-schedule` | — | `admin_apply_schedule(rows, 'offer')`（用 target year/sem） |

### 9.3 3 个流水线阶段

| 阶段 | 组成 |
|---|---|
| `reset` | 任务 1 |
| `sync-courses` | 任务 2 + 3 合并（已有 code 直接标 1） |
| `apply-schedule` | 任务 4+5+6 合并成一次 `admin_apply_schedule(rows, 'all')` |

**前提 / 不变式**

- Pipeline 顺序保证 `course_noporf` 先于 `prof_with_course` 存在。
- 单项模式若课程不存在，`admin_apply_schedule` 明确报错（FK 约束）。
- `prof_info` 这 6 个任务不写（对齐 Python；`prof_with_course.prof_id` 没有到 `prof_info` 的 FK）。
- `prof_id` 在浏览器侧先 `unidecode`，与历史数据一致（DB 触发器只 `btrim`）。

---

## 10. 数据库迁移

遵循现有 `supabase/migrations/YYYYMMDD_name.sql` + grants + `notify pgrst, 'reload schema'` 风格；同步更新 `supabase/schema.sql` 快照。

### 10.1 `20260921_app_config.sql`

- 建 `app_config` 表 + 单行 seed（见 5.1）
- grants 给 `service_role`

### 10.2 `20260921_timetable_hardening.sql`

```sql
-- 1. 规范化值
update public.time_location set date = upper(btrim(date)) where date <> upper(btrim(date));
update public.time_location set times = replace(btrim(times), ' ', '') where times <> replace(btrim(times), ' ', '');
update public.time_location set location = btrim(location) where location <> btrim(location);
update public.offer set section = btrim(section) where section <> btrim(section);

-- 2. time_location dedupe（保留最小 id，改指 schedule.time_location_id）
-- 3. offer dedupe（保留最小 id，改指 schedule.course_id）
-- 4. schedule dedupe（保留最小 id）

-- 5. 唯一索引
create unique index if not exists time_location_slot_unique_idx on public.time_location (date, times, location);
create unique index if not exists offer_section_unique_idx      on public.offer (course_id, section, year, sem);
create unique index if not exists schedule_unique_idx           on public.schedule (course_id, time_location_id);

-- 6. 语义注释
comment on column public.offer.course_id          is 'references prof_with_course.id (NOT course code)';
comment on column public.schedule.course_id       is 'references offer.id (NOT course code)';
comment on column public.time_location.date       is 'weekday, uppercase MON..SUN';
```

> dedupe 用 `docs`/`20260812_prof_with_course_dedupe.sql` 同款写法（临时表 + `row_number()` + 改指 FK + 删除重复）。`prof_with_course` 的唯一索引已存在，无需重建。

> **上线前必须先在备份 / 本地 dry-run**：线上存量是否已有重复、规范化后是否产生新重复，需要通过 `SUPABASE_DB_URL` 只读确认（本次直连失败，见第 13 节）。

### 10.3 `20260921_update_rpcs.sql`

- 第 9.1 节的 5 个 RPC
- `revoke all ... from public, anon, authenticated; grant execute ... to postgres, service_role;`
- `notify pgrst, 'reload schema';`

### 10.4 `20260921_get_schedule_list.sql`

- 重写 `get_schedule_list`（4 参数版本，见 6.5）

---

## 11. 可靠性 / 并发 / 可观测性

- **推进**：阶段串行；阶段内按批调用（insert/upsert ~500 行/批，`.in()` ~200 值/批）。
- **进度**：每任务显示「阶段 + 已处理/总数 + inserted/skipped/failed」+ 最近 N 条日志。
- **取消**：`AbortController`；在飞行的 RPC 跑完（原子），不再发下一批。写 RPC 幂等，重跑安全。
- **错误**：网络/5xx 指数退避重试（1s/2s/4s，最多 3 次）；4xx 立即失败并带行上下文；任务失败 → 停流水线并标出卡点。
- **并发**：UM `p-limit(6)`；DB 批处理串行。
- **幂等**：唯一索引 + `on conflict`；`reset` 可重复跑；`check-courses` 是 upsert。
- **约束**：tab 需保持打开；不做断点续跑；UI 明确提示。
- **Relay 限制**：body 上限 2 MB；run 总调用量约十几次。

---

## 12. 测试策略

vitest（不连真库）：

1. `tests/update/excel.test.ts`：旧 15 列 / 新 16 列 add/drop / pre-enrollment；表头名定位；NaN/空；时间归一化（字符串 / serial / Date）。
2. `tests/update/prof-name.test.ts`：`unidecode` + `" / "` 拆分与 Python 对齐。
3. `tests/update/task-payloads.test.ts`：rows → `admin_upsert_offered_courses` / `admin_apply_schedule` payload；去重；target year/sem 注入。
4. `tests/api/admin-supabase-relay.test.ts`：路径白名单、拒绝绝对 URL、方法白名单、剥离 `Authorization`、body 上限。
5. `tests/update/app-config.test.ts`：缓存 tag、默认值回退。
6. `tests/database/update-rpcs-sql.test.ts`：迁移里函数/唯一索引/grants 断言（仿 `tests/database/popular-courses-sql.test.ts`）。
7. `tests/database/app-config-sql.test.ts`：表结构 + seed + grants。

手工验收（写进 `docs/`，不进 CI）：

- 本地 apply migrations → 用 `supabase/seed.sql` 跑单项 + 流水线
- SQL 校验计数与终态；再跑一次断言幂等（inserted=0）

---

## 13. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 加唯一索引时存量有重复 | 迁移里先规范化 + dedupe（保留最小 id、改指 FK）；上线前备份 + 本地 dry-run |
| 直连 Supabase Postgres 失败（本机 TCP 不通，只有 HTTP 代理） | 通过 `scripts/apply-sql.mjs` + `SUPABASE_DB_URL` 在能连的环境执行；或临时走代理。本 spec 的 dedupe 依赖上线前确认 |
| Worker 上 `apikey` only 是否够（PostgREST 鉴权） | 上线前 curl 验证；不行则回退 `Authorization: Bearer` |
| 透明转发是强大写入口 | platform admin + 路径白名单 + body 上限 + 记录审计 |
| Excel 表头/合并单元格边界 | 单元测试覆盖；UI 显示解析预览（行数 + 前几行） |
| `get_schedule_list` 签名变更 | 仓库内只有 `lib/database/get-schedule-list.ts` 一个调用方；iOS 走 Next API，不直接调 RPC |
| 时区/星期归一化 | 统一大写 `MON..SUN`，修掉 `'Mon'` → `NaN` 的隐患 |

---

## 14. 验收标准

1. `/admin/update` 只对 platform admin 可见；非白名单 404。
2. 上传 `26-27-1.xlsx` 能正确解析 `Day/Time From/Time To/Classroom`（验证不再错位），行数与预期一致。
3. 流水线能对本地/测试库跑完，终态与 Python 版一致（`Is_Offered`、`is_offered`、`offer`、`schedule`、`time_location`、`prof_with_course`）。
4. 同一份 Excel 连跑两次：第二次 `inserted = 0`（幂等）。
5. 浏览器 Network 面板里**没有任何 Supabase host 请求**，只有 `/api/admin/supabase/*` 与 `/api/admin/um-proxy`。
6. `app_config` 改动后，`search`、`sitemap`、reviews / prof-card、timetable 过滤立即体现。
7. `get_schedule_list` 只返回目标学期，不再拉全表到 JS 过滤。
8. 唯一索引存在，且重复写入不会产生重复行。

---

## 15. 后续可选项（本期不做）

- 重命名误导性列：`offer.course_id` → `prof_course_id`、`schedule.course_id` → `offer_id`、`time_location.date` → `weekday`（需同步 RPC + 客户端）。
- `offer` / `schedule` 引入 `term` 外键表，替代裸 `(year, sem)`。
- 把 `update_comment` 改成调用 `refresh_prof_with_course_stats` 的批量备份/修复工具。
- 用 `/admin/sync-um` 覆盖 `import_postgraduate_course`。
