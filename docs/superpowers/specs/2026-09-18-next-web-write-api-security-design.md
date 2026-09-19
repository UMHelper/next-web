# next-web 写接口安全与数据访问边界设计（Phase 1A）

> 状态：Draft，等待人工 review
> 日期：2026-09-18
> 关联文档：`docs/technical-optimization-audit.md`、`docs/update-page-plan.md`
> 后续实现计划：`docs/superpowers/plans/2026-09-18-next-web-write-api-security.md`

---

## 1. 背景

`next-web` 目前是 Next.js 14 App Router + Supabase 架构，Clerk 负责 Web 用户登录，iOS 客户端通过共享 HMAC 请求头访问只读 API。评论、回复、投票三个写接口已经能在生产使用，但它们的服务端边界存在一组互相放大的问题：

1. **写接口直接暴露 service role 能力**：
   - `app/api/reply/route.ts` 未鉴权、未做字段白名单，直接把客户端 JSON 交给 `supabaseAdmin.insert()`。
   - `app/api/vote/[comment_id]/route.ts` 未鉴权，`offset` 与 `created_by` 完全由客户端决定。
   - `app/api/comment/[code]/[prof]/route.tsx` 未鉴权，服务端信任客户端传入的 `verify` / `verify_account`，且没有 content、图片大小、MIME 类型等服务端限制。
2. **Supabase 权限边界不成立**：
   - `docs/update-page-plan.md` 曾记录旧 `.env.local` 中 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 与 `SUPABASE_SERVICE_ROLE_KEY` 完全相同；2026-09-18 已切换为 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY`，并清理旧变量。这不改变“数据库侧必须撤权”的结论。
   - `supabase/schema.sql` 没有 `ENABLE ROW LEVEL SECURITY`，也没有 `REVOKE`/`GRANT`；`get_comment_list`、`get_comment_page` 等函数默认给 `PUBLIC` 执行权限。
   - `get_comment_list`（`supabase/schema.sql:68`）没有过滤 `hidden`，任何能访问 Data API 的角色都能绕过前端过滤读隐藏评论。
   - `get_comment_page`（`supabase/migrations/20260812_comment_page_rpc.sql:73-87`）把全部 `vote_history.created_by` 和评论 `verify_account` 返回给客户端，任何持有 anon key 的人可以枚举“谁投了什么”。
3. **敏感的上游凭据硬编码**：
   - `lib/database/get-course-info.ts:77-83` 明文写死了 UM Open Data API 的 `Authorization` token，并开启 `SSL_OP_LEGACY_SERVER_CONNECT`。
4. **跨端身份模型缺失**：
   - Web 端回复/投票 UI 已要求 Clerk 登录，但 API 端没有 `auth()` 校验。
   - iOS 端使用客户端本地 UUID 作为 `created_by` / `verify_account`，本轮不引入设备级签发 token；Phase 1A 先通过 HMAC + 版本头 + 严格格式校验 + 限流降低滥用面，并在文档中明确其局限。

此外，工作区当前已有未提交的 `iosVersionGuard` 相关改动（`app/api/version/route.ts`、`lib/ios-version.ts`、多个 API 路由和 `.env.example`）。本设计必须保留并兼容这些改动，不重复实现。

## 2. 目标与非目标

### 2.1 目标

- **G1**：让 `service_role` 只存在于服务端，停止以 anon 身份执行任何数据库读写。
- **G2**：在 Supabase 侧启用 RLS，撤销 `PUBLIC`/`anon`/`authenticated` 对全部表与函数的默认权限，只保留服务端服务角色的访问能力。
- **G3**：三个写接口具备身份校验、字段白名单、格式与大小校验，并统一错误响应。
- **G4**：Web 写接口从 Clerk `auth()` 获取用户身份；iOS 写接口保留 `verifyIOSRequest` + `iosVersionGuard`，并对客户端身份做格式与限流约束。
- **G5**：评论页 RPC 不再向任意客户端返回全量投票人 ID；只返回聚合数据和“当前查看者自己的投票”。
- **G6**：移除硬编码 UM Open Data token，改由服务端环境变量提供。
- **G7**：为上述边界补单元测试、SQL 验证脚本和发布前检查清单。
- **G8**：修复与写路径直接相关的安全正确性问题：`get_comment_list` 隐藏评论泄漏、写接口缺少的 `body` 大小/字段校验。

### 2.2 非目标

- **N1**：不在本阶段做完整 UM Open Data 定时同步；本阶段只把 token 移出源码，并把页面直连降级为“带 tag 的服务端缓存 fallback”。
- **N2**：不在本阶段重做评论/投票 UI，不调整 `Masonry`、Timetable、搜索性能与包体（Phase 2）。
- **N3**：不在本阶段实现完整的缓存/ISR/Sitemap 治理（Phase 3）。
- **N4**：不在本阶段把 `any` 全部替换为生成的 Supabase 类型（Phase 4）。
- **N5**：不在本阶段引入 iOS 设备级密钥签发或 App Attest；iOS 匿名身份仍由 HMAC + UUID + 限流保护。
- **N6**：不在本阶段升级 Clerk 大版本；沿用当前 `@clerk/nextjs` 4.31.8 的 `authMiddleware` / `auth()` 能力。

## 3. 范围分解（Superpowers 路线图）

这是一个跨越多个独立子系统的优化请求。按 `superpowers:brainstorming` 的规则，应先拆分为独立子项目，每个子项目单独 spec → plan → implementation。本次只输出 **Phase 1A** 的 spec 与 plan。

| 阶段 | 主题 | 产出 |
|---|---|---|
| **Phase 1A（本 spec）** | 写接口安全、Supabase 最小权限、评论 RPC 隐私、硬编码 token | 安全与数据边界可验证 |
| Phase 1B | P0 正确性 bug：`reviews` params mutation、`ReviewNotice` render 副作用、Submit 状态/假成功、GE catalog 路由 | 独立 spec + plan |
| Phase 2 | SSR/渲染边界与包体：Masonry CSS columns、删除 bbs-updates 死代码、Timetable/MUI/Scheduler、SparklesText、评论聚合计算 | 独立 spec + plan |
| Phase 3 | 缓存/同步/Sitemap：UM API 定时同步、revalidate/tag、OpenNext incremental cache、OpenGraph | 独立 spec + plan |
| Phase 4 | 工程清理：类型、死代码、依赖审计、配置去重、CI 门禁 | 独立 spec + plan |

## 4. 当前事实与约束

- **框架**：Next.js 14 App Router，`app/api/**/route.ts` 为 Route Handlers。
- **认证**：
  - Web：`ClerkProvider` 已挂在 `app/layout.tsx`；当前没有 `authMiddleware`，Route Handler 里没有调用 `auth()`。
  - iOS：`lib/ios-auth.ts` 使用 `X-UM-Timestamp` + `X-UM-Signature`，有效期 5 秒；工作区新增 `lib/ios-version.ts` 与 `X-UM-App-Version` / `X-UM-App-Build`。
- **Supabase**：`@supabase/supabase-js` 客户端；`lib/supabase/shared.ts` 提供 browser/server/admin 三种工厂；实际所有数据库访问都发生在服务端。
- **数据库**：`supabase/schema.sql` + `supabase/migrations`；当前没有任何 RLS policy、`REVOKE` 或显式 `GRANT`。
- **测试**：项目当前没有测试框架，也没有 `test` script。Phase 1A 需要先引入 Vitest。
- **部署**：同时存在 `next build`（Vercel 风格）和 OpenNext/Cloudflare（`open-next.config.ts`、`wrangler.jsonc`）。本阶段不改变部署目标。
- **环境变量**（现有 + 本阶段新增）：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SECRET_KEY`
  - `UM_OPEN_DATA_TOKEN`（本阶段新增）
  - `UM_IOS_API_SECRET`
  - `UM_IOS_MIN_SUPPORTED_VERSION` / `UM_IOS_LATEST_VERSION` / `UM_IOS_UPDATE_URL`
- **已有未提交改动**：`iosVersionGuard` 相关文件与 `.env.example` 修改属于当前工作区基线，不能被本阶段覆盖；所有新增改动应基于该基线继续。

### 4.1 数据库迁移的执行方式（重要）

`supabase/migrations/*.sql` 只是版本化文件，**不会自动 apply 到目标数据库**。本计划的实施者必须在目标 Supabase Postgres 上直连执行 SQL，并在生产执行前后保留验证输出。

执行前提（二选一）：

- **推荐**：人工提供 `SUPABASE_DB_URL`（Postgres connection string，包含数据库密码；优先使用 Supabase Dashboard 的 **Session pooler** 地址，形如 `postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`）。实施者使用 `psql` 或 Node `pg` 直连执行。
  - 注意：Supabase 直连主机 `db.<project-ref>.supabase.co:5432` 在当前网络下只解析到 IPv6，连接超时；需要改用 Session pooler 的 IPv4 地址，或人工在 Dashboard 执行。
- **备选**：人工在 Supabase Dashboard / SQL Editor 中执行迁移，并把执行结果和 `scripts/verify-security-hardening.sql` 的输出回贴给实施者。

当前工作区的客观限制：

- 本机没有 `psql`，也没有 `supabase` CLI。
- `127.0.0.1:54321/54322` 没有本地 Supabase 在运行。
- `.env.local` 只有 REST URL 和 API key，没有数据库密码。
- 因此 **没有 `SUPABASE_DB_URL` / Supabase access token / Dashboard 权限，实施者无法执行或验证数据库迁移**。

### 4.2 人工操作 vs 实施者操作

**必须由人工完成（涉及 Dashboard / Secret / 生产权限）：**

1. 在 Supabase Dashboard 生成新的 publishable/anon key 与新的 secret/service_role key；旧 key 暂时保留。
2. 把新 key 配置到 Vercel / Cloudflare 的生产环境变量：
   - 服务端：`SUPABASE_SECRET_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - 前端可保留 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 但代码不再使用
3. 提供 `SUPABASE_DB_URL`，或者人工在 Dashboard 执行 SQL 并回贴输出。
4. 提供 `UM_OPEN_DATA_TOKEN`，并确认旧硬编码 token 已从 UM 侧轮换/失效。
5. 设置/确认新增环境变量：`UM_IOS_MIN_SUPPORTED_VERSION`、`UM_IOS_LATEST_VERSION`、`UM_IOS_UPDATE_URL`、`RATE_LIMIT_*`。
6. 在迁移前对生产数据库做一次备份或 snapshot。
7. 批准 spec，并确认可以冻结一个短窗口用于数据库迁移 + 前后端发布。
8. 将 `next-ios` 的新版本加入 `X-UM-Viewer-Id` 和新的 `get_comment_page` 返回结构；必要时提升 `UM_IOS_MIN_SUPPORTED_VERSION`。

**实施者可以完成（拿到上述权限后）：**

1. 用 `pg` / `psql` 连接 `SUPABASE_DB_URL`，按顺序执行 `supabase/migrations/20260918_*.sql`。
2. 执行 `scripts/verify-security-hardening.sql` 并断言失败数为 0。
3. 更新 `.env.example`、`cloudflare-env.d.ts`，但不会把真实 secret 写入仓库。
4. 实现并测试所有 Route Handler / 组件 / SQL 文件。
5. 运行 `npm run test`、`npm run lint`、`tsc --noEmit`、`npm run build`。
6. 提交 preprod 验证记录；生产 secret 的最终写入和 key 失效由人工点击/确认。

## 5. 关键设计决策

### D1：唯一的数据访问客户端是服务端 service role

**决策**：`lib/supabase/server.ts` 改为 re-export service role 客户端；`lib/database/**`、`app/sitemap.ts` 等所有服务端查询继续 import `supabaseServer`，但实际拿到的已是 service role。删除 `lib/supabase/browser.ts` 与 `createSupabaseBrowserClient()`；`lib/supabase/shared.ts` 只保留 `createSupabaseAdminClient()`。

**理由**：

- Web 端没有任何 `supabaseBrowser` 引用，浏览器直连 Supabase 不是当前功能的一部分。
- Clerk 用户身份不映射到 Supabase `auth.uid()`；用 RLS 策略无法在当前调用链里表达“仅评论作者可改自己的评论”。
- 把访问控制边界收敛到 Next Route Handler / Server Component，比同时维护两套 Supabase 身份模型更清晰。

**结果**：Supabase Data API 对 `anon` / `authenticated` 不再开放业务表；RLS 作为纵深防御。服务端必须自己完成输入校验和授权判断。

### D2：Supabase 最小权限迁移

**决策**：新增迁移 `supabase/migrations/20260918_security_hardening.sql`：

1. 对 `public` 全部表执行 `ENABLE ROW LEVEL SECURITY`。
2. `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;`
3. `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;`
4. `REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;`
5. 只给 `postgres` 与 `service_role` 重新授予业务需要的最小权限：
   - `service_role`：`SELECT, INSERT, UPDATE, DELETE` on `comment`, `vote`；`SELECT` on 其他公开读表；`USAGE, SELECT` on sequences；`EXECUTE` on 本阶段保留的 RPC。
6. 对 `get_comment_list`（旧函数）执行 `DROP FUNCTION`；对不再对外暴露的 `get_course_list_by_prof`、`get_offer_list_by_prof`、`get_prof_course_id`、`search_courses`、`search_instructors_with_courses` 先保留函数体，但只授予 `service_role` 执行权限。
7. 新增函数默认 `REVOKE ALL ... FROM PUBLIC`，仅显式授予 `service_role`。

**理由**：当前环境 anon 与 service role 同值，单靠“客户端不调用”不够；必须在数据库侧撤权，才能保证即使 key 泄漏也不能直接写库。

**注意**：该迁移是 breaking change——任何绕过 Next 服务端的 Supabase 直连都会失效。上线前必须确认：Web、iOS、脚本、`umeh-update` 都经过服务端 API 或使用 service role（服务端）。

### D3：身份模型

| 调用方 | 请求类型 | 身份校验 | 身份来源 |
|---|---|---|---|
| Web 浏览器 | 评论提交 | 已登录时 Clerk `authMiddleware` + `auth()`；未登录时允许匿名，按 IP 限流 | 已登录：`verify=1` + `userId`；匿名：`verify=0` + 空 `verify_account` |
| Web 浏览器 | 回复 / 投票 | Clerk `authMiddleware` + `auth()` | `userId`，服务端写入 `created_by` / `verify_account` |
| iOS | 评论 / 回复 | `verifyIOSRequest` + `iosVersionGuard` | 客户端 UUID，服务端只校验格式与限流 |
| iOS | 投票 | `verifyIOSRequest` + `iosVersionGuard` | 客户端 UUID，服务端只校验格式与限流 |
| iOS | 只读 API | `verifyIOSRequest` + `iosVersionGuard` | 无用户身份；评论 RPC 不返回 viewer vote，或仅返回客户端显式提交的高熵 UUID 自己的 vote |

**Web 鉴权实现**：
- 在 `middleware.ts` 中改用 Clerk v4 的 `authMiddleware`。保留现有 `/sign-in`、`/sign-up` 公共路由，matcher 覆盖页面与 `/api/(.*)`；`/api/(.*)` 在 middleware 层视为 public，避免未登录 API 请求被重定向成 HTML 登录页。
- 在 Route Handler 中调用 `auth()` 获取 `userId`；没有 `userId` 时返回 JSON 401。
- 不使用 `request.headers` 里的任何用户 ID。

**iOS 鉴权实现**：
- 继续复用 `lib/ios-auth.ts` 的 `verifyIOSRequest`。
- 继续复用工作区已有的 `iosVersionGuard`；共享写接口使用 `{ allowMissingVersion: true }`，避免 Web 浏览器被版本头拦截。
- `verify_account` / `created_by` 必须是 `^[0-9a-fA-F-]{36}$` 的 UUID（或 Clerk `user_...` 格式）。Web 不接受客户端提供的 ID；iOS 对 UUID 只做格式校验，不宣称强身份。

### D4：输入契约与字段白名单

新增 `lib/validation/`：

- `comment.ts`：`commentSubmissionSchema`（multipart 表单字段的解析与校验）。
- `reply.ts`：`replySubmissionSchema`（JSON）。
- `vote.ts`：`voteSubmissionSchema`（JSON）。
- `identity.ts`：`identityIdSchema`、`commentIdSchema`。
- `lib/api-response.ts`：统一的 `apiError(code, message, status, details?)` 与 `readJsonBody()` / `readFormData()` 大小限制。

写接口只接受白名单字段，其他字段一律丢弃或拒绝：

**评论提交 `/api/comment/[code]/[prof]` POST**：

| 字段来源 | 字段 | 规则 |
|---|---|---|
| URL 参数 | `code` | `^[A-Z]{4}\d{4}$`（统一大写） |
| URL 参数 | `prof` | 1-200 字符，禁止控制字符 |
| multipart | `attendance`, `pre`, `grade`, `hard`, `reward`, `assignment`, `recommend` | 数字 1-5，允许小数；必须有限 |
| multipart | `content` | 1-2000 字符；服务端 trim |
| multipart | `image` | 可选；仅 `image/jpeg`、`image/png`、`image/webp`；最大 5 MB；服务端检查 `File.size` 与 `file.type` |
| multipart | `verify` / `verify_account` | 不接受客户端值；由服务端身份派生；即使客户端传入也忽略 |

**回复 `/api/reply` POST**：

- 请求体只允许 `replyto`（数字）与 `content`（1-250 字符）两个白名单字段。
- 服务端根据 `replyto` 读取父评论，必须存在；从父评论派生 `course_id`、`attendance`、`pre`、`grade`、`hard`、`reward`、`recommend`、`assignment`、`result`。
- 服务端派生 `pub_time`、`verify`、`verify_account`；不接受客户端传入这些字段。
- `comment` 表的非空分数列没有默认值，因此不能直接只插入 `course_id`/`content`；复制父评论分数是现有数据模型的兼容做法，但必须由服务端读取，不能信任客户端 JSON。

**投票 `/api/vote/[comment_id]` POST**：

- 白名单只允许 `offset`（`-1 | 0 | 1`）与 `emoji`（仅允许 `REACTION_EMOJI_LIST` 中的值，且 `offset=0` 时必填）。
- `comment` 必须等于路径参数 `comment_id`。
- `created_by` 不接受客户端值；Web 从 Clerk `userId` 取，iOS 从受 HMAC 保护的客户端 UUID 取。

### D5：写接口限流

新增 Postgres 限流表与 RPC：

- 表：`public.request_rate_limits(key text primary key, window_started_at timestamptz not null, hit_count integer not null)`
- RPC：`public.consume_rate_limit(target_key text, window_seconds integer, max_hits integer) returns table(allowed boolean, remaining integer, reset_at timestamptz)`
- 仅授予 `service_role` EXECUTE。

服务端 key 规则：

- Web：`web:{userId}:{action}`
- iOS：`ios:{verifyAccount}:{action}`
- 兜底：`ip:{request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? 'unknown'}:{action}`

限额通过环境变量配置，缺省值为：评论 `RATE_LIMIT_COMMENT_PER_HOUR=10`、回复 `RATE_LIMIT_REPLY_PER_HOUR=30`、投票 `RATE_LIMIT_VOTE_PER_HOUR=120`。被限流返回 429 + `Retry-After`。

### D6：评论 RPC 隐私边界

修改 `get_comment_page`（新迁移覆盖原函数）：

- 参数新增 `target_viewer_id text default null`。
- 返回列新增：
  - `upvote_count integer`
  - `downvote_count integer`
  - `emoji_counts jsonb`（形如 `[{"emoji":"👍","count":2}]`）
- `vote_history` 继续保留，但只包含 `v.created_by = target_viewer_id` 的行；`target_viewer_id` 为 null 时返回空数组。
- 不再返回原始 `verify_account`；改为返回 `avatar_seed`（SQL 中使用 `md5(verify_account)` 生成），客户端用 `avatar_seed` 做 emoji/头像计算，无法还原原始 Clerk/iOS ID。
- `comment`/`reply` 内容仍返回。

因此 `Comments` / `CommentCard` 的 `HashEmojiAvatar` 输入从 `verify_account` 改为 `avatar_seed`；如果 SQL 返回 null，客户端回退为匿名头像。

新增 `get_review_comment_page` 的接入层 `getComentListByCourseIDAndPage(courseId, page, viewerId?)`，其中 `viewerId` 由 Route Handler 决定：

- Web：`auth().userId`。
- iOS：`request.headers.get('x-um-viewer-id')`，必须匹配 UUID 格式；未提供则 `null`。

旧 `get_comment_list` 迁移中直接删除；`lib/database/get-comment-list.ts` 删除未使用的 `getCommentList` / `getCommentNumber` / `getVoteHistory` / `getReplyByCommentIDList`，只保留分页读取。

### D7：硬编码 token

- 删除 `lib/database/get-course-info.ts:82` 的字面量，改为 `process.env.UM_OPEN_DATA_TOKEN`。
- 保留 `unstable_cache` 返回，不改变现有 fallback 行为。
- 不添加新的日志输出 token。
- 该任务只做 token 迁移；完整的 UM API 定时同步留给 Phase 3。

## 6. 组件与文件规划

| 文件 | 动作 | 职责 |
|---|---|---|
| `lib/supabase/server.ts` | Modify | 改为 re-export `supabaseAdmin`；所有服务端代码继续使用现有 import 路径 |
| `lib/supabase/shared.ts` | Modify | 删除 browser/server anon 工厂，只保留 `createSupabaseAdminClient()` |
| `lib/supabase/browser.ts` | Delete | 已无引用 |
| `lib/validation/comment.ts` | Create | 评论提交 schema 与 multipart 解析 |
| `lib/validation/reply.ts` | Create | 回复 schema |
| `lib/validation/vote.ts` | Create | 投票 schema |
| `lib/validation/identity.ts` | Create | UUID / viewer id 格式校验 |
| `lib/api-response.ts` | Create | 统一错误响应与请求体大小读取 |
| `lib/api-auth.ts` | Create | `requireClerkUserId()`、`getIOSViewerId()`、限流调用封装 |
| `lib/rate-limit.ts` | Create | 调 `consume_rate_limit` RPC |
| `middleware.ts` | Modify | 接入 Clerk v4 `authMiddleware`，保留现有公共路由 |
| `app/api/reply/route.ts` | Modify | 鉴权 + schema + 白名单 + 服务端身份 |
| `app/api/vote/[comment_id]/route.ts` | Modify | 鉴权 + schema + 白名单 + 服务端身份 |
| `app/api/comment/[code]/[prof]/route.tsx` POST | Modify | 鉴权 + 大小限制 + schema + 服务端身份 |
| `lib/database/get-comment-list.ts` | Modify | 新 RPC 签名与 viewer id |
| `components/comments.tsx` | Modify | 使用聚合字段，不再对全部 vote_history 扫描 |
| `components/comment-card.tsx` | Modify | 使用 viewer vote 字段判断自己的投票 |
| `lib/database/get-course-info.ts` | Modify | token 改环境变量 |
| `supabase/migrations/20260918_security_hardening.sql` | Create | RLS、REVOKE/GRANT、限流表、RPC 隐私边界、旧函数清理 |
| `tests/**` | Create | Vitest 单元测试 |
| `scripts/apply-sql.mjs` | Create | 用 `pg` + `SUPABASE_DB_URL` 直连执行 SQL 文件；不依赖 `psql` / Supabase CLI |
| `scripts/verify-security-hardening.sql` | Create | 迁移后验证 SQL |

## 7. 数据流

### 7.1 评论提交

```
Browser
  → POST /api/comment/[code]/[prof] (multipart)
  → middleware authMiddleware
  → requireClerkUserId()  // 401 if none
  → parse & validate form (size/type/schema)
  → consumeRateLimit(`web:${userId}:comment`)
  → supabaseAdmin.rpc('insert_comment_and_refresh_prof_stats', { ..., verify_account: userId })
  → 200
```

iOS 同路径改为：

```
iOS
  → POST /api/comment/[code]/[prof]
  → verifyIOSRequest + iosVersionGuard(allowMissingVersion:true)
  → getIOSViewerId() // X-UM-Viewer-Id, UUID
  → validate form
  → consumeRateLimit(`ios:${viewerId}:comment`)
  → supabaseAdmin.rpc(...)
  → 200
```

### 7.2 回复

```
POST /api/reply (JSON)
  → auth/Clerk or iOS
  → replySubmissionSchema
  → 校验父评论存在且 replyto 合法
  → consumeRateLimit
  → supabaseAdmin.insert(...白名单字段...)
```

### 7.3 投票

```
POST /api/vote/[comment_id] (JSON)
  → auth/Clerk or iOS
  → voteSubmissionSchema
  → 校验 body.comment === params.comment_id
  → consumeRateLimit
  → supabaseAdmin.insert({ comment_id, offset, emoji, created_by: serverIdentity })
```

### 7.4 评论页读取

```
GET /reviews/[code]/[...prof]/page.tsx
  → auth().userId // Web; null for anonymous
  → getComentListByCourseIDAndPage(profId, page, userId)
  → supabaseAdmin.rpc('get_comment_page', { target_viewer_id: userId })
  → Comments 使用 upvote_count / downvote_count / emoji_counts
  → EmojiVote 使用 vote_history（仅自己的 vote）
```

## 8. 错误模型

所有写接口统一 JSON：

```json
{ "error": { "code": "rate_limited", "message": "Too many requests", "details": { "retryAfter": 3600 } } }
```

| 状态 | code | 场景 |
|---|---|---|
| 400 | `invalid_request` | schema 校验失败、字段缺失 |
| 401 | `unauthorized` | 未登录、HMAC 失败 |
| 403 | `forbidden` | 身份存在但无权限 |
| 404 | `not_found` | 评论/父评论不存在 |
| 409 | `conflict` | 重复投票等唯一约束冲突 |
| 413 | `payload_too_large` | body 或图片超限 |
| 426 | `client_version_unsupported` | iOS 版本过低 |
| 429 | `rate_limited` | 限流 |
| 500 | `internal_error` | 未预期错误；响应不包含 DB 原始 message |

## 9. 测试策略

### 9.1 单元测试（Vitest，node 环境）

新增 `vitest` devDependency 与 `vitest.config.ts`：

- `tests/validation/*.test.ts`：评论/回复/投票 schema 的合法与非法输入，包括 NaN、越界、超长、非法 emoji、非法 UUID。
- `tests/api-auth.test.ts`：mock `@clerk/nextjs/server` 的 `auth()`；验证 `requireClerkUserId()` 返回/抛错；mock `verifyIOSRequest` 验证 iOS viewer id 读取。
- `tests/api/reply.test.ts`、`tests/api/vote.test.ts`、`tests/api/comment-post.test.ts`：mock `supabaseAdmin`、`consumeRateLimit`、`auth`，使用真实的 `Request` 对象调用 Route Handler，断言：
  - 未鉴权返回 401；
  - 非法字段被拒绝；
  - 传入伪造的 `verify_account` / `created_by` 被忽略；
  - 超限 body 返回 413；
  - 成功路径写入的 payload 是白名单后的字段。
- `tests/api/get-comment-page.test.ts`：mock `supabaseAdmin.rpc`，断言 viewer id 被透传、聚合字段进入组件数据。

### 9.2 SQL 验证

新增 `scripts/apply-sql.mjs` 与 `scripts/verify-security-hardening.sql`；在目标库或预发库通过 `SUPABASE_DB_URL` 直连执行，不使用 `supabase db reset`：

1. 查询 `pg_class.relrowsecurity`，断言所有 `public` 表为 true。
2. 查询 `information_schema.role_table_grants`，断言 `anon` / `authenticated` 在业务表上没有 DML 权限。
3. 查询 `pg_proc.proacl`，断言 `get_comment_page`、`consume_rate_limit` 等函数只授予 `service_role`。
4. 以 `anon` 角色执行 `select * from comment` 与 `select * from vote`，断言 permission denied。
5. 调用 `get_comment_page(..., target_viewer_id)`，断言不同 viewer 只看到自己的 vote_history，聚合计数正确。

### 9.3 工程门禁

- `npm run test`
- `npm run lint`
- `node node_modules/typescript/bin/tsc --noEmit`
- `npm run build`
- 部署后 smoke：未登录评论返回 401；伪造 `verify_account` 不生效；重复投票返回 409；隐藏评论不出现在 `get_comment_page`；评论页只显示自己的 emoji 高亮。

## 10. 迁移与发布顺序

1. **准备环境**：
   - 生成真正独立的 publishable/anon key 与 secret/service_role key；先不要删除旧 key。
   - 配置 `UM_OPEN_DATA_TOKEN`，确认 token 只在服务端可见；`NEXT_PUBLIC_` 前缀不得出现该 token。
2. **数据库直连迁移（必须由实施者在目标库执行）**：
   - 人工提供 `SUPABASE_DB_URL`，或人工在 Dashboard 执行 SQL。
   - 迁移前备份；按顺序执行 `20260918_security_hardening.sql`、`20260918_rate_limit.sql`、`20260918_get_comment_page_privacy.sql`。
   - 执行 `scripts/verify-security-hardening.sql` 并保存输出。
3. **本地/预发验证**：在预发库同样直连执行迁移；跑 `npm run test` + `npm run build`；smoke 所有公开页面、评论提交、回复、投票、iOS 只读 API。
4. **数据库撤权**：确认所有调用方已走服务端后，执行 `REVOKE`/RLS 迁移；如果预发已验证，生产按同一 SQL 顺序执行。
5. **轮换凭据**：观察 24 小时无异常后，失效旧 anon/service_role key 和旧 UM token。
6. **回滚策略**：
   - 应用回滚：保留旧 Route Handler 版本镜像。
   - 数据库迁移是 forward-only；如需回滚，需人工直连执行单独的 `20260918_security_hardening_rollback.sql`（恢复旧 grant 与旧 `get_comment_page` 签名）。
   - 由于 RPC 返回结构变化，回滚必须同时回滚 Web / iOS 客户端读取逻辑。

## 11. 风险与缓解

| 风险 | 缓解 |
|---|---|
| `authMiddleware` 接入后公共页面被重定向到登录 | 在所有公开 Route Handler 外层先以 `publicRoutes` 配置放行；上线前逐路由 smoke |
| 撤权后仍有直连 Supabase 的内部脚本失效 | 发布前 grep 全部仓库与 `umeh-update`，确认没有 anon 直连；改成 Next API 或 service role |
| `get_comment_page` 返回结构变化导致 iOS 旧版本显示异常 | 现有 `iosVersionGuard` 基础上提升 `UM_IOS_MIN_SUPPORTED_VERSION`；旧客户端收到 426；Web 与本阶段同时改造 |
| RLS/REVOKE 迁移误伤公共只读表 | 迁移只撤 `anon`/`authenticated`；服务端 service role 不受影响；先在本地跑全站 smoke |
| 限流 RPC 成为热点/锁竞争 | key 按用户+action 分散；窗口短、行数小；后续可迁移到 Cloudflare/KV 或 Redis |
| Clerk v4 的 `authMiddleware` 与当前自定义 middleware 冲突 | 用单一默认导出合并；保留 `x-pathname` 逻辑到 helper 或删除（当前无 reader） |

## 12. 验收标准

- **AC1**：`lib/supabase/browser.ts` 不存在；项目中不再有浏览器端 Supabase 客户端导入。
- **AC2**：所有服务端数据库调用使用 service role；Supabase 迁移执行后 `anon` / `authenticated` 不能 `SELECT` / `INSERT` / `UPDATE` / `DELETE` 任何业务表。
- **AC3**：三个写接口在未登录（Web）或 HMAC 失败（iOS）时分别返回 401；伪造 `verify_account` / `created_by` 不会进入数据库。
- **AC4**：评论提交 body > 5 MB 返回 413；图片 MIME/大小不合法返回 413/400；`content` 超过 2000 字符返回 400。
- **AC5**：触发限流时返回 429，且在窗口内不能继续写入。
- **AC6**：`get_comment_page` 不再返回非当前 viewer 的 `created_by`；`get_comment_list` 不存在；隐藏评论无法通过任何 RPC 读取。
- **AC7**：`lib/database/get-course-info.ts` 中不存在 `f5aaa86cc5b4424aa621538fceaab34f`；token 来自 `UM_OPEN_DATA_TOKEN`。
- **AC8**：`npm run test`、`npm run lint`、`tsc --noEmit`、`npm run build` 全部通过。
- **AC9**：`docs/superpowers/plans/2026-09-18-next-web-write-api-security.md` 中的每个任务都能独立测试并提交。
- **AC10**：三个 `20260918_*.sql` 迁移已在目标数据库由实施者直连执行，且 `scripts/verify-security-hardening.sql` 输出失败数为 0；不能依赖 `supabase db push`、`db reset` 或任何自动应用机制。

## 13. 后续 Phase 摘要

- **Phase 1B（正确性）**：`reviews` 页面不要 `params.prof.pop()`；`ReviewNotice` 移到 `useEffect`；Submit 页 `try/finally` + `res.ok`；GE catalog 常量统一。
- **Phase 2（性能）**：Masonry 改 CSS columns；删 `BBSAd`/bbs-updates 死代码；Timetable 懒加载 scheduler、移除 MUI；SparklesText CSS 化；评论投票单次聚合。
- **Phase 3（缓存/同步）**：UM API 定时同步入库；`unstable_cache` + tag；评论写后 `revalidateTag`；OpenNext incremental cache；Sitemap 单查询 + 真实 lastModified。
- **Phase 4（工程）**：Supabase 生成类型、清除 any、死代码/依赖审计、Tailwind/tsconfig/next.config 去重、CI 门禁。
