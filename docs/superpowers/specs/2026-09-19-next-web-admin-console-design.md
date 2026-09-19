# next-web 管理后台设计（Admin Console）

> 状态：Draft，等待人工 review
> 日期：2026-09-19
> 前置：Phase 1A/1B/2/3 已上线（部分 Phase 4 本地）
> 后续计划：待 review 后生成

---

## 1. 背景

当前项目已经有：

- Clerk Web 登录 + `authMiddleware`
- 所有服务端数据库访问走 `SUPABASE_SECRET_KEY`
- 评论 `hidden` 字段、`prof_with_course` 聚合统计
- `POST /api/report` 举报接口（目前只推 Telegram）
- UM 数据同步脚本 `scripts/sync-um.mjs`

但缺少一个统一的管理入口。需要新增一个后台，支持：

1. 举报管理：举报入库、查看、筛选、标记状态
2. 评论管理：搜索、编辑文本/图片、隐藏/恢复
3. 课程/教师数据维护：查看、编辑已有字段、触发 UM 同步
4. Admin 授权：platform admin 可以授予/取消其他用户 admin

## 2. 目标与非目标

### 2.1 目标

- **G1**：新增 `/admin` 管理后台，所有页面服务端鉴权。
- **G2**：`PLATFORM_ADMIN_USER_IDS` / `PLATFORM_ADMIN_EMAILS` 环境变量注入 platform admin；可授予/取消 DB 中的 admin，授权支持 Clerk userId 或 email。
- **G3**：举报写入数据库，Telegram 作为 best-effort 通知。
- **G4**：评论可编辑文本/图片，可隐藏/恢复；隐藏状态变化后重算统计。
- **G5**：课程/教师数据可查看、搜索、编辑现有字段，并可触发 UM 同步；教授-课程映射的 `admin_note` / `admin_note_en`（课程提示 notes）是编辑重点。
- **G6**：所有管理写操作写审计日志。
- **G7**：管理 API 统一 `requireAdmin()` + zod 校验 + 错误响应。

### 2.2 非目标

- **N1**：不做完整用户管理、复杂 RBAC、细粒度权限。
- **N2**：不硬删除评论（v1 只 hidden/restore；如后续需要 platform admin 硬删除，单独 spec）。
- **N3**：不新增/删除课程、教师映射。
- **N4**：不改造现有 iOS API 响应。
- **N5**：不做实时通知/WebSocket。
- **N6**：不替换 Supabase Studio；这是业务管理后台。

## 3. 角色与权限

### Platform admin

来源：

```env
PLATFORM_ADMIN_USER_IDS=user_xxx,user_yyy
PLATFORM_ADMIN_EMAILS=admin@example.com,owner@example.com
```

- 永远有权限
- 可以访问全部 `/admin/**`
- 可以授予/取消其他 admin
- 不能在后台里被取消

### Admin

来源：`admin_users` 表。

- 可以管理举报、评论、课程/教师数据
- 不能访问 `/admin/admins` 的写操作
- 不能授予/取消其他 admin

### 权限检查

新增 `lib/admin-auth.ts`：

```ts
export async function getCurrentAdmin(): Promise<
  { ok: true; userId: string; isPlatformAdmin: boolean }
  | { ok: false; response: NextResponse }
>

export async function requireAdmin(
  request: Request,
  options?: { platformOnly?: boolean },
): Promise<{ userId: string; isPlatformAdmin: boolean } | NextResponse>
```

规则：

- `auth().userId` 不存在 → 401
- userId 在 `PLATFORM_ADMIN_USER_IDS` 中 → platform admin
- Clerk 用户的主 email 在 `PLATFORM_ADMIN_EMAILS` 中 → platform admin
- userId 在 `admin_users` 且 `active = true` → admin
- 其他 → 403
- `platformOnly` 时非 platform admin → 403

## 4. 数据模型

新增 migration：`supabase/migrations/20260919_admin_console.sql`

### 4.1 `admin_users`

```sql
create table public.admin_users (
  clerk_user_id text primary key,
  role text not null default 'admin' check (role in ('admin')),
  granted_by text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- 只有 platform admin 能写。
- 保留 `role` 字段，未来可扩 `moderator` / `data_editor`。

### 4.2 `reports`

```sql
create table public.reports (
  id bigint generated always as identity primary key,
  target_type text not null default 'comment',
  target_id bigint not null,
  course_id text,
  prof_id text,
  reporter_id text,
  reporter_platform text not null,
  reason text not null,
  details text,
  email text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  admin_note text,
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
```

索引：

```sql
create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_target_idx on public.reports (target_type, target_id);
```

### 4.3 `admin_audit_log`

```sql
create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
```

- `before` / `after` 不存敏感字段（不存 email、Clerk session）。
- 审计日志只读，不提供删除。

### 4.4 RLS / 权限

- 三张表 `enable row level security`
- `revoke all from public, anon, authenticated`
- 只 grant `service_role`
- 不新增 anon/authenticated policy

## 5. API 设计（`/api/admin/*`）

所有接口：

- `requireAdmin()` 校验
- zod 校验 body
- 返回统一 `{ error: { code, message, details? } }`
- 写操作 `writeAuditLog(...)`

### 5.1 举报

- `GET /api/admin/reports?status=open&page=1&limit=20`
  - 返回 reports 列表 + total
- `PATCH /api/admin/reports/[id]`
  - body：`{ status?: "open"|"resolved"|"dismissed", admin_note?: string }`
  - 设置 `resolved_by`、`resolved_at`
  - 审计日志

### 5.2 评论

- `GET /api/admin/comments?code=&prof=&hidden=&q=&page=`
  - 搜索 `content`，按 course_id / hidden 过滤
  - join `prof_with_course` 得到课程代码/教师名
- `PATCH /api/admin/comments/[id]`
  - body 白名单：`content`、`content_en`、`img`、`hidden`
  - 只允许文本/图片/隐藏状态
  - 如果 `hidden` 从 0→1 或 1→0，且该评论是顶层评论（`replyto is null`），调用 `refresh_prof_with_course_stats(course_id)`
  - 审计 before/after
- 不提供 `DELETE`

### 5.3 课程 / 教师

- `GET /api/admin/courses?q=&page=`
- `PATCH /api/admin/courses/[code]`
  - 白名单字段：
    - `courseTitleEng`
    - `courseTitleChi`
    - `Credits`
    - `Course_Duration`
    - `Medium_of_Instruction`
    - `Is_Offered`
    - `offeringProgLevel`
    - `courseType`
    - `suggestedYearOfStudy`
    - `gradingSystem`
    - `courseDescription`
    - `ilo`
  - 不修改主键/外键/旧代码。
- `GET /api/admin/prof-with-course?q=&page=`
  - 返回 `admin_note` / `admin_note_en`，供前端 notes 编辑表格展示。
- `PATCH /api/admin/prof-with-course/[id]`
  - 白名单：`is_offered`、`admin_note`、`admin_note_en`
  - `admin_note` / `admin_note_en` 允许清空为 `null`；编辑 notes 是本页面的优先能力。
  - 聚合字段只读
  - 不新增/删除映射
- `POST /api/admin/sync-um`
  - body：`{ mode: "missing"|"all"|"code", code?: string, limit?: number }`
  - `limit` 限制 1-50
  - 返回本次 scanned/updated/created/not_found/failed 统计
  - 长时间全量同步仍由 GitHub Actions 负责

### 5.4 Admin 管理

- `GET /api/admin/admins`
  - platform admin 才可访问
  - 返回 platform env admin（userId + email）+ DB admin 列表（含 Clerk email）
- `POST /api/admin/admins`
  - body：`{ clerk_user_id: string }`，字段可传 Clerk userId 或 email
  - 只有 platform admin
  - 先调用 Clerk backend 按 userId / email 校验用户存在并解析 userId
  - upsert `admin_users(active=true)`
  - 审计（记录原始 identifier、解析后的 userId、email）
- `DELETE /api/admin/admins/[userId]`
  - 只有 platform admin
  - platform env admin 不可取消
  - 设置 `active=false`
  - 审计

## 6. UI 设计

路由：

```text
/admin
/admin/reports
/admin/comments
/admin/courses
/admin/notes
/admin/admins
```

技术：

- 页面是 Server Component
- `/admin/layout.tsx` 调用 `requireAdmin()`，无权限 `notFound()` 或跳转
- 数据读取在 Server Component 中用 `supabaseAdmin`
- 写操作用客户端组件 fetch `/api/admin/*`
- 表格使用普通 HTML table + 现有 Button/Input/Dialog/Select
- 不做移动端专门优化，保证桌面可用
- 前台导航入口：Navbar 中的客户端组件在登录后请求 `/api/admin/me`，仅管理员显示 `/admin` 图标入口；API 由 `requireAdmin()` 保护
- `/admin` tab 使用客户端 `usePathname()` 高亮当前页面
- 表格尽量完整展示已返回字段，并保留横向滚动
- 后台前端不显示 Clerk userId：管理员头显示角色，管理员列表/审计日志显示 email；userId 只在 API 内部使用
- reports / comments / courses / notes / admins 表格支持滑到底部自动加载更多

### 页面内容

- `/admin`：dashboard
  - open reports 数量
  - hidden comments 数量
  - 最近审计日志：显示 Admin email、Action、Target 和字段级变更摘要（before → after）
- `/admin/reports`：
  - 状态筛选
  - 列表：id / target type / course / prof / reason / details / reporter email / status / time / resolved / note
  - 滚动到底部自动加载下一页
  - 点击查看详情、admin note、resolve/dismiss
- `/admin/comments`：
  - 筛选：course code / prof / hidden / keyword
  - 列表：id / course+prof / 顶层或回复 / 中英文内容 / image / votes / verify / hidden / time
  - 滚动到底部自动加载下一页
  - 编辑弹窗：content、content_en、img、hidden
- `/admin/courses`：
  - 搜索课程
  - 编辑课程字段（title、credits、duration、unit/dept、medium、level/type/year、grading、description、ILO）
  - 课程列表滚动到底部自动加载下一页
  - “Sync UM” 按钮，调用 `/api/admin/sync-um`
- `/admin/notes`：
  - 独立管理 Professor mappings / course notes
  - 搜索 course code / professor
  - 展示并优先编辑 `admin_note`（中文）和 `admin_note_en`（英文），notes 可清空
  - 滚动到底部自动加载下一页
  - 保留 mapping `is_offered` 切换
- `/admin/admins`：
  - 列出 platform admins 和 DB admins 的 email，不展示 Clerk userId
  - 输入 email 或 Clerk user ID 授权
  - DB admin 列表滚动加载
  - 取消 DB admin

## 7. 举报接口改造

`app/api/report/route.ts`：

1. 校验身份（Web Clerk / iOS HMAC）
2. 限流
3. 查看 comment/prof 目标
4. **先写入 `reports` 表**
5. 再尝试 `sendTelegramMessage`
6. Telegram 失败：
   - 已入库，仍返回 200
   - 响应可带 `{ ok: true, telegram: "failed" }`
7. 写报告成功即表示举报已被记录

这样 Telegram 故障不会丢举报，管理后台也能看到全部举报。

## 8. 审计日志

所有管理写操作调用：

```ts
await writeAuditLog({
  actorId,
  action: "report.resolve" | "comment.update" | "comment.hide" | "course.update" | "prof.update" | "admin.grant" | "admin.revoke" | "sync.um",
  targetType,
  targetId,
  before,
  after,
});
```

审计写入失败：

- 核心操作已成功时，审计失败只记录 `console.error`，不返回 500
- 但 spec 要求审计失败也写入 Wrangler 日志方便排查

## 9. 测试策略

### 单元测试

- `tests/admin-auth.test.ts`
  - env platform admin by userId
  - env platform admin by email
  - DB admin
  - 普通用户 403
  - 无 userId 401
- `tests/validation/admin.test.ts`
  - 评论编辑 schema
  - 课程编辑 schema
  - professor-course notes schema（`admin_note` / `admin_note_en`）
  - report status schema
  - admin grant schema（userId / email）

### API route tests

- `tests/api/admin/reports.test.ts`
- `tests/api/admin/prof-with-course.test.ts`（notes 更新 + 审计）
- `tests/api/admin/me.test.ts`（前台入口检测）
- `tests/api/admin/comments.test.ts`
- `tests/api/admin/courses.test.ts`
- `tests/api/admin/admins.test.ts`
- mock `supabaseAdmin`、`auth`、`writeAuditLog`
- 覆盖：401/403、非法字段、成功路径、审计调用

### 举报入库测试

- 扩展 `tests/api/report.test.ts`
  - web 举报成功后 `reports.insert` 被调用
  - Telegram 抛错仍返回 200

### SQL 验证

- 扩展 `scripts/verify-security-hardening.sql` 或新增 `scripts/verify-admin-tables.sql`
  - 三张表存在
  - RLS enabled
  - anon/authenticated 无权限

### 手动 smoke

- platform admin 访问 `/admin`，且登录后 Navbar 出现 Admin 图标入口
- 普通 admin 看不到 admin 管理
- 普通用户访问 `/admin` 被拒，且 Navbar 不出现 Admin 图标入口
- platform admin 可通过 userId 或 email 授权/取消 DB admin
- 后台前端不显示 Clerk userId
- 举报后 Telegram 收到 + 后台能看到
- 评论编辑文本/图片、隐藏/恢复生效
- 课程字段编辑 + sync 按钮可用；Professor mappings / course notes 在独立页面编辑并同步到评论页提示
- admin tab 高亮当前页面；表格字段齐全且可横向滚动
- reports / comments / courses / notes / admins 滑到底部会自动加载更多
- 最近审计日志会显示字段级变更摘要

## 10. 发布顺序

1. 新增 `PLATFORM_ADMIN_USER_IDS` / `PLATFORM_ADMIN_EMAILS` 到 `.env.example` / Cloudflare env
2. 执行 `20260919_admin_console.sql`
3. 部署代码
4. 用 env 里的 platform admin 登录 `/admin`
5. 授权一个测试 admin
6. 验证举报入库和评论管理

## 11. 验收标准

- **AC1**：`PLATFORM_ADMIN_USER_IDS` 或 `PLATFORM_ADMIN_EMAILS` 中的用户可访问全部 `/admin/**`。
- **AC2**：普通用户访问 `/admin/**` 返回 403 / notFound。
- **AC3**：platform admin 可通过 userId 或 email 授予/取消 DB admin；普通 admin 不行。
- **AC4**：举报写入 `reports` 表，Telegram 失败不丢数据。
- **AC5**：评论文本/图片可编辑；隐藏/恢复后统计更新。
- **AC6**：课程字段可编辑；`/admin/notes` 中 `is_offered` 和 `admin_note` / `admin_note_en` notes 可编辑，notes 在评论页提示生效；sync 按钮可用。
- **AC7**：所有管理写操作有审计日志。
- **AC8**：`npm run test` / `lint` / `tsc` / `build` 通过。
- **AC9**：migration dry-run + apply SQL 验证通过。
- **AC10**：管理员登录后 Navbar 显示 `/admin` 图标入口；非管理员不显示；admin tab 高亮当前页面。
- **AC11**：后台前端不展示 Clerk userId；reports / comments / courses / notes / admins 滑到底部自动加载更多。
- **AC12**：最近审计日志显示字段级变更摘要。

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 管理后台误操作 | 审计日志 + 二次确认 + 字段白名单 |
| 编辑课程/映射破坏数据 | 只编辑已有行、字段白名单、禁止 CRUD |
| 评论隐藏影响统计 | 顶层评论 hidden 变更后调用 refresh RPC |
| Telegram 故障 | 先写 DB，Telegram best-effort |
| 平台 admin env 泄漏 | env 只放 Clerk userId/email，不放 secret；Cloudflare secret 管理 |
| 管理 API 被 CSRF | 同源 fetch + Clerk 鉴权；后续可加 origin check |
| sync 路由超时 | limit 1-50；全量仍走 GitHub Actions |
