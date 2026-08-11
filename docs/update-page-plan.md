# /update 管理页开发规划与文档

> 目标：在 `next-web` 中新增一个仅对白名单用户可见的 `/update` 页面，把 `umeh-update` 中的所有数据库更新流程搬到 Web 端。为了绕开 Vercel Serverless 函数超时（Hobby 10s / Pro 60s / 流式最长 300s），大批量作业采用「服务端下发凭据 → 浏览器直连 Supabase 与 UM API」的架构。

---

## 一、现状调研

### 1. `next-web`（Next.js 14 App Router）

- **鉴权**：`@clerk/nextjs` + `@clerk/backend`。`ClerkProvider` 已挂在 `app/layout.tsx`。已有 `/sign-in`、`/sign-up`（`[[...sign-in]]` catch-all）。目前无任何服务端 `auth()` 调用，也没有基于角色的判断。
- **数据库层**：`lib/database/database.js` 导出两个 Supabase 客户端：
  - 默认导出：`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `createServer()`：同 URL + `SUPABASE_SERVICE_ROLE_KEY`
  - ⚠️ **重要发现**：`.env.local` 中 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 与 `SUPABASE_SERVICE_ROLE_KEY` 的 JWT 值完全相同（都是 `role: anon`）。也就是说当前 Supabase 侧没有真正启用 RLS 策略，浏览器持有的匿名 Key 就已经能写全部表。这在做 `/update` 前必须先在 Supabase Dashboard 修复（详见「安全」章节）。
- **业务 API**：`app/api/comment/[code]/[prof]/route.tsx`（提交评论）、`app/api/reply/route.ts`（回复）、`app/api/vote/[comment_id]/route.ts`（表情投票），三个都是 `POST`，直接 `insert`。
- **UM 官方 API 调用**：`lib/database/get-course-info.ts` 已经把带 `Authorization: f5aa…` 头的 UM Open Data API 封装在 `fetchCourseInfoByUMAPI`。该 Token 目前是硬编码。
- **部署**：仓库里同时有 `wrangler.jsonc` + `open-next.config.ts`（Cloudflare Workers 走 OpenNext）和常规 `next build` 脚本。按需求文档以 **Vercel 部署** 为主线设计，同时兼容 CF Workers（区别只是环境变量与超时时限）。
- **环境变量**：`NEXT_PUBLIC_SUPABASE_URL`、`*_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`CLERK_SECRET_KEY`、`NEXT_PUBLIC_CLERK_*`、`CURRENT_YEAR`、`CURRENT_SEM`、`IS_PREENROLLMENT_OPEN`、`NEXT_PUBLIC_DATABASE_LAST_UPDATE`、`IMGUR_*`、`BLOB_READ_WRITE_TOKEN`。

### 2. `umeh-update`（Python 脚本）

单文件 `main.py` + 一个 `update_comment.py`。硬编码 Supabase URL / Anon Key、UM Open Data API Token，用 `pandas` 读入学期时间表 Excel，跑一系列写库任务。所有函数手动 `# thread_exec(...)` 打开／注释。任务清单：

| 函数 | 输入 | 目标表 | 幂等性 | 单次写入量级 |
|---|---|---|---|---|
| `set_all_no_offerd_thread` | — | `course_noporf.Is_Offered=0` | ✅ | 1 条 SQL（几千行受影响） |
| `preenrollment_check(schedules)` | 预注册 Excel（`header=1`） | `course_noporf` upsert | ✅（先查后写） | 每课 1 次 UM API + 1~2 次 DB |
| `course_no_porf_check(schedules)` | 加退选 Excel（`header=5`） | `course_noporf` upsert | ✅ | 同上 |
| `set_offered(schedules)` | 加退选 Excel | `course_noporf.Is_Offered=1` `in_` 批量 | ✅ | 1 条 SQL |
| `add_time_location(schedules)` | 加退选 Excel | `time_location` 增量 insert | ✅（先查） | 每去重的 (date,times,location) 1 条 |
| `add_prof_course(schedules)` | 加退选 Excel | `prof_with_course` insert/update | ✅ | 每 (course_id,prof) 1 条 |
| `add_offer_schedule(schedules)` | 加退选 Excel | `offer` + `schedule` insert | ✅ | 每 (course,prof,section) N 条 |
| `import_postgraduate_course` | 无输入，按 prefix 爬 UM API | `course_noporf` + `prof_info` + `prof_with_course` | ✅（内存去重 + checkpoint 文件） | ~几千课程，每课≥1 次 API |
| `update_comment.update_comment` | `prof_with_course` 全表 | `prof_with_course.result/attendance/…` 重算 | ✅ | 全表遍历，每条 1 次 SQL |

**关键规律**：
1. 除了「reset all offered」「批量 set_offered」两个是一次性 SQL，其他都是「按行迭代 + 读写多次」，耗时随 Excel 行数（几千行）或全表大小（上万行）线性增长。Python 版本靠 `Thread` 拆 500 一组并行加速。
2. UM Open Data API 是 IO 阻塞主要来源；`import_postgraduate_course` 用了 `Retry(total=5, backoff)` + 每次 `time.sleep(0.3)`。
3. 长任务用本地 JSON checkpoint 支持断点续跑。
4. Excel schema：
   - 加退选表（`header=5`）列位：`0=Offering_Unit, 1=Offering_Dept, 2=Course_Code, 4=Section, 3=Course_Title_EN, 6=Medium, 8=Prof, 10=Date, 11=Start, 12=End, 13=Location`（按 `main.py` 中 `course[i]` 读取推断）。
   - 预注册表（`header=1`）列位不同：`0=Unit, 1=Dept, 2=Code, 4=Title, ...`（`preenrollment_check` 用 `course[4]` 取标题，`course_no_porf_check` 用 `course[3]`）。**需在 UI 上让用户显式选择模式**，因为 Excel 格式区别不能靠内容自动判断。
5. 涉及表：`course_noporf`、`prof_info`、`prof_with_course`、`offer`、`schedule`、`time_location`、`comment`、`vote`。

---

## 二、架构总览

```
┌────────────────────────────────────────────────────────────┐
│  浏览器（管理员，Clerk 登录）                                │
│  ┌────────────────────────────────────────────────────┐    │
│  │ /update React 页面                                  │    │
│  │  ├─ 上传 .xlsx（本地解析 SheetJS）                    │    │
│  │  ├─ 任务面板：勾选 & 顺序执行                          │    │
│  │  ├─ 进度条 + 断点续跑（IndexedDB 存 checkpoint）        │    │
│  │  └─ 直连 Supabase-js（服务端下发的短期凭据）            │    │
│  └────────────────────────────────────────────────────┘    │
│           │                                                │
│           │ HTTPS（PostgREST /rest/v1）                     │
│           ▼                                                │
│      ┌──────────────┐        ┌──────────────────────┐      │
│      │  Supabase    │        │  UM Open Data API    │      │
│      │  (Postgres)  │        │  经 /api/admin/um    │      │
│      └──────────────┘        │  代理（隐藏 Token）    │      │
│                              └──────────────────────┘      │
└────────────────────────────────────────────────────────────┘
                    ▲                    ▲
                    │ 只在少量、纯 SQL     │ 只做鉴权 + 转发
                    │ 的作业中走这里       │
        ┌───────────┴────────────┐  ┌───┴─────────────────┐
        │ /api/admin/session-key │  │ /api/admin/um-proxy │
        │ /api/admin/quick-sql   │  │                     │
        └────────────────────────┘  └─────────────────────┘
                    Next.js Server（Vercel）
```

- **快速一次性 SQL**（reset offered、set offered、schema 相关）→ 服务端 API，仍然 <1s。
- **逐行大批量任务**（course_no_porf_check、add_prof_course、add_offer_schedule、update_comment、import_postgraduate_course）→ 浏览器直连 Supabase 执行，绕过 Vercel 超时。
- **UM Open Data API 调用** → 走服务端 `/api/admin/um-proxy`，避免把 UM Token 或 CORS 问题带到浏览器。

---

## 三、访问控制

### 3.1 白名单机制

新增环境变量：

```env
# 逗号分隔的 Clerk user_id 列表
ADMIN_USER_IDS=user_2abc...,user_2xyz...
```

集中封装 `lib/auth/admin-guard.ts`：

```ts
import { auth } from '@clerk/nextjs/server'  // or '@clerk/nextjs' 视版本

export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false
  const list = (process.env.ADMIN_USER_IDS ?? '')
    .split(',').map(s => s.trim()).filter(Boolean)
  return list.includes(userId)
}

export async function requireAdmin() {
  const { userId } = auth()
  if (!isAdminUserId(userId)) {
    // 对未授权用户直接 404（避免暴露该页面的存在）
    const { notFound } = await import('next/navigation')
    notFound()
  }
  return userId!
}
```

### 3.2 页面守卫

- `app/update/page.tsx`：Server Component，进入即调用 `await requireAdmin()`。非白名单用户看到 404。
- 所有 `/api/admin/*` 路由：`Route Handler` 中同样先 `requireAdmin()`，非白名单一律 `Response(null, {status: 404})`。
- Clerk 中间件（如果启用）里放行 `/update`、`/api/admin/*` 但由服务端组件与路由自校验（更简单）。

### 3.3 Clerk 与 Supabase 的对接思路

> **前提**：Supabase 已同时切换到两套新体系：
> 1. API Key：`sb_publishable_...` / `sb_secret_...`（opaque token，详见 §7.0）
> 2. JWT 签名：**JWT Signing Keys**（非对称 ES256 / RS256 / EdDSA，替代 legacy HS256 `SUPABASE_JWT_SECRET`，详见 §7.6）
>
> **本方案里浏览器同时需要两个凭据**：
> - **长期** publishable key：走 `apikey` header，标识请求来自本项目；
> - **短期**（15 min）ES256 JWT：走 `Authorization: Bearer`，把 PostgREST 的执行角色抬到 `service_role` 以绕过 RLS。
>
> 单独发 `sb_secret_...` 也能让浏览器写库，但它是 opaque token、**没有 TTL、只能整体轮换**，泄漏后必须 Dashboard 重发。ES256 短期 JWT 15 分钟自动失效，安全边界更清晰。

因此按推荐度重新排序：

| 方案 | 做法 | 优点 | 缺点 | 建议 |
|---|---|---|---|---|
| A | 服务端把长期 `SUPABASE_SECRET_KEY`（`sb_secret_...`）直接下发白名单浏览器 | 最简单，一个 header 走天下 | 无过期；泄漏后必须整体轮换 | 冷启动或不便签 JWT 时可用 |
| B | 服务端用**导入到 Supabase 的 ES256 私钥**签一个 15 min JWT，claim `role: service_role`；浏览器把它当 `Authorization: Bearer` 与 publishable key 一起送。Supabase 通过 JWKS 端点校验 | 有过期时间；泄漏影响仅限 15 min；符合 Supabase 2025 官方主线（asymmetric keys） | 需要一次性生成 + 导入私钥（管理员操作一次） | **推荐（本方案采用）** |
| C | 用 legacy `SUPABASE_JWT_SECRET`（HS256）签 | 代码最短 | Supabase 已标记 *"No longer recommended"*；未来关掉 legacy 就要重来 | 不采用 |
| D | 完全服务端做，走后台队列（Vercel Cron/QStash/Trigger.dev/Inngest） | 不下发任何 Key | 引入外部依赖；违反「浏览器发起」诉求 | 本期不考虑 |

本文以 **方案 B** 为主。

**一次性初始化（管理员执行，见 §7.6 详细步骤）**：
1. 本地生成一对 ES256 密钥（P-256），以完整 JWK（含 `d` 字段）导出。
2. 把**整份私钥 JWK** 上传到 Supabase：
   - **优先** Dashboard 路径：Project Settings → JWT Keys → JWT Signing Keys → *Create Standby Key* → 选 *Import an existing key*
   - **Dashboard 按钮不见**（migrated 老项目常见）：走 Management API 一句 `curl POST /v1/projects/{ref}/config/auth/signing-keys` 上传，详见 §7.6 Step 2b
3. Rotate 到 In Use。此后 Supabase 把公钥挂到 `/auth/v1/.well-known/jwks.json`，PostgREST 通过 JWKS 校验我们签的 JWT。
4. 同一份 JWK 也写进 Vercel env（`SUPABASE_JWT_PRIVATE_JWK`）和 `.env.local` —— 至此 **Supabase 和我们各持一份私钥副本**（这是 Supabase 目前唯一支持的「自签 JWT」形态，无「只上传公钥」的入口）。

**运行时代码**：

```ts
// lib/auth/issue-service-jwt.ts
import { SignJWT, importJWK } from 'jose'

// SUPABASE_JWT_PRIVATE_JWK 是形如
// {"kty":"EC","kid":"3a18cf..","d":"...","crv":"P-256","x":"..","y":".."}
// 的 JSON 字符串；`kid` 必须与 Supabase Dashboard 上那条 signing key 记录一致
export async function issueServiceJwt() {
  const jwk = JSON.parse(process.env.SUPABASE_JWT_PRIVATE_JWK!)
  const key = await importJWK(jwk, 'ES256')
  return await new SignJWT({ role: 'service_role' })
    .setProtectedHeader({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('15m')
    // iss/aud 可选；PostgREST 只强制校验 exp + 签名 + role
    .sign(key)
}
```

```ts
// app/api/admin/session-key/route.ts
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/admin-guard'
import { issueServiceJwt } from '@/lib/auth/issue-service-jwt'

export async function POST() {
  await requireAdmin()
  const jwt = await issueServiceJwt()
  return NextResponse.json({
    url:            process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,  // sb_publishable_...
    elevatedJwt:    jwt,                                                // 15 min，ES256
    expiresIn:      15 * 60,
  })
}
```

```ts
// app/update/lib/supabase-admin.ts
import { createClient } from '@supabase/supabase-js'

export function buildAdminSupabase(url: string, pubKey: string, jwt: string) {
  // 第 2 参数：publishable key → 落到 `apikey` header
  // 第 3 参数：ES256 JWT → 覆盖 `Authorization: Bearer`，让 PostgREST 走 service_role
  return createClient(url, pubKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth:   { persistSession: false, autoRefreshToken: false },
  })
}
```

浏览器侧的刷新逻辑：每次 flush 前检查 `expiresAt - Date.now() < 60_000` 就调 `/api/admin/session-key` 拿新 JWT 重建 client。JWKS Supabase 边缘缓存 10 分钟，key rotation 后需等 10 min 全网生效 —— 但因为我们签 15 min JWT，不会触发这条边界。

---

## 四、页面与交互设计

### 4.1 路由

```
app/
  update/
    page.tsx            # Server Component + requireAdmin
    ui.tsx              # "use client" 主体
    tasks/
      check-courses.ts  # 单个任务的浏览器执行器
      set-offered.ts
      add-time-location.ts
      add-prof-course.ts
      add-offer-schedule.ts
      update-comment.ts
      import-pg-course.ts
    lib/
      supabase-admin.ts # 用短期 JWT 建立 supabase 客户端
      checkpoint.ts     # IndexedDB (idb-keyval) 存断点
      excel.ts          # SheetJS 解析
      um-api.ts         # 走服务端代理
  api/
    admin/
      session-key/route.ts
      um-proxy/route.ts
      quick-sql/
        reset-offered/route.ts   # 一句 SQL 就完的任务放服务端
        set-offered/route.ts
```

### 4.2 主界面（示意）

```
┌ /update ─────────────────────────────────────────────────┐
│  你以 booxmaars@gmail.com 登录，为管理员                    │
│                                                          │
│  Step 1  上传学期时间表 .xlsx                             │
│  ┌──────────────────────────────────────────────────┐     │
│  │  [ 选择文件 ]  25-26-2.xlsx                       │     │
│  │  ○ Add/Drop 表（header 从第 6 行开始）             │     │
│  │  ● Pre-enrollment 表（header 从第 2 行开始）        │     │
│  │  年份 [ 2025 ]  学期 [ 2 ]                         │     │
│  │  → 已解析 3421 行                                  │     │
│  └──────────────────────────────────────────────────┘     │
│                                                          │
│  Step 2  选择要执行的任务（会按顺序串行执行）                 │
│  ┌──────────────────────────────────────────────────┐     │
│  │ [x] ① 重置所有课程 Is_Offered=0（快速，服务端）       │     │
│  │ [x] ② 检查/补齐 course_noporf（浏览器直连）           │     │
│  │ [x] ③ 批量标记 Is_Offered=1（快速，服务端）            │     │
│  │ [x] ④ 补齐 time_location（浏览器）                   │     │
│  │ [x] ⑤ 补齐 prof_with_course（浏览器）                │     │
│  │ [x] ⑥ 写入 offer + schedule（浏览器）                │     │
│  │ [ ] ⑦ 重算所有课程评论聚合（浏览器；非本期强制）       │     │
│  │ [ ] ⑧ 爬取研究生课程目录（浏览器；独立于 Excel）       │     │
│  │                                                    │     │
│  │ [ 开始执行 ]     [ 断点续跑 ]     [ 清空 checkpoint ] │     │
│  └──────────────────────────────────────────────────┘     │
│                                                          │
│  Step 3  执行状态                                          │
│  ┌──────────────────────────────────────────────────┐     │
│  │ ① reset_offered            ✅ 0.4s                 │     │
│  │ ② check_courses            🔄 812 / 3421 (23%)     │     │
│  │    最近 3 条日志：                                   │     │
│  │      - INSERT ECEN2007 (UM API命中)                │     │
│  │      - UPDATE ACCT4106 Is_Offered=1                │     │
│  │      - ERROR CMED8010: HTTP 502（已重试第 2 次）      │     │
│  │ ③ …                                                │     │
│  └──────────────────────────────────────────────────┘     │
│                                                          │
│  Step 4  完成后自动更新 NEXT_PUBLIC_DATABASE_LAST_UPDATE   │
│         （提示手动改 Vercel 环境变量或调 update-flag API）   │
└──────────────────────────────────────────────────────────┘
```

### 4.3 任务执行契约

每个 `tasks/*.ts` 都实现：

```ts
export interface AdminTask<TInput = unknown> {
  id: string                       // 稳定 ID，用于 checkpoint
  label: string
  runsIn: 'server' | 'browser'
  estimateSize(input: TInput): number  // 用于进度条
  run(ctx: TaskCtx, input: TInput): Promise<void>
}

export interface TaskCtx {
  supabase: SupabaseClient           // 浏览器任务用短期 JWT 建的
  umApi: UMApiClient                 // 走 /api/admin/um-proxy
  onProgress(done: number, total: number, log?: string): void
  checkpoint: {
    get<T>(key: string): Promise<T | null>
    set<T>(key: string, val: T): Promise<void>
    clear(): Promise<void>
  }
  signal: AbortSignal                // 用户点「暂停」触发
}
```

Runner（`ui.tsx` 主循环）负责：串行调度、失败重试（指数退避 1s/2s/4s）、把 `onProgress` 反映到 UI、按 `id` 存/读 checkpoint。

### 4.4 断点续跑

- 浏览器端 checkpoint 存 IndexedDB（`idb-keyval`），key = `${sessionId}:${taskId}`。
- 每个 task 内部用「已处理游标 index / 已处理 key 集合」自定义。参考 Python 中 `import_postgraduate_course` 用的 `completed_prefixes`、`pending_courses` 结构。
- 页面标签关闭 → 下次进入 `/update` 显示「发现未完成 session (2025-08-08 21:03，任务②执行到 812/3421)」，一键续跑。

---

## 五、逐个任务的落地方案

### 5.0 「批量优先」的执行模式（重要）

原 Python 版本里最慢的部分不是 UM API，也不是 Supabase 单条写入本身，而是「每处理一行 Excel 就发 3~5 个 `SELECT` 去问『这条是否已经存在』」这种 N+1 pattern。真正跑得快的两个函数 —— `set_offered`、`import_postgraduate_course` —— 已经采用了完全不同的写法：**先一次性把要用的『存量索引』和『新增/更新 payload』全部装进内存，最后再统一 `insert(insert_list).execute()`。** 参见 `main.py` 里：

- `set_offered`：`supabase.from_('course_noporf').update({'Is_Offered': 1}).in_('New_code', code_list).execute()` — 一句 SQL 打上全部标记。
- `add_time_location`：累积 `insert_list` → 结束时 `insert(insert_list).execute()`。
- `add_prof_course`：累积 `insert_list` → 结束时 `insert(insert_list).execute()`（可惜 `update_list` 部分仍走循环，是遗留优化空间）。
- `import_postgraduate_course`：预取 `existing_courses / existing_profs / existing_pwc`，全部累积到 `courses_to_insert / profs_to_insert / pwc_to_insert`，函数末尾三次 `insert()` 全部落盘。

**Web 版把这条规律推到极致**，所有任务统一按下面 4 步走：

```
Phase A · 预取（1~3 次 SELECT 全表）
   一次性把 course_noporf / prof_with_course / prof_info / time_location / offer
   的主键列拉到内存，构造 Map / Set 做 O(1) 存在性判定。
Phase B · 纯内存计算
   遍历 Excel（或 UM API 返回），生成:
     - insertRows[]        （新增行）
     - patchRows[]         （需要变更的行；带主键）
     - fanOutBuckets[]     （比如 add_prof_course 里按 is_offered 分桶）
Phase C · 单次批量 flush
   ① insert：分块 <= CHUNK 上传（PostgREST 单请求上限，见下）
   ② update：能合并成 .in().update({field:同值}) 的 → 一句 SQL
             per-row 值不同的 → 用 upsert(onConflict='pk') 一批一句
             实在没主键、每行值都不同的 → 走 rpc 自定义 SQL 函数
Phase D · 幂等收尾
   把这次 flush 的主键写进 checkpoint，方便断点续跑时跳过。
```

**PostgREST / Supabase 侧的限制（决定 CHUNK 大小）**：

| 限制 | 数值 | 处理 |
|---|---|---|
| 单请求默认返回行数 | 1000 | 预取时用 `.range(offset, offset+999)` 循环翻页拉全表 |
| 单请求 body 上限 | 1 MB（Supabase Edge Runtime 默认） | 每 500~1000 行 flush 一次，估算行大小后动态调 |
| `upsert` 单次可写入行数 | 无硬性上限，但受上面 body 限制 | 同上 |
| 短期 JWT 有效期 | 15 分钟（本方案自定义） | 每次 flush 前检查过期，快到期就调 `/api/admin/session-key` 刷新 |

**为「每行不同值的 update」准备一个 RPC**：多数任务能通过 upsert 化解，但少数场景（比如 `add_prof_course` 里对已存在行只改 `is_offered=1`，恰好可以合并；但 `update_comment` 里每行有独立的 result/attendance/... 就必须 upsert）确实需要单条 SQL 合并。为此在 Supabase 里预置一个 `bulk_update` 函数：

```sql
-- 存放在 supabase/migrations/0001_admin_bulk.sql
create or replace function public.bulk_update_prof_with_course(rows jsonb)
returns integer language plpgsql security definer as $$
declare updated int;
begin
  with input as (select * from jsonb_to_recordset(rows) as x(
      id int, comments int, result numeric, attendance numeric,
      grade numeric, hard numeric, reward numeric))
  update prof_with_course t
     set comments   = i.comments,
         result     = i.result,
         attendance = i.attendance,
         grade      = i.grade,
         hard       = i.hard,
         reward     = i.reward
    from input i
   where t.id = i.id;
  get diagnostics updated = row_count;
  return updated;
end $$;

revoke all on function public.bulk_update_prof_with_course(jsonb) from public, anon;
grant execute on function public.bulk_update_prof_with_course(jsonb) to service_role;
```

浏览器直接 `supabase.rpc('bulk_update_prof_with_course', { rows: payload })`，一次网络往返改写几千行。

### 5.1 任务清单（用上面「4 步走」重写）

> 括号里是原 Python 函数。所有任务均幂等（预取索引，去重后写入）。

1. **`reset-offered`（`set_all_no_offerd_thread`）** — 服务端一句 SQL：
   ```ts
   await sb.from('course_noporf').update({ Is_Offered: 0 }).neq('New_code', '')
   ```
   放 `app/api/admin/quick-sql/reset-offered/route.ts`。

2. **`check-courses`（`course_no_porf_check` / `preenrollment_check`）** — 浏览器：
   - **Phase A**：`select New_code from course_noporf`（翻页拉全表）→ `Set<string>`。
   - **Phase B**：遍历 Excel；命中 Set 的 → 若 pre-enrollment 模式且课程当前 `Is_Offered=0`，塞入 `patchOffered[]`；否则跳过。未命中的 → 调 `/api/admin/um-proxy` 拿 UM 数据 → 构造 `insertRows[]`。UM API 调用天然是网络瓶颈，用 `concurrency=8` 的 `p-limit` 池并行。
   - **Phase C**：`insertRows` 分 500 一批 `supabase.from('course_noporf').insert(batch)`；`patchOffered` 一句 `.update({Is_Offered:1}).in('New_code', codes)`。
   - checkpoint：`{ processedIndex: number, umFetched: string[], flushedInsertCodes: string[] }`。

3. **`set-offered`（`set_offered`）** — 服务端一句：
   ```ts
   await sb.from('course_noporf').update({ Is_Offered: 1 }).in('New_code', codes)
   ```
   浏览器只把去重课号列表 POST 上来（几千个字符串 payload <1 MB）。

4. **`add-time-location`（`add_time_location`）** — 浏览器：
   - **A**：`select id, date, times, location from time_location` 翻页拉全 → `Map<'date|times|location', id>`；`max(id)` 作为下一个自增起点。
   - **B**：遍历 Excel，跳过带 NaN 的行；组 key 后不在 Map 里的 → 分配递增 id 累积到 `insertRows[]`。
   - **C**：`insertRows` 分 1000 一批 insert 一次落完。
   - Python 版本本身就是这样做的，此处照抄。

5. **`add-prof-course`（`add_prof_course`）** — 浏览器：
   - **A**：`select id, course_id, prof_id from prof_with_course` 翻页拉全 → `Map<'course|prof', id>`；`max(id)` 起点。
   - **B**：遍历 Excel；教师名走 `unidecode`（npm `unidecode`）+ `split(' / ')`。
     - 命中 Map → 加入 `patchOfferedIds[]`（都是同一动作 `is_offered=1`，可合并）。
     - 未命中 → 分配 id 累积到 `insertRows[]`；同时把 `(course, prof)` 加进本地 Map 去重后续行。
   - **C**：`insertRows` 分批 insert；`patchOfferedIds` 一句 `.update({is_offered:1}).in('id', ids)`。
   - **对比 Python**：原实现在「已存在」分支用 `for` 循环 `.eq().eq().update()`（`main.py:343-345`），是 N 次网络往返。Web 版合并为 1 次。

6. **`add-offer-schedule`（`add_offer_schedule`）** — 浏览器：
   - **A**：三份预取
     - `select id, course_id, prof_id from prof_with_course` → Map
     - `select id, date, times, location from time_location` → Map
     - `select course_id, section, year, sem from offer where year=Y and sem=S` → Set
   - **B**：遍历 Excel，跳过缺失日期行；查 Map 组出 `offerInsertRows[]`（去重后按 `(course_id,section)`）与 `scheduleInsertRows[]`（依赖 offer 的 id）。
     - 因为 `schedule` 需要 `offer` 落库后的自增 id，两种做法二选一：
       - **做法 a**：`offer` 表加 `unique(course_id, section, year, sem)` 约束，用 `insert(...).select()` 拿回生成的 id，再组 schedule；一次 insert 拿一批 id。
       - **做法 b**：写一个 `bulk_insert_offer_schedule(rows jsonb)` RPC，事务里一次 insert offer + join 出 id + insert schedule。**推荐 b**：单请求，避免二段提交。
   - **C**：调 RPC 一次搞定，或做法 a 的两批 insert。
   - **对比 Python**：原实现每行 3~4 次网络（`main.py:361-390`），Web 版 O(1)。

7. **`update-comment`（`update_comment`）** — 浏览器：
   - **A**：`select id, comments, result, attendance, grade, hard, reward from prof_with_course` 翻页拉全；`select course_id, result, attendance, grade, reward, hard from comment` 翻页拉全。
   - **B**：内存里按 `course_id` group-by 聚合，得到 `patchRows[]`（每行主键 id + 6 个新值）。
   - **C**：`supabase.rpc('bulk_update_prof_with_course', { rows: patchRows })` 一次搞定；也可以退化为 `upsert(patchRows, { onConflict:'id' })` 每批 1000 行。
   - **对比 Python**：原实现遍历几万条 `prof_with_course`，每条一次 SELECT + 一次 UPDATE（`update_comment.py`），Web 版 = 2 次 SELECT + 1 次 RPC。

8. **`import-pg-course`（`import_postgraduate_course`）** — 浏览器：
   - Phase A/B 沿用 Python 逻辑：先建 `existing_courses/existing_profs/existing_pwc` 三个 Set，按 prefix 逐个爬 UM API（走 `/api/admin/um-proxy`），把结果累积到 `courses_to_insert/profs_to_insert/pwc_to_insert`。每完成一个 prefix 写一次 checkpoint（对应 Python 的 `import_pg_checkpoint.json`）。
   - Phase C：结束时三条 `insert()` 全部落库（每条内部分块 500）。
   - Phase D：清空 checkpoint。

### 5.2 通用 helper

在 `app/update/lib/supabase-admin.ts` 里封装：

```ts
export async function selectAll<T>(
  sb: SupabaseClient,
  table: string,
  select: string,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await sb.from(table).select(select)
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    out.push(...(data as T[]))
    if (!data || data.length < pageSize) break
  }
  return out
}

export async function insertBatched<T>(
  sb: SupabaseClient, table: string, rows: T[], chunk = 500,
) {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await sb.from(table).insert(rows.slice(i, i + chunk))
    if (error) throw error
  }
}

export async function upsertBatched<T>(
  sb: SupabaseClient, table: string, rows: T[], onConflict: string, chunk = 500,
) { /* 同上，改成 .upsert(chunk, { onConflict }) */ }
```

所有 task 都靠这三个函数拼装。

---

## 六、`/api/admin/um-proxy` 设计

```ts
// app/api/admin/um-proxy/route.ts
import { requireAdmin } from '@/lib/auth/admin-guard'
export async function GET(req: Request) {
  await requireAdmin()
  const url = new URL(req.url)
  const path = url.searchParams.get('path')     // e.g. course_catalog/all
  const qs = url.searchParams.get('qs') ?? ''
  const target = `https://api.data.um.edu.mo/service/academic/${path}?${qs}`
  const r = await fetch(target, {
    headers: { Authorization: process.env.UM_API_TOKEN! },
  })
  return new Response(await r.text(), {
    status: r.status,
    headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' },
  })
}
```

新增环境变量：`UM_API_TOKEN=f5aaa86cc5b4424aa621538fceaab34f`（同时替换 `lib/database/get-course-info.ts` 里的硬编码值）。

---

## 七、Supabase 侧准备

### 7.0 Supabase 新 API Key 体系（2025 起）

Supabase 已经把 API Key 从「一对 JWT（`anon` + `service_role`）」改成「一个 publishable + 若干 secret 的 opaque token」。事实要点：

| 项 | Legacy | 新 |
|---|---|---|
| 前端 Key | `NEXT_PUBLIC_SUPABASE_ANON_KEY`（JWT，`role:anon`） | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（形如 `sb_publishable_...`） |
| 后端 Key | `SUPABASE_SERVICE_ROLE_KEY`（JWT，`role:service_role`） | `SUPABASE_SECRET_KEY`（形如 `sb_secret_...`，可创建多把） |
| 类型 | HS256 JWT，PostgREST 直接解析 | **Opaque token（不是 JWT）**，PostgREST 内部映射到对应角色 |
| 传输 header | 二选一：`apikey` 或 `Authorization: Bearer <key>` 都行 | **必须**放 `apikey` header；`sb_secret_*` 放 `Authorization` 会被拒 |
| 过期 | 无（JWT 是长期签发） | 无 TTL；只能 Dashboard 轮换（生成新 key、下线旧 key） |
| supabase-js 用法 | `createClient(url, jwt)` | `createClient(url, sb_publishable_...)` 或 `createClient(url, sb_secret_...)` —— **调用方式完全不变，只换值**（对 supabase-js 版本要求见 §7.8） |
| 共存 | ✅ Supabase 承诺至少 2026 年底之前 legacy 与新 key 并行；新项目已不再发 legacy | ✅ 用户当前项目应该看到 4 把 key 都可用 |
| 签自定义 JWT | `SUPABASE_JWT_SECRET`（HS256 共享密钥） | **JWT Signing Keys**（asymmetric，ES256/RS256/EdDSA）。Supabase 自建的私钥不可导出；要在自家后端签 JWT，须走 Dashboard 的 *Import a new standby key* 流程：**自己生成完整私钥 JWK 上传给 Supabase**，之后 Supabase 与我们各保管一份私钥副本，我们用它签 JWT、Supabase 用 JWKS 端点暴露公钥供 PostgREST 验签。本方案 §3.3 采用 ES256（P-256 曲线）。 |

**对本方案的影响**：
1. 现有前端读库全部把 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 换成 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（`lib/database/database.js` 一处即可）。
2. 现有 3 个 API Route 里对 `prof_with_course` 的 update 要走 `createServer()`，`createServer()` 用 `SUPABASE_SECRET_KEY`。
3. 浏览器直连 Supabase 时，publishable key 走 `apikey`，短期 JWT 走 `Authorization: Bearer`（见 §3.3 的 `buildAdminSupabase`）。
4. 新 key 是 opaque、无 TTL，因此**不适合**替换 §3.3 里那个 15 min 短期凭据；短期 JWT 走 §7.6 的 asymmetric（ES256）JWT Signing Keys 体系，私钥 `SUPABASE_JWT_PRIVATE_JWK` 存 Vercel env。
5. 用户当前诉求是「先用新 key 开发，legacy 不动」。此策略天然可行：**publishable/secret 与 legacy anon/service_role 完全等价并共存**，切换只是改 `.env.local` 与代码里读的变量名。
6. **本方案不依赖 `SUPABASE_JWT_SECRET`**（详见 §7.10「面向未来：为什么我们不怕 legacy 停支持」）。

### 7.1 为什么必须在上 `/update` 之前先开 RLS

- 现状：`.env.local` 中 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 与 `SUPABASE_SERVICE_ROLE_KEY` 的 JWT payload **完全一致**（都是 `role: anon`），而生产环境 `zqdlpoiiihrtflyjljal.supabase.co` 目前是可写的 → 唯一可能是 **RLS 尚未启用**（或全部策略是 `USING (true) WITH CHECK (true)`）。
- 一旦本方案对外发布短期 JWT（`role: service_role`），意味着白名单用户拿到的凭据「威力」远大于 publishable key；如果 RLS 仍是关闭的，那么白名单机制根本没有意义 —— 任何拿到 publishable key 的公网访客都可以直接改库（Supabase 官方原话：*"publishable key is safe to use in a browser **if** you have enabled Row Level Security"*）。**RLS 是新 key 体系与 `/update` 的共同安全前提。**
- 修 RLS **不是一次点开关的操作**，需要同时做四件事：`ALTER TABLE ... ENABLE RLS` + 写策略 + 迁移现有 3 个 API Route 里对 `prof_with_course` 的 update 到 secret key + 拿到并配置新 publishable / secret key。缺一样都会造成线上写入 500。

### 7.2 涉及表的读写清单

> Publishable key 请求在 Postgres 里映射到 `anon` role；secret key 请求映射到 `service_role`。所以下表里「anon / service_role」既是**策略里写的 role 名**，也是**新 key 在数据库侧的等价身份**。

| 表 | 谁读 | 谁写 | 场景 |
|---|---|---|---|
| `course_noporf` | anon（首页/详情/搜索/目录页） | service_role | 只有 `/update` 与外部脚本 |
| `prof_info` | anon | service_role | 同上 |
| `prof_with_course` | anon | service_role（`/update`） + service_role（`app/api/comment/[code]/[prof]` 提交评论时更新聚合列） | 现有代码用 anon 直接 update，需要迁到 secret key |
| `offer` | anon（timetable、schedule 查询） | service_role | `/update` |
| `schedule` | anon | service_role | `/update` |
| `time_location` | anon | service_role | `/update` |
| `comment` | anon（评论展示） | **anon insert** + service_role update/delete | 用户提评论，`app/api/comment/**/route.tsx` 和 `app/api/reply/route.ts` 目前用 anon insert，可以保留 |
| `vote` | anon（表情投票展示） | **anon insert** | `app/api/vote/[comment_id]/route.ts` 目前用 anon insert，可以保留 |

结论：**`comment/vote` 两张表继续接受 anon（publishable key）insert；其余 6 张表全部转为「publishable 只读、secret / service_role 独占写」**。

### 7.3 需要迁移的现有 API 路由

一旦按 7.2 落策略，下列路由会立刻 403：

| 路由 | 现有行为 | 迁移办法 |
|---|---|---|
| `app/api/comment/[code]/[prof]/route.tsx` | anon insert `comment` ✅ + anon update `prof_with_course` ❌ | 只把 `prof_with_course.update({...})` 那句换成 `createServer()`（secret key） |
| `app/api/reply/route.ts` | anon insert `comment` ✅ | 无需改动 |
| `app/api/vote/[comment_id]/route.ts` | anon insert `vote` ✅ | 无需改动 |

`lib/database/database.js` 同时要按 §7.7 的示意加上「优先读新 key、缺失时回退 legacy」的兼容分支，让开发期新旧 key 并存。**这两处是本方案对现有业务代码的全部影响。**

### 7.4 一份可直接执行的 RLS 迁移脚本

放在 `next-web/supabase/migrations/0000_enable_rls.sql`，PR-1 前置：

```sql
-- 0. 前置：确认 service_role 与 anon 两个 built-in role 已存在（Supabase 默认有）

-- 1. 只读表：anon 允许 SELECT，其他 role 走默认拒绝
do $$
declare t text;
begin
  foreach t in array array[
    'course_noporf','prof_info','prof_with_course',
    'offer','schedule','time_location'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_anon_read', t);
    execute format(
      'create policy %I on public.%I for select to anon using (true);',
      t||'_anon_read', t
    );
    -- service_role 走 bypass RLS（默认行为），无需再写策略
  end loop;
end $$;

-- 2. comment：anon 允许 SELECT + INSERT，禁止 UPDATE/DELETE
alter table public.comment enable row level security;
drop policy if exists comment_anon_read   on public.comment;
drop policy if exists comment_anon_insert on public.comment;
create policy comment_anon_read   on public.comment for select to anon using (true);
create policy comment_anon_insert on public.comment for insert to anon with check (true);
-- （可选加固）限制单条评论内容长度、pub_time 必须在合理范围等，用 with check 表达

-- 3. vote：同 comment
alter table public.vote enable row level security;
drop policy if exists vote_anon_read   on public.vote;
drop policy if exists vote_anon_insert on public.vote;
create policy vote_anon_read   on public.vote for select to anon using (true);
create policy vote_anon_insert on public.vote for insert to anon with check (true);

-- 4. 安装 §5.0 里的 bulk_update RPC（保证 anon/公网无法调用）
--   见 supabase/migrations/0001_admin_bulk.sql
```

> **重要提醒**：Supabase 的 `service_role`（无论 legacy JWT 还是 `sb_secret_*`）在 Postgres 里都有 `BYPASSRLS` 属性，所以「打开 RLS」不会挡住服务端与 `/update` 的写入。因此本方案里的短期 JWT 必须签成 `role: service_role`（§3.3 方案 B 就是这样做的）。如果错签成 `role: authenticated`，会被 RLS 挡住。

### 7.5 灰度上线顺序（对齐用户诉求「先用新 key 开发、legacy 不动」）

按 **A→B→C→D→E→F** 顺序执行，任何一步失败都能立即回滚上一步：

```
A. Supabase Dashboard → Settings → API Keys
     └─ 点 "Create new API Keys"，生成 sb_publishable_... 与至少 1 把 sb_secret_...
     └─ 按 §7.6 生成 ES256 密钥对（完整私钥 JWK），走 Dashboard 的 Import
        a new standby key 上传 → Rotate 为 In Use
        （公钥部分随即出现在 /auth/v1/.well-known/jwks.json）
     └─ 注意此刻 legacy anon / service_role / SUPABASE_JWT_SECRET 仍然存在且可用
        —— 完全不动它们

B. 只在本地 .env.local（不动 Vercel Production）追加：
     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
     SUPABASE_SECRET_KEY=sb_secret_...
     SUPABASE_JWT_PRIVATE_JWK={"kty":"EC","kid":"...","d":"...","crv":"P-256","x":"...","y":"..."}
     （legacy 的 NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 保留）

C. 部署 PR-0（含 lib/database/database.js 兼容分支 + createServer 迁移评论 update）到
   Preview 环境；此时 RLS 仍未开
     └─ 在 Preview 里跑一次首页/详情/评论/投票，确认新 key 也能读写（相当于把
        publishable/secret 挂上但功能等价 legacy）

D. Preview 环境执行 0000_enable_rls.sql（打开 RLS + 策略）
     └─ 再跑一次评论/投票/回复
     └─ 同时打开 devtools 手动构造 supabase.from('course_noporf').update({...})
        用 publishable key 直接调，应返回 403/PGRST（证明 RLS 生效）

E. Production：先只更 Vercel 环境变量（加新 key），再部署 PR-0，最后跑迁移脚本
     └─ 上线次序：加 env → 部署代码 → SQL 迁移；这样代码上线时无论走新旧 key 都
        能写；SQL 生效后仅 secret / service_role 能写
     └─ 立即验：/、/catalog、/course/*、评论/投票

F. 上 PR-1 及后续（/update 页与短期 JWT 端点）
     └─ 用白名单账号跑一次 dry-run（reset-offered → 立即改回），验证 ES256 短期
        JWT 能 bypass RLS（详见 §7.6 Step 5 的 curl 验证脚本）

回滚出口：
  - RLS 生效后翻车：`alter table ... disable row level security;`
  - 短期 JWT 端点翻车：直接下线 /api/admin/session-key
  - 新 key 翻车：从 .env.local / Vercel 移除 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY，
    §7.7 的 fallback 会自动回落到 legacy anon key，业务无感

未来关掉 legacy key（不在本期范围）：
  1. Dashboard 用 "Disable JWT-based API keys" 关掉 legacy anon/service_role
  2. 从 .env.local / Vercel 删除 NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
  3. 如果同时想 Revoke 掉 legacy JWT Signing Secret（HS256）：直接在 Dashboard
     Revoke 即可 —— 我们已经用 asymmetric ES256 imported key 签所有短期 JWT，
     完全不依赖那把 legacy secret（详见 §7.10）
```

### 7.6 生成并导入 JWT Signing Key（asymmetric，方案 B 一次性初始化）

> **Dashboard 实际交互**（2026 年 8 月核对）：
> `Project Settings → JWT Keys → JWT Signing Keys` 子标签 → 页面上只有一个按钮
> ***Create Standby Key***。点开弹窗，里面有一组 radio：
> - *Create a new key*（Supabase 内部生成密钥对，私钥永远不导出，我们拿不到 → **不能选这个**，我们后端就没法签 JWT 了）
> - *Import an existing key* ← **本方案必须选这个**：粘贴一整份完整私钥 JWK（含 `d`），Supabase 保管一份、我们保管一份，两方都能签 JWT
>
> **常见「按钮不见了」原因**：
> - **已经有一把 Standby key 占位**：Supabase 同时只允许一把 Standby 存在。三点菜单 → *Move to previously used* 先把它挪走，*Create Standby Key* 按钮就会重新出现。
> - **老项目 Dashboard 缺 UI**：迁移过来的老项目（比如本项目这种带 legacy anon/service_role 的），部分账号在 Dashboard 上确实**看不到** *Create Standby Key* 或 *Import* 弹窗。这是官方已知 gap（见 GitHub `supabase/supabase#38611` 附近讨论）。此时走下面的 **Step 2b Management API** 路径即可，同样能落到数据库。
> - **看不到 JWT Signing Keys 子标签本身**：确认你在的是 Project Settings → JWT Keys（不是 Authentication → Providers）。
>
> **重要事实**：Import 上传的是**完整的私钥 JWK**（含 `d` 字段）。之后 Supabase 与我们各存一份副本；我们用它签、Supabase 用它验，并把对应公钥自动挂到 `/auth/v1/.well-known/jwks.json`。**Supabase 无「只上传公钥」的形态**。

**Step 1**：本地生成 ES256 私钥（P-256 曲线），JWK 格式，任选其一：

```bash
# 方式 a：Supabase CLI（推荐，产出格式与 Dashboard 100% 匹配）
npx supabase@latest gen signing-key --algorithm ES256 > jwk.json

# 方式 b：openssl + jose 转 JWK
openssl ecparam -name prime256v1 -genkey -noout -out ec-priv.pem
node -e "
  const { importPKCS8, exportJWK } = require('jose');
  const fs = require('fs');
  (async () => {
    const key = await importPKCS8(fs.readFileSync('ec-priv.pem','utf8'), 'ES256');
    const jwk = await exportJWK(key);
    jwk.kid = require('crypto').randomUUID();
    console.log(JSON.stringify(jwk, null, 2));
  })()
" > jwk.json
```

`jwk.json` 结构：

```json
{
  "kty": "EC",
  "kid": "3a18cfe2-7226-43b0-bbb4-7c5242f2406e",
  "d":   "RDbwqThwtGP4WnvACvO_0nL0oMMSmMFSYMPosprlAog",
  "crv": "P-256",
  "x":   "gyLVvp9dyEgylYH7nR2E2qdQ_-9Pv5i1tk7c2qZD4Nk",
  "y":   "CD9RfYOTyjR5U-PC9UDlsthRpc7vAQQQ2FTt8UsX0fY"
}
```

**Step 2a**（Dashboard 路径，能看到 *Create Standby Key* 按钮时走这条）：
1. Project Settings → JWT Keys → JWT Signing Keys 子标签
2. 若已有 Standby key → 三点菜单 → *Move to previously used* 先腾位
3. 点 *Create Standby Key* → 选 *Import an existing key* → 算法选 ES256 → 粘贴整份 `jwk.json`（**注意不要包一层数组，就是那个 raw JSON 对象**）→ 提交
4. 新行以 **Standby** 状态入表，Supabase 服务端已复制一份私钥

**Step 2b**（Management API 路径，Dashboard 没按钮时走这条 —— **本项目就走这条**）：
1. 到 <https://supabase.com/dashboard/account/tokens> 点 *Generate new token*，创建一个 Personal Access Token（PAT）。这个 PAT 仅本次初始化用一次，跑完可以撤销。
2. 一句 `curl` 上传：

   ```bash
   PAT="sbp_..."           # 上面拿到的 Personal Access Token
   REF="zqdlpoiiihrtflyjljal"   # 你的 project ref（Dashboard URL 中间那段）
   curl -sS -X POST \
     "https://api.supabase.com/v1/projects/$REF/config/auth/signing-keys" \
     -H "Authorization: Bearer $PAT" \
     -H "Content-Type: application/json" \
     -d "$(jq -n --slurpfile jwk jwk.json '{
           algorithm: "ES256",
           status:    "standby",
           private_jwk: $jwk[0]
         }')"
   ```

   返回 `201` + `{"id":"...","algorithm":"ES256","status":"standby",...}` 即成功。
3. 端点定义（来自 Supabase Management API 公开的 OpenAPI）：
   - `POST /v1/projects/{ref}/config/auth/signing-keys`
     - body：`{algorithm: EdDSA|ES256|RS256|HS256, status: "standby"|"in_use", private_jwk?: JWK}`
     - 省略 `private_jwk` = Supabase 生成（等同 Dashboard 的 *Create a new key*）；带上 `private_jwk` = 导入我们的
   - `GET /v1/projects/{ref}/config/auth/signing-keys` —— 列出所有 signing key
   - `GET /v1/projects/{ref}/config/auth/signing-keys/{id}` —— 单个查询
   - PATCH 同路径可用来改 status（standby → in_use）
   - 权限：需 PAT，OAuth scope `secrets:write`；节流：≈5 分钟一次状态变更

**Step 3**：把新 signing key rotate 到 **In Use**：
- Dashboard 路径：该行 *Rotate key* 按钮
- API 路径：
  ```bash
  curl -sS -X PATCH \
    "https://api.supabase.com/v1/projects/$REF/config/auth/signing-keys/$KEY_ID" \
    -H "Authorization: Bearer $PAT" \
    -H "Content-Type: application/json" \
    -d '{"status":"in_use"}'
  ```

Rotate 成功后，它成为签发新 JWT 时 Supabase 侧的默认签名 key，公钥部分立即出现在：

```
https://zqdlpoiiihrtflyjljal.supabase.co/auth/v1/.well-known/jwks.json
```

（这个端点 Supabase 边缘缓存 10 分钟；PostgREST 每次收到 JWT 时按 `kid` 查缓存
的 JWKS 验签。）

**Step 4**：把**同一份**完整 JWK（含 `d`）写进 `.env.local` / Vercel env：

```env
SUPABASE_JWT_PRIVATE_JWK={"kty":"EC","kid":"3a18cf...","d":"...","crv":"P-256","x":"...","y":"..."}
```

⚠️ Vercel 允许多行字符串，但**建议把 JSON 压成单行**（不含换行）粘贴：
`cat jwk.json | jq -c`。粘完请**从本地磁盘删除 `jwk.json` 与 `ec-priv.pem`**，
防止误提交到 git（`.gitignore` 也顺手加一条 `*.pem` / `jwk.json`）。

**Step 5**：验证。用 `jose` 签一个 `role: service_role` + `exp: +5min` 的
JWT，`curl` 直连 PostgREST：

```bash
curl "$SUPABASE_URL/rest/v1/course_noporf?select=New_code&limit=1" \
  -H "apikey: $SB_PUBLISHABLE" \
  -H "Authorization: Bearer $ES256_JWT"
# 200 + JSON = 成功；401 = 签名不通过；403 = 签名通过但 role 不对
```

**信任模型说明**：`Import` 之后 Supabase 后端保管了一份我们的私钥副本。这与
「Create」流程（Supabase 自己生成、我们拿不到）相比：
- 泄漏面**并未变大**：Supabase 本来就掌管数据库、`sb_secret_*`、legacy
  `SUPABASE_JWT_SECRET`，能签任意 `service_role` JWT 是既定信任；
- 换来的能力：我们能在自家后端**按需签 15 min 短期 JWT** 下发给白名单浏览器，
  从而实现 §3.3 的核心诉求。
- 若哪天希望「Supabase 也不知道我们的私钥」，可以考虑改走「服务端全代理」
  （§3.3 方案 D，本期不做），或等 Supabase 支持 *upload public key only* 的
  能力（目前官方文档暂未提及）。

**关于 Supabase CLI**：本项目**只在 Step 1 用一次** CLI（也可以直接用方式 b 的
openssl 路径完全避开 CLI），后续 CI/CD 不会持续依赖它。Step 2b 的 Management
API 也是纯 `curl`，不依赖 CLI。

**PAT 事后处置**：Step 2b/3 跑完立刻回 <https://supabase.com/dashboard/account/tokens>
把这个 PAT *Revoke*。它的能力太大（scope `secrets:write` 相当于对整个组织都能
签发/轮换 signing key），不能长期挂在开发者机器上。

### 7.7 `lib/database/database.js` 兼容分支示意

```js
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL

// 前端：优先用新 publishable key，缺失时回落到 legacy anon
const publicKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default createClient(url, publicKey)

// 服务端：优先用新 secret key，缺失时回落到 legacy service_role
export const createServer = () => createClient(
  url,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
)
```

这样开发期只加了新变量就能生效；等未来正式停用 legacy，只需删掉旧变量、无需再改代码。

### 7.8 其它 Supabase 侧配置

1. **PostgREST 单请求 body 上限**：Supabase 默认 1 MB；批插入 chunk ≤ 500 一般安全。若某任务单行超过 2 KB，需下调 chunk。
2. **PostgREST 单请求返回上限**：默认 1000 行；`select` 拉全表用 `.range(offset, offset+999)` 循环翻页（§5.2 的 `selectAll` helper 已实现）。
3. **RPC 定义**：所有 `bulk_*` 函数用 `security definer` 且 `revoke ... from public, anon; grant ... to service_role;` 确保只有本方案的短期 JWT 能调。
4. **审计**：迁移完成后跑一次 `select tablename, rowsecurity from pg_tables where schemaname='public';` 确认 8 张目标表 `rowsecurity=true`。
5. **secret key 保管**：`sb_secret_*` 无 TTL、无 scope；一旦泄漏必须 Dashboard 生成新 key 并下线旧 key。建议为「服务端评论聚合更新」创建独立 secret key，与 `/update` 的短期 JWT 分离，方便定向轮换。
6. **JWT Signing Key 保管**：私钥 (`d`) 只放 Vercel env。如需轮换，重复 §7.6 的 Step 1~3 生成新 key，**在 Dashboard 上把新 key rotate 到 In Use、旧 key 保留成 Standby 一段时间**（旧 key 签的 JWT 15 min 内仍需可验证），期满后再 Revoke 旧 key。同时 Vercel env 一并切到新 JWK。

### 7.9 supabase-js 版本要求

- **当前项目**：`package.json` 声明 `"@supabase/supabase-js": "^2.38.4"`，本地实际解析安装的是 **2.94.1**。
- **能力对齐**：
  - `sb_publishable_...` / `sb_secret_...` 作为 `apikey` 传入：从 2.x 早期就兼容（这类 key 只是普通字符串，走 `apikey` header）。2.94.1 ✅。
  - `getClaims()`（本地验签，支持 asymmetric JWKS）：2.94.1 已内置（`node_modules/@supabase/auth-js/dist/module/GoTrueClient.d.ts` 里能查到）✅。
  - 对未识别 `sb_` 子类型的行为：早期版本会 `throw`，`supabase-js@2.110.6`（2026-07-15）修为 `warn`。为避免边界情况，**推荐升到 `^2.110.6+`**。
- **升级动作**：改 `package.json` 里的 `"@supabase/supabase-js": "^2.110.6"` 并 `npm install`。**没有破坏性 API 变化** —— PostgREST / Auth / Storage 客户端调用签名保持向后兼容；只是新版本对新 key 更加原生。
- **本方案不用 supabase-js 签 JWT**（签名走 `jose` 库），因此 supabase-js 版本主要影响：(a) `apikey` 是否原生识别 `sb_*` 前缀、(b) 是否能用 `getClaims()` 做本地 JWKS 验签。两项 2.94.1 都已具备，升到 2.110.6+ 是更稳妥的一步而非阻塞项。

### 7.10 面向未来：为什么本方案不怕 legacy 停支持

Supabase 的「legacy」实际上是**四个相互独立的组件**，未来会被分别下线；本方案与每一个的耦合关系如下：

| Legacy 组件 | Supabase 计划 | 本方案是否依赖 | 停支持时要做什么 |
|---|---|---|---|
| ① Legacy anon / service_role JWT（`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`） | ≥2026 年底前保留，之后 Dashboard 可 Disable | 仅作为 §7.7 fallback，**运行时不读**（新 key 环境变量存在即优先走新的） | 删掉 `.env.local` / Vercel 里对应变量即可，代码无需改 |
| ② Legacy JWT Signing Secret（HS256 `SUPABASE_JWT_SECRET`） | Dashboard 可 Revoke（一旦 ① 已 Disable） | **完全不依赖**。我们签短期 JWT 用的是自建 ES256 私钥 `SUPABASE_JWT_PRIVATE_JWK`，与 legacy secret 是 Supabase 里两条独立的 signing key 记录 | Revoke 即可，本方案无感 |
| ③ JWT 格式为 HS256 的 anon/service_role key（发到 PostgREST 时的验签算法） | 与 ① 同步下线 | 不涉及。新体系里我们的 ES256 短期 JWT 是通过 JWKS 公钥端点验签，`sb_publishable_*` / `sb_secret_*` 是 opaque token 由 Supabase 内部映射 | 无操作 |
| ④ `SUPABASE_JWT_SECRET` 作为通用「凭据签发密钥」的用途（自定义 JWT、Storage 签名等） | 官方推荐迁到 JWT Signing Keys | 我们已经在 §7.6 用「自建 + 导入」的 asymmetric key 完成了迁移 | 无操作 |

**具体结论**：
- 本方案**运行时**只读四个环境变量：`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` / `SUPABASE_JWT_PRIVATE_JWK` —— **全都是新体系**。
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` 与 `SUPABASE_SERVICE_ROLE_KEY` 只是 `lib/database/database.js` 里的 `|| fallback`，出现在 env 里就用、不出现就不用。
- `SUPABASE_JWT_SECRET` **从头到尾没进入代码路径**，Supabase 什么时候 Revoke 它，本项目都不受影响。
- 唯一会随 Supabase 迭代而需要维护的是「我们通过 *Import* 上传到 Supabase 的那把 ES256 签名密钥」—— 它属于新 signing keys 体系的一等公民，只要 asymmetric JWT 这条产品线在，它就在。

**结论一句话**：一旦 PR-0 上线完毕，就可以随时按 §7.5 的「未来关掉 legacy key」一节把 4 个 legacy 组件全部 Revoke，业务 0 感知。因此**不需要**在里程碑里为「SUPABASE_JWT_SECRET 停支持」预留额外工作。

---

## 八、环境变量清单

### 新增

```env
# —— 新 Supabase key 体系（本期采纳）——
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # 浏览器可见
SUPABASE_SECRET_KEY=sb_secret_...                          # 仅服务端；如需要，可创建多把

# —— asymmetric JWT signing（§7.6 生成、导入 Supabase、私钥存这里）——
SUPABASE_JWT_PRIVATE_JWK={"kty":"EC","kid":"...","d":"...","crv":"P-256","x":"...","y":"..."}
# 注意：一整段 JSON 压成单行；kid 必须与 Supabase Dashboard 上显示的一致

# —— /update 页专属 ——
ADMIN_USER_IDS=user_2abc,user_2xyz                         # Clerk user_id 白名单
UM_API_TOKEN=f5aaa86cc5b4424aa621538fceaab34f              # UM Open Data 授权头
```

### 保留（本期不动，未来可下线）

```env
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...                # legacy，作为 fallback
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...                    # legacy，作为 fallback
```

需在 Vercel Project → Settings → Environment Variables 分别为 Production / Preview / Development 配置。**先只加新的、不动旧的**，业务上线后再考虑清理 legacy。

---

## 九、目录/文件改动一览

新增：
- `app/update/page.tsx`
- `app/update/ui.tsx`（`"use client"`）
- `app/update/tasks/*.ts`
- `app/update/lib/{supabase-admin,checkpoint,excel,um-api}.ts`
- `app/api/admin/session-key/route.ts`
- `app/api/admin/um-proxy/route.ts`
- `app/api/admin/quick-sql/{reset-offered,set-offered}/route.ts`
- `lib/auth/admin-guard.ts`
- `lib/auth/issue-service-jwt.ts`
- `supabase/migrations/0000_enable_rls.sql`（§7.4）
- `supabase/migrations/0001_admin_bulk.sql`（§5.0 的 `bulk_update_*` RPC）
- `docs/update-page-plan.md`（本文件）
- `docs/rls-audit.md`（PR-5 巡检手册）

修改：
- `lib/database/database.js`：按 §7.7 加「新 key 优先、legacy 兜底」的 fallback 分支。
- `lib/database/get-course-info.ts`：把硬编码 UM Token 迁移到 `process.env.UM_API_TOKEN`。
- `app/api/comment/[code]/[prof]/route.tsx`：把 `prof_with_course.update()` 换成 `createServer()`（详见 §7.3）。
- `.env.local`：追加 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`SUPABASE_SECRET_KEY`、`SUPABASE_JWT_PRIVATE_JWK`；legacy 变量保留不动。
- `package.json`：
  - **升级** `@supabase/supabase-js` `^2.38.4` → `^2.110.6`（§7.9）
  - 新增依赖
    - `xlsx`（Excel 解析）
    - `idb-keyval`（IndexedDB 简化）
    - `jose`（用 ES256 私钥签发短期 JWT）
    - `unidecode`（同 Python `unidecode`）
    - `p-limit`（UM API 并发池，§5.1）
- `middleware.ts`：如需在中间件层拦截 `/update`、`/api/admin/*` 附加 CSRF/Origin 校验，可扩展 `matcher`。

---

## 十、里程碑（建议 4~5 个 PR）

**PR-0 · 新 key 接入 + RLS + 既有路由迁移（0.5~1 天，必须先做）**
- Supabase Dashboard 生成 `sb_publishable_...` 与 `sb_secret_...`（可以生 2 把 secret，一把服务端、一把 `/update`）
- 本地生成 ES256 密钥对 → 完整私钥 JWK 上传 Supabase（Dashboard *Create Standby Key → Import an existing key*；按钮不可见时走 §7.6 Step 2b 的 Management API `curl`）→ Rotate 为 In Use
- 在 `.env.local` / Vercel 追加新变量（含 `SUPABASE_JWT_PRIVATE_JWK`），**保留 legacy 变量**（详见 §8）
- `package.json` 升级 `@supabase/supabase-js` 到 `^2.110.6`，`npm install`
- `lib/database/database.js`：按 §7.7 加 fallback 分支
- `app/api/comment/[code]/[prof]/route.tsx`：`prof_with_course.update()` 改用 `createServer()`
- `supabase/migrations/0000_enable_rls.sql`（§7.4）
- `supabase/migrations/0001_admin_bulk.sql`（§5.0 的 `bulk_update_prof_with_course` 等 RPC）
- 按 §7.5 的 A→E 灰度上线，验证首页 / 详情 / 评论 / 投票在「新 key + RLS 已开」下均 200
- 用 curl（§7.6 Step 5）验证 ES256 短期 JWT 能通过 PostgREST 验签

**PR-1 · 基础设施（0.5 天）**
- `admin-guard`、`issue-service-jwt`
- `/api/admin/session-key`
- `/update/page.tsx` 空壳（只做鉴权 + 打印 userId）
- 修 UM Token 硬编码

**PR-2 · Excel 上传 & 快速任务（0.5 天）**
- 上传 UI、SheetJS 解析
- `/api/admin/quick-sql/{reset-offered,set-offered}`
- Task Runner 骨架（顺序执行、进度条）

**PR-3 · 浏览器直连主要任务（1~1.5 天）**
- `check-courses`、`add-time-location`、`add-prof-course`、`add-offer-schedule`
- `/api/admin/um-proxy`
- IndexedDB checkpoint

**PR-4 · 辅助任务（0.5 天）**
- `update-comment`、`import-pg-course`
- 日志窗口、错误重试、暂停/续跑

**PR-5 · 硬化（0.5 天）**
- 补一份 `docs/rls-audit.md`：说明如何跑 `select tablename, rowsecurity from pg_tables` 巡检
- Vercel 变量文档、README 补充「如何跑一次开学更新」

预估总工作量：**~3.5 人日**（含 PR-0）。

---

## 十一、安全 & 风险

| 风险 | 缓解 |
|---|---|
| 短期 JWT 泄漏 | 15 分钟过期；`ADMIN_USER_IDS` 明确白名单；页面禁用 `serviceWorker`/PWA 缓存 API 返回 |
| CSRF：非白名单用户偶然打到 `/api/admin/*` | 服务端一律返回 404；结合 Clerk `auth()` 校验 |
| Excel 中包含脏数据导致部分行失败 | 每行 `try/catch`；错误写入前端日志窗口，最后可下载 `errors.csv` |
| UM API 限流 / 502 | `/api/admin/um-proxy` 保留 5 次指数退避；任务级别再做一次退避 |
| 浏览器崩溃 / 断电 | IndexedDB checkpoint + 「续跑」按钮 |
| 大 update 打爆 Supabase 免费额度 | 提示管理员在跑之前查看 Dashboard usage；关键批量操作分 500/批 |
| Vercel 函数被大 payload 打爆 | 除 `set-offered` 上传数千课号（<1MB）外，其他大 payload 都不走服务端 |
| 现有 anon Key 已具备写权限 → 存量漏洞 | 上线 `/update` 前先做 Supabase RLS 修复（PR-5 前置） |
| 未来管理员离职 | `ADMIN_USER_IDS` 可即时改 Vercel 环境变量并 Redeploy |

---

## 十二、非目标（本期不做）

- 后台任务队列 / Serverless 长任务（QStash、Trigger.dev、Inngest）——留待需要「自动化定时更新」时再上。
- 多人协作、审计日志、变更审批工作流。
- 直接编辑单条数据的 CRUD 界面（本期仅做 Python 那套批量流程的等价物）。
- 移动端适配：`/update` 只按桌面浏览器体验设计。

---

## 十三、快速上手（写给管理员的操作手册）

1. 在 Vercel 设置 `ADMIN_USER_IDS`（登录一次拿到你的 `user_2...` ID）。
2. Supabase Dashboard → 复制 service_role JWT 与 JWT Secret → 写入 Vercel 环境变量。
3. 打开 `<site>/update`；未在白名单会看到 404。
4. 上传本学期 Excel（选对 Add/Drop 或 Pre-enrollment）。
5. 勾选 ①→⑥ 按顺序跑；如中途关掉浏览器，重开会自动提示续跑。
6. 完成后修改 Vercel 环境变量 `NEXT_PUBLIC_DATABASE_LAST_UPDATE` 并触发 redeploy（或调 `/api/admin/update-flag`，本期先手动）。
