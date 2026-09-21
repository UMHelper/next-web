# Next Web 课表方案核心与悬浮预览设计（P1）

- 日期：2026-09-21
- 状态：Draft（待 review）
- 依赖：无
- 后续：P2 分享与比较、P3 完整工作台

---

## 1. 背景

现有 Timetable 交互把“已选 section 集合”和“周视图数据源”都放在 localStorage 的 `timetableCart` 中：

- `components/timetable-card.tsx` 负责加入；
- `components/timetable-cart.tsx` 负责列表、删除、清空；
- `app/timetable/page.tsx` 用 `'none'` 占位判断初始化；
- `components/navbar-list.tsx` 用 badge 显示数量。

这条链路存在几个核心问题：

1. **没有领域模型**：cart 项只是展开的 section 对象，没有稳定唯一键、term、revision。
2. **状态源重复**：多个组件各自维护 `useLocalStorage + useState + useEffect`。
3. **首屏闪烁**：`timetableCart` 初始为 `['none']`，先显示假的 “Generateing your timetable...”。
4. **入口太深**：只能在 review 页的 Popover 里加入课表，加入后没有全局反馈。
5. **冲突不可见**：同课程多 section、时间冲突都没有提示。
6. **没有跨页预览**：用户选课时必须在 review 页和 `/timetable` 之间来回跳。

P1 的目标是把 cart 重构为真正的 **TimetablePlan**，增加全局悬浮预览，并让 `/timetable` 成为方案管理页。

---

## 2. 目标与非目标

### 2.1 本期目标（In scope）

1. 引入 `TimetablePlan` / `PlanSection` 领域模型，替换旧 `timetableCart`。
2. 方案持久化到 Supabase，通过 Clerk 登录用户拥有多个命名方案。
3. 新增服务端 plans API、payload zod 校验和 RLS 防线。
4. 客户端 `TimetablePlannerProvider`：本地缓存、自动保存、离线 outbox、基础冲突处理。
5. 新 `WeekGrid` 组件，支持 `/timetable` 主视图和悬浮预览 compact 模式。
6. 桌面/移动端 `FloatingPlanner`：在 review / course / search 页悬浮显示当前课表。
7. `/timetable` 基础版：方案选择、新建、重命名、删除、section 列表、周视图、清空确认。
8. 旧 `timetableCart` 自动迁移为默认方案，避免用户数据丢失。
9. Review 页 Add to Timetable：同 section 去重、同课程不同 section 替换、时间冲突标红。

### 2.2 非目标（Out of scope）

- 分享链接、`/compare`、共同空闲高亮和 15 秒轮询（见 P2）。
- 内嵌课程搜索、教师/faculty/department 筛选（见 P3）。
- WebSocket / Realtime 推送；P1 只做 HTTP 自动保存。
- 拖拽调整课表、导出图片、多方案同时比较。
- 修改 `get_schedule_list`、`offer` / `schedule` 原始数据表结构。
- 删除 `@aldabil/react-scheduler` 依赖；等新 WeekGrid 稳定后单独 cleanup。

---

## 3. 决策摘要

| 主题 | 决策 |
|---|---|
| 方案所有权 | 必须 Clerk 登录，方案属于 `owner_clerk_id` |
| 方案归属 | 一个方案固定属于一个 `year + sem` |
| 数据存储 | `timetable_plan` 单表 + `payload jsonb`，不拆 section 表 |
| Section 身份 | 规范化 `courseCode|prof|section` 作为 `key` |
| 客户端状态 | 全局 `TimetablePlannerProvider`，单一 localStorage store |
| 保存策略 | 本地立即更新 + 800ms debounce 自动保存 + 离线 outbox |
| 冲突策略 | 乐观并发；409 后用户二选一，不做字段级合并 |
| 周视图 | 新 `WeekGrid`；P1 由 `/timetable` 和 FloatingPlanner 共用 |
| 悬浮层 | 桌面 fixed 右侧边栏，移动端底部 Sheet |
| 旧数据 | 首次登录自动导入 `timetableCart`，成功后删除旧 key |

---

## 4. 领域模型

### 4.1 TimetablePlan

```ts
type TimetablePlan = {
  id: number;                 // 服务端 identity id
  clientRef: string;          // 客户端 uuid，幂等键
  ownerClerkId: string;
  name: string;
  year: number;
  sem: number;
  payload: TimetablePlanPayload;
  schemaVersion: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
```

### 4.2 PlanSection

```ts
type PlanSection = {
  key: string;                // courseCode|prof|section
  courseCode: string;
  courseTitle?: string;
  prof: string;
  section: string;
  credits?: number;
  color: string;              // 由 key 确定性生成
  schedules: Array<{
    date: "MON" | "TUE" | "WED" | "THU" | "FRI";
    time: string;             // HH:mm-HH:mm
    location?: string;
  }>;
};
```

规范化规则：

- `courseCode`：trim + 转大写。
- `prof`：trim + 连续空格压成一个；比较/生成 key 时转大写。
- `section`：trim + 转大写。
- `key`：`${courseCode}|${normalizedProf}|${normalizedSection}`。
- 同一 payload 内 `key` 必须唯一。
- `color`：对 `key` 做稳定 hash，生成 HSL/hex；禁止使用 `Math.random()`。
- `date`：只允许 `MON`–`FRI`，非法 schedule 在加入时丢弃并提示。
- `time`：去空格，校验 `^\d{2}:\d{2}-\d{2}:\d{2}$`；结束时间必须晚于开始时间。

### 4.3 payload schema

```ts
type TimetablePlanPayload = {
  schemaVersion: 1;
  sections: PlanSection[];
};
```

限制：

- 每个方案最多 30 个 section。
- 每个 section 最多 20 个 schedule。
- 序列化后 payload 最大 64 KiB。
- 超出限制返回 `413` / `422`，不写库。

---

## 5. 数据库

### 5.1 表结构

```sql
create table public.timetable_plan (
  id bigint generated always as identity primary key,
  client_ref uuid not null,
  owner_clerk_id text not null,
  name text not null,
  year integer not null,
  sem integer not null,
  payload jsonb not null default '{"schemaVersion":1,"sections":[]}'::jsonb,
  schema_version integer not null default 1,
  revision integer not null default 1,
  share_token text,
  share_token_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint timetable_plan_owner_client_ref_key unique (owner_clerk_id, client_ref),
  constraint timetable_plan_share_token_key unique (share_token),
  constraint timetable_plan_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint timetable_plan_term_check check (year between 2000 and 2100 and sem between 1 and 3)
);

create index timetable_plan_owner_term_updated_idx
  on public.timetable_plan (owner_clerk_id, year, sem, updated_at desc);
```

说明：

- 用 `bigint identity` 主键，避免随机 UUID 主键碎片。
- 用客户端生成的 `client_ref uuid` 支持离线创建和重试幂等。
- `share_token` / `share_token_created_at` 在 P1 先建好，P2 使用；P1 不写。
- `payload` 整体 `jsonb` 更新；方案规模小，不需要 section 拆表。
- `updated_at` 由 API 在成功写入时显式设为 `now()`。

### 5.2 RLS 与权限

```sql
alter table public.timetable_plan enable row level security;
revoke all on public.timetable_plan from anon, authenticated;
grant all on public.timetable_plan to service_role;
grant usage, select on sequence public.timetable_plan_id_seq to service_role;
```

- `public` schema 可能暴露给 Data API；启用 RLS 且不给 `anon` / `authenticated` 策略。
- 浏览器不直连 Supabase；所有读写都走 Next API Route + `supabaseAdmin`。
- 服务端每个 owner 操作都必须校验 `owner_clerk_id === Clerk userId`。

### 5.3 旧 `timetableCart` 迁移

首次登录且本地 store 为空时：

1. 读取 localStorage `timetableCart`。
2. 清洗为 `PlanSection[]`：
   - 补 `key`、规范化 `date` / `time`。
   - 同 `key` 去重。
   - 缺少 `courseTitle` / `credits` 时保持可选字段为空。
   - 旧随机 `color` 不保留，改为确定性颜色。
3. 用当前线上学期创建默认方案 “我的课表”。
4. 成功写入本地 store 后删除旧 `timetableCart`。
5. 加 `importedLegacyCart: true` 标记，避免重复导入。

如果旧 cart 为空或没有合法 section，则不创建空方案，只清标记。

---

## 6. API

所有 `/api/timetable/*` 默认 `dynamic = "force-dynamic"`，响应带 `Cache-Control: private, no-store`。

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| `GET` | `/api/timetable/plans?year=&sem=` | Clerk 登录 | 返回当前用户方案列表，含 payload |
| `POST` | `/api/timetable/plans` | Clerk 登录 | 按 owner + clientRef 幂等创建 |
| `GET` | `/api/timetable/plans/[id]` | 仅 owner | 读取单个方案 |
| `PATCH` | `/api/timetable/plans/[id]` | 仅 owner | 更新 name / payload，`revision + 1` |
| `DELETE` | `/api/timetable/plans/[id]` | 仅 owner | 删除方案 |

### 6.1 请求/响应约束

- 使用 `readJsonBody` 限制 body 大小，避免大 payload 打爆 Worker。
- zod schema 校验 `name`、`year`、`sem`、`clientRef`、`payload`。
- `POST` 若 `(owner_clerk_id, client_ref)` 已存在，返回已有方案（200），不重复插入。
- `PATCH` body：

```ts
{
  baseRevision: number;
  name?: string;
  payload?: TimetablePlanPayload;
}
```

- `PATCH` 成功返回最新完整方案。
- `PATCH` revision 不一致返回 `409` + `{ current: Plan }`。
- `DELETE` 返回 `{ ok: true }`；P2 生效后删除方案即让分享链接失效。

### 6.2 错误码

| 状态码 | 含义 |
|---|---|
| `400` | 参数不合法 |
| `401` | 未登录 |
| `404` | 方案不存在，或不属于当前用户 |
| `409` | revision 冲突 |
| `413` | payload 过大 |
| `422` | zod 校验失败 |
| `429` | 写频率过高 |
| `500` | 服务端异常 |

不向客户端返回 Supabase 原始错误；记录日志后返回统一 `apiError`。

---

## 7. 客户端状态与同步

### 7.1 单一 store

`TimetablePlannerProvider` 挂在 root layout，按 Clerk 用户隔离：

```text
timetable:store:v1:<clerkUserId>
{
  schemaVersion: 1,
  plans: { [clientRef]: LocalPlan },
  activePlanByTerm: { "2026:1": clientRef },
  outbox: Mutation[],
  importedLegacyCart?: true
}
```

`LocalPlan` 包含服务端 `id`、`revision` 和最近一次同步错误。

### 7.2 读取路径

1. 挂载时先从 localStorage 同步恢复，UI 立即可用，不再有 `'none'` loading hack。
2. Clerk 用户加载后 `GET /api/timetable/plans`，按 term 合并：
   - 没有 pending mutation 的方案：服务端版本覆盖本地。
   - 有 pending mutation 的方案：保留本地，稍后走冲突/重试逻辑。
3. 没有激活方案时，按 `updated_at` 选择最近方案；没有方案才显示空状态。

### 7.3 写入路径

- 所有 UI 编辑先改 reducer + localStorage，立即反馈。
- 同一方案 800ms debounce；连续编辑合并为一个 mutation，保留最早的 `baseRevision`。
- Mutation 类型：
  - `create_plan`
  - `update_plan`
  - `delete_plan`
- outbox 按计划串行 flush；同一方案的 create 必须先于 update/delete。
- `navigator.onLine` / `online` 事件 / 窗口重新聚焦时触发 flush。
- 成功后回写服务端 `id`、`revision`、`updatedAt`；失败指数退避，最多保留错误状态不丢失 edit。

### 7.4 409 冲突处理

- `409` 时把该方案设为 `conflict`，暂停其自动同步。
- UI 弹二选一：
  1. **保留本地**：读取服务端最新 revision，再用本地 payload 发一次 PATCH。
  2. **载入服务端**：丢弃该方案 outbox，用服务端版本替换本地。
- 不做字段级合并；这是有意为之的 v1 限制。

---

## 8. UI 与交互

### 8.1 FloatingPlanner

- 挂在 root layout，`/timetable` 和未来 `/compare` 自动隐藏。
- 桌面端：右侧 fixed 悬浮按钮，默认收起；展开为约 400px 的 compact WeekGrid + 方案摘要。
- 移动端：底部悬浮条显示“N 门课 · X 学分 · Y 冲突”；点击上拉 Sheet。
- review 页加入成功：badge 脉冲/高亮，不强制展开遮挡内容。
- 状态：无方案、空方案、保存中、已保存、离线、同步失败、冲突。
- 键盘 `Esc` 收起；按钮提供 `aria-label` / `aria-expanded`。

### 8.2 WeekGrid

- 周一至周五 × 08:00–20:00，30 分钟一行。
- 事件按分钟计算 top/height，绝对定位到对应日期列。
- 事件点击跳转 `/reviews/[code]/[prof]`。
- 同一天重叠事件缩窄/偏移，并加红色冲突边框。
- `compact` 模式隐藏地点等次要信息，只保留课程码 + section。
- 移动端横向滚动，不压缩到不可读。

### 8.3 `/timetable`

- 顶部：方案选择器、重命名、新建、删除、term、学分、冲突数。
- 主体：section 列表 + 完整 WeekGrid。
- 空状态：引导去现有搜索页浏览课程。
- Section 操作：删除、冲突提示；同课程不同 section 用替换。
- 清空方案需要确认或可撤销。
- P1 不内嵌课程搜索，搜索入口仍跳现有页面。

### 8.4 Review 页加入流程

- 保留现有 Timetable Popover，按钮改为 “Add to Timetable”。
- 默认加入当前激活方案；如果用户有多个方案，提供目标方案选择。
- 加入前检查：
  1. 同一 `key` 已存在：提示已加入，不重复。
  2. 同 `courseCode` 不同 section：弹替换确认。
  3. 与其他 section 时间冲突：允许加入，但标红并提示。
- 加入成功后 toast + FloatingPlanner 立即更新。
- 未登录用户点击加入时引导 Clerk 登录并回到当前页。

### 8.5 冲突检测

- 客户端 helper `detectScheduleConflicts(sections)`：
  - 按 `date` 分组；
  - 将 `HH:mm` 转为分钟；
  - 半开区间 `[start, end)` 判断重叠；
  - 返回冲突 pair 和涉及 section。
- 冲突只作为 UI 状态；P1 不阻止用户保存冲突方案。

---

## 9. 测试与验收

### 9.1 单元测试

- `lib/timetable/schema.ts`：
  - `normalizeSchedule` 处理大小写日期、带空格 time、非法时间。
  - `makeSectionKey` 稳定。
  - `planPayloadSchema` 拒绝重复 key、超限 payload。
- `lib/timetable/conflicts.ts`：
  - 同一天重叠、相邻不重叠、多 schedule section、跨日期不误报。
- `lib/timetable/migrate.ts`：
  - 旧 cart 映射、去重、缺失字段、重复导入保护。
- `lib/timetable/outbox.ts`：
  - 同方案 edit 合并、create 先于 update、失败退避。

### 9.2 API 测试

用现有 vitest mock 方式覆盖：

- 未登录返回 401。
- 非 owner 读取/更新/删除返回 404。
- `POST` 相同 `clientRef` 幂等。
- `PATCH` 正常递增 revision。
- `PATCH` revision 不一致返回 409。
- payload 超限返回 413/422。

### 9.3 组件测试

- `FloatingPlanner`：无方案、空方案、有冲突、保存中、离线状态。
- `AddToTimetable`：重复、替换、冲突、未登录。
- `WeekGrid`：事件定位、重叠、compact。

### 9.4 手动验收

- 旧 `timetableCart` 首次登录成功导入，且不再显示旧 cart。
- 任意页面加入课程后，FloatingPlanner 即时更新。
- 刷新页面后方案仍在；离线编辑后恢复网络能同步。
- 409 时用户能看到选择框，不会静默丢数据。
- 移动端底部 Sheet 不遮挡主要操作。
- 不出现 “Generateing your timetable...”。

### 9.5 验收标准

- 不再有组件直接读取 `'timetableCart'` 作为状态源。
- 每个方案内 `key` 唯一；同课程不同 section 不会同时存在。
- owner API 全部通过 Clerk 归属校验。
- `payload` 与 name 限制生效。
- `/timetable` 与 FloatingPlanner 共用同一份数据，不产生第二套状态。

---

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 旧 cart 数据格式脏 | 迁移 helper 容错，非法 schedule 丢弃并提示 |
| 自动保存覆盖另一台设备修改 | revision + 409 二选一，不静默覆盖 |
| FloatingPlanner 遮挡页面内容 | 默认收起、不做自动弹出、移动端用可关闭 Sheet |
| WeekGrid 重叠布局复杂 | P1 只做缩窄/偏移 + 冲突边框，不做完美 calendar pack |
| `/timetable` 和 review 页状态不同步 | 只允许一个 provider 写 store，其他组件只消费 |
| Worker body 限制 | P1 用 64 KiB payload 上限和服务端 zod 校验 |
