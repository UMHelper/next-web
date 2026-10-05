# UMHelper GPT 插件设计

> 状态：Design approved；实施计划见 `../plans/2026-10-05-umhelper-mcp-plugin.md`
> 日期：2026-10-05
> 产品名称：What2Reg @ UM
> 目标载体：ChatGPT 与 Codex 公共插件目录
> 部署方式：在现有 `next-web` Cloudflare/OpenNext 应用中提供受保护的远程 MCP 服务

## 1. 背景

UMHelper 已经提供课程、教授评价和课表数据，但用户目前必须通过网站搜索、进入详情页并自行组合信息。插件的目标是让澳门大学学生直接用自然语言完成选课查询，同时把事实依据链接回 UMHelper。

本项目已有 Clerk 账号体系、Supabase 数据层、请求限流和稳定的网站详情 URL。插件复用这些能力，不新建用户体系，不允许模型直接访问数据库，也不通过一个新的匿名 REST API 暴露业务数据。

仓库里已有一份站内 AI 对话助手设计 `2026-09-21-next-web-ai-assistant-design.md`。本插件与该设计相互独立：插件由 ChatGPT 或 Codex 负责模型推理，UMHelper 只提供受认证的 MCP 工具，因此本期不实现 `/assistant`、`/api/chat`、模型供应商接入、对话历史或 SQL 逃生舱。

## 2. 目标与非目标

### 2.1 目标

- **G1**：发布一个可被 ChatGPT 与 Codex 安装的公共插件。
- **G2**：首次使用时通过现有 Clerk 账号完成 OAuth 2.1 授权。
- **G3**：所有业务工具调用都要求有效 Bearer Token 和 `umhelper:read` scope；匿名请求不能读取业务数据。
- **G4**：首版提供课程、教师、公开评价和开课时间的只读查询。
- **G5**：工具直接复用服务端数据访问层，不调用或包装现有 `/api/*` 路由。
- **G6**：所有工具只返回显式白名单字段，并设置固定的行数、正文长度和响应体积上限。
- **G7**：事实性结果携带 UMHelper 详情页链接，便于用户核验。
- **G8**：MCP 工具元数据、OAuth 行为、错误语义和发布材料满足公共目录审核要求。
- **G9**：继续通过现有 Vitest、Next.js build 和 OpenNext Cloudflare build。

### 2.2 非目标

- **N1**：不提交评价、回复、投票、举报或编辑课程数据。
- **N2**：不创建、修改、分享或删除个人课表。
- **N3**：不提供通用 SQL、Supabase 查询、表名、字段名、任意 URL 抓取或批量导出工具。
- **N4**：不返回用户资料、邮箱、Clerk metadata、评论者身份、隐藏内容、图片或管理员备注。
- **N5**：不实现站内聊天页面、模型调用、对话历史、RAG 或向量搜索。
- **N6**：首版不提供 MCP App 自定义界面或 Extension；结果直接展示在对话中。
- **N7**：不改变网站公开页面的可访问性，也不把 OAuth discovery 元数据当作业务秘密。
- **N8**：本设计不重构现有 iOS HMAC、管理员或网页会话鉴权方案。

## 3. 核心决策

### 3.1 MCP 服务与网站同仓部署

MCP 服务位于 `next-web`，由现有 OpenNext Worker 一同部署。这样可以复用 Clerk、Supabase、缓存、限流、站点 URL 构造和日志设施，并避免复制业务规则。

独立 Worker 是兼容性回退方案，不是首版架构。如果实施早期的最小路由验证证明所选 MCP Route Handler 无法在当前 OpenNext/Cloudflare 运行时工作，必须停止并更新本设计，而不是悄悄拆出第二套服务。

### 3.2 MCP 工具不经过现有 REST API

工具处理器调用专用的 `lib/mcp/*` 适配层，适配层再调用 `lib/database/*` 或现有 Supabase RPC。它们不得通过 `fetch("/api/...")` 访问本应用。

这项约束保证：

- MCP 的权限不依赖 cookie 或 iOS 共享密钥；
- 不会因为公开网站路由或 middleware 配置而绕过 OAuth；
- 工具的字段白名单、限流和输出上限可以独立测试；
- 以后修改 REST API 不会意外改变插件契约。

### 3.3 首版不提供 SQL 工具

公共插件的输入由模型生成。即使数据库角色只读，通用 SQL 仍会扩大枚举、批量读取、复杂查询和资源消耗风险。首版只提供五个语义明确的策展工具。课程比较由模型调用多个有界工具后完成。

## 4. 架构

```text
ChatGPT / Codex
  │
  │  Clerk OAuth 2.1 Authorization Code + PKCE
  ▼
POST /mcp  (Authorization: Bearer <token>)
  ├─ 验证 token、audience/resource、有效期与 umhelper:read scope
  ├─ 提取 Clerk userId
  ├─ 按 userId + 工具名限流
  ├─ Zod 校验工具参数
  ▼
lib/mcp/tools/*
  ├─ search_catalog
  ├─ get_course
  ├─ get_instructor
  ├─ get_course_reviews
  └─ get_course_sections
  ▼
lib/mcp/data/*
  ├─ 调用 lib/database/* 或现有受控 Supabase RPC
  ├─ 字段投影、数量限制、正文截断、响应体积检查
  └─ 使用 lib/site.ts 生成 umeh.top 引用
  ▼
MCP structuredContent + 简短文本摘要
```

每个单元只有一项职责：

| 单元 | 职责 |
| --- | --- |
| `app/mcp/route.ts` | Streamable HTTP、认证接入、请求上下文与协议响应 |
| `app/.well-known/openai-apps-challenge/route.ts` | OpenAI 发布域名验证；仅返回 portal 生成的精确 challenge token |
| `app/.well-known/oauth-protected-resource/mcp/route.ts` | MCP protected resource metadata 与 CORS preflight |
| `app/.well-known/oauth-authorization-server/route.ts` | 兼容旧客户端的 Clerk authorization metadata 与 CORS preflight |
| `lib/mcp/server.ts` | 注册服务器信息、instructions 和五个工具 |
| `lib/mcp/auth.ts` | 统一读取并断言 Clerk OAuth 身份与 scope |
| `lib/mcp/rate-limit.ts` | MCP 专用限流键、档位和错误映射 |
| `lib/mcp/schemas.ts` | 工具输入与公开输出的 Zod schema |
| `lib/mcp/data/*` | 查询、字段白名单、截断与站内引用 |
| `lib/mcp/errors.ts` | 稳定错误码、用户可读消息和日志分类 |

文件可以在实施计划中按仓库现有习惯合并，但协议、认证、数据投影不得塞进同一个大型 Route Handler。

## 5. 认证与授权

### 5.1 Clerk OAuth

Clerk 作为授权服务器，MCP 路由作为资源服务器。使用 Authorization Code Flow + S256 PKCE，并启用 Clerk 的 CIMD 支持。首版不启用 DCR，ChatGPT 与 Codex 通过其 HTTPS Client ID Metadata Document 接入。Clerk 已有账号登录与注册页面继续作为用户入口。

MCP 资源标识使用生产端点 `https://umeh.top/mcp`。生产构建里它是编译期常量;仅 `next dev` 会从请求派生 origin,让本地 OAuth 与本地 Clerk 实例自洽(见 plan「固定边界」)。实现必须验证：

- 签名来自配置的 Clerk instance；
- token 未过期且尚未生效时间有效；
- token 能解析出非空 Clerk `userId`；
- scope 包含 `umhelper:read`。

不能只解码 JWT 而不验证签名、issuer 和有效期。

**audience/resource 的归属（实施修正，2026-10-05）**：`@clerk/nextjs` 的 `auth()` 只接受 `acceptsToken`，既不提供 `audience` 选项，也不暴露 JWT claims；Clerk 官方 helper `verifyClerkToken` 同样不校验 audience。因此资源服务器采用 Clerk 官方路径（`auth({ acceptsToken: "oauth_token" })` + `verifyClerkToken`）完成签名、issuer 与有效期校验，工具边界再校验非空 `userId` 与 `umhelper:read`。

**补充事实（2026-10-05 复核）**：Clerk Backend API 的 `oauth_application` 对象（`GET /v1/oauth_applications`）字段为 name / client_id / client_uri / public / dynamically_registered / consent_screen_enabled / pkce_required / device_authorization_grant_enabled / scopes / redirect_uris / 各 endpoint URL，**没有 audience 或 resource 字段**；Clerk 的 authorization server metadata 同样不广播 resource indicator 支持。因此不存在"在 Dashboard 绑定 audience/resource"的开关，**服务端也不校验 audience**；客户端按 RFC 8707 发送的 `resource` 参数不参与鉴权。实际生效的访问控制是：Clerk token 签名/issuer/有效期 + `umhelper:read` scope + 非空 `userId` + 五个只读工具 + 双档限流。

### 5.2 HTTP 行为

- `POST /mcp` 是唯一的生产 MCP 业务入口，使用无状态 Streamable HTTP。
- 首版不建立服务器主动 SSE 会话；`GET /mcp` 与 `DELETE /mcp` 返回 `405 Method Not Allowed`，且不执行业务查询。
- 未携带或携带无效 Token 时返回 HTTP `401`，并通过 `WWW-Authenticate` 指向 protected resource metadata。
- Token 有效但缺少 scope 时返回 `403`。
- OAuth metadata 路由允许匿名 `GET` 和所需的 `OPTIONS`。这些端点只公开 issuer、authorization endpoint、token endpoint、注册能力与 scopes，不返回业务数据。
- `/mcp` 不接受 query-string API key、cookie 会话、iOS HMAC 或自定义长期共享密钥作为回退认证。

### 5.3 双重检查

认证中间件在 HTTP 边界阻止匿名访问。每个工具执行前，`lib/mcp/auth.ts` 再断言认证上下文与 `umhelper:read` scope。缺少上下文时工具必须失败，不能退化为匿名查询。

### 5.4 与现有 middleware 的关系

当前 middleware 将 `/api/(.*)` 列为可抵达的 public route，具体 API 在各自 Route Handler 中执行管理员、iOS HMAC、Clerk 会话或写身份检查。新 `/mcp` 不加入通用 public API 规则来替代鉴权；OAuth metadata 路由公开，业务入口由 MCP 认证包装器保护。

### 5.5 OpenAI 域名验证

生产站点必须提供匿名 `GET https://umeh.top/.well-known/openai-apps-challenge`，供 OpenAI 在连接 MCP 服务时验证域名控制权。该端点只承担域名验证，不属于 MCP 业务 API，也不能读取任何课程、评价、用户或数据库数据。

OpenAI submission portal 生成的精确 challenge token 存入 Cloudflare 生产 secret `OPENAI_APPS_CHALLENGE_TOKEN`。Token 不写入 Git、插件 ZIP、客户端 bundle、普通日志或错误详情。Route Handler 的行为固定为：

- 配置存在时返回 HTTP `200`、`Content-Type: text/plain; charset=utf-8`，响应正文是环境变量中的精确 token；不包装为 JSON、不添加标签或说明文字；
- 设置 `Cache-Control: no-store`，避免 token 轮换后继续命中旧值；
- 配置缺失或为空时返回 `404`，不能以空正文 `200` 假装验证成功；
- `POST`、`PUT`、`PATCH`、`DELETE` 等非 `GET` 方法返回 `405`；
- middleware 必须允许 OpenAI 未登录访问这个精确路径，因为域名验证发生在 Clerk OAuth 之前。

challenge token 按协议就是可被公开读取的所有权证明，因此不能把它当作业务 API 密钥。业务数据仍只有 `/mcp` 能访问，并继续强制 Clerk Bearer Token、audience/resource 与 `umhelper:read` scope。验证完成后保留该路由；若 portal 轮换 token，只更新 Cloudflare secret 并重新部署，不改代码。

### 5.6 OAuth 同意页（自建，2026-10-05 实施修正）

Clerk 的默认同意页托管在 Account Portal。实测该流程在本实例上**无法完成**：

```
clerk.umeh.top/oauth/authorize → /oauth/authorize/continue
  → accounts.<instance-domain>/sign-in?redirect_url=…/oauth-consent?…
  → sign-in 页在用户已登录（自动跳转）时丢弃 redirect_url，改送实例 Home URL
    （dev 是 /default-redirect，生产是 https://www.umeh.top/）
```

后果是授权永远到不了客户端的 `redirect_uri`，Clerk 只记录 `oauth_authorization.failed`（`oauth_client_id` 是真实 client，`reason` 为 Clerk 内部错误码 `oauth2idp_patch_fosite_state_non_invalid_state_error`）。**该失败与我们侧无关**：metadata、discovery、client_id、redirect_uri 注册、scopes、PKCE 已逐项验证，且用参数完全可控的自建 PKCE 客户端复现同样结果。

因此改用 Clerk 文档「Set up a custom OAuth consent page」的推荐路径，把同意页建在本站：

- 路由 `app/oauth-consent/[[...index]]/page.tsx`，渲染 `@clerk/nextjs` 的 `<OAuthConsent />`；
- 只对已登录用户渲染（`auth()` + `redirectToSignIn()`）；
- **必须**设置 `referrer: "strict-origin-when-cross-origin"`：同意表单 POST 到 Clerk 的 Frontend API，否则部分跨源提交会带 `Origin: null` 而被 Clerk 拒绝；
- 页面刻意保持最小：不含导航、账号菜单或登出控件，避免把用户带离授权流程。

人工配置（属 Task 12）：**Paths → Component paths → OAuth consent** 填 `https://umeh.top/oauth-consent`（生产必须是 HTTPS 且与实例同注册域；dev 实例填 `/oauth-consent`）。所有可授权应用的 consent screen 保持开启。

## 6. 工具契约

所有工具都声明：

- `readOnlyHint: true`
- `destructiveHint: false`
- `openWorldHint: false`
- 无交易或商业行为

工具描述必须明确说明数据来自 UMHelper，并提醒模型在事实性回答中保留返回的引用链接。所有字符串输入先 `trim`；课程码大写；教师名折叠连续空白并按现有规则处理 `/`。

### 6.1 `search_catalog`

用途：按课程码、课程名称或教师姓名搜索，并可按学院或系过滤。

输入：

```ts
{
  type: "course" | "instructor";
  query?: string;       // 提供时 1..80
  faculty?: string;     // 1..40
  department?: string;  // 1..80
  limit?: number;       // 1..10，默认 10
}
```

课程结果白名单：`courseCode`、`titleEn`、`titleZh`、`faculty`、`department`、`credits`、`isOffered`、`url`。

教师结果白名单：`name`、`courseCount`、`url`。不得返回 RPC 的 `total_count` 或数据库内部标识。

空查询不触发全表浏览。`query`、`faculty`、`department` 至少提供一个；只提供过滤条件时仍最多返回 10 条。

### 6.2 `get_course`

用途：取得一门课程的公开详情和教师评分摘要。

输入：

```ts
{ code: string } // 1..20
```

课程白名单：`courseCode`、`titleEn`、`titleZh`、`credits`、`faculty`、`department`、`programLevel`、`suggestedYear`、`medium`、`gradingSystem`、`courseType`、`duration`、`description`、`isOffered`、`url`。

教师摘要白名单：`name`、`commentCount`、`result`、`attendance`、`grade`、`difficulty`、`reward`、`isOffered`、`reviewUrl`。

`description` 最多 1,200 个 Unicode 字符；教师最多 20 条。不得返回 `ilo`、`prof_with_course.id`、`admin_note` 或 `admin_note_en`。

### 6.3 `get_instructor`

用途：取得教师教授过的课程和每门课程的公开评分摘要。

输入：

```ts
{ name: string; limit?: number } // name 1..80，limit 1..20，默认 20
```

输出白名单：教师 `name`、课程数组；课程项仅含 `courseCode`、`commentCount`、`result`、`attendance`、`grade`、`difficulty`、`reward`、`isOffered`、`courseUrl`、`reviewUrl`。

不得返回映射 ID 或管理员备注。

### 6.4 `get_course_reviews`

用途：读取指定课程与教师的公开顶层评价。

输入：

```ts
{
  code: string;        // 1..20
  instructor: string;  // 1..80
  page?: number;       // 1..50，默认 1
  limit?: number;      // 1..10，默认 5
}
```

先用课程码和教师名解析内部关联 ID，再以 `target_page_size = limit` 调用 `get_comment_page_v2`。现有固定 20 条的页面 helper 不直接用于该工具；新增的 MCP 数据 helper 必须把页大小传入 RPC。输出只含 `publishedAt`、`content`、`contentEn`、`result`、`upvotes`、`downvotes`、`verified` 和该评价列表页的 `url`。

每种正文最多 600 个 Unicode 字符。只返回 `hidden <> 1` 且 `replyto is null` 的顶层评论；不得返回内部评论 ID、关联 ID、`verify_account`、avatar seed、图片、投票历史或 emoji 明细。

### 6.5 `get_course_sections`

用途：查询指定课程与教师的班次、星期、时间和地点。

输入：

```ts
{
  code: string;        // 1..20
  instructor: string;  // 1..80
}
```

输出白名单：`courseCode`、`instructor`、`section`、`schedules[]` 和 `courseUrl`；schedule 仅含 `weekday`、`startTime`、`endTime`、`location`。班次最多 20 个，每班最多 20 个时间段。

该工具只读取课程目录，不读取用户保存的课表。

### 6.6 MCP 响应格式

每次成功调用同时返回：

- 简短 `content`，方便不支持结构化内容的客户端；
- 与工具契约一致的 `structuredContent`；
- 结果内的绝对 `https://umeh.top/...` 引用 URL。

单次序列化后的 `structuredContent` 上限为 64 KiB。若按条目截断仍会超过上限，则返回稳定的 `result_too_large` 错误，不发送部分 JSON。正常的列表分页或限制应在达到该上限前生效。

## 7. 数据边界

### 7.1 显式投影

`lib/mcp/data/*` 必须构造新的公开对象，不得把 Supabase row 展开后删除少数字段，也不得返回 `select("*")` 的原始结果。数据库未来新增列时，MCP 输出不能自动改变。

输入和输出 schema 都由 Zod 验证。输出校验失败视为服务端错误，并记录工具名与 request ID；不把原始 row 附在错误中。

### 7.2 敏感字段禁区

下列内容不得进入 MCP 输出、面向模型的错误或普通日志：

- Clerk token、email、profile、private/public metadata；
- `verify_account`、评论创建者标识和 IP；
- `hidden`、`admin_note`、`admin_note_en`；
- 评论图片地址、avatar seed、投票历史；
- Supabase service role key、RPC 内部错误细节；
- `prof_with_course.id`、`comment.id` 等仅用于内部关联的 ID。

`verified` 仅表示评价是否带公开认证标志，不得携带认证账户信息。

### 7.3 引用

引用路径统一由 `lib/site.ts` 生成，再转为 `SITE_URL` 下的绝对 URL：

- 课程：`/course/{code}`
- 教师：`/professor/{name}`
- 评价：`/reviews/{code}/{prof}`，分页时保留页码

编码由已有 builder 负责，工具不得手工拼接教师名 URL。

## 8. 限流与资源上限

现有 `consume_rate_limit` RPC 继续作为原子计数器。为 MCP 扩展 action 类型和限流键，不复用评论或课表 action。

限流采用两档：

| 档位 | 键 | 上限 |
| --- | --- | --- |
| 用户总量分钟档 | `mcp:{userId}:all:minute` | 60 次 / 60 秒 |
| 用户工具小时档 | `mcp:{userId}:{tool}:hour` | 每个工具 300 次 / 3600 秒 |

每次工具调用先消费总量档，再消费工具档。超限返回 `rate_limited` 和可重试秒数。限流服务失败时采用 fail closed：工具不查询业务数据，并返回暂时不可用错误。

此外必须遵守：

- 工具参数和列表上限由 schema 强制；
- Supabase 查询在数据库或 RPC 层应用 `limit`，不能只在内存切片；
- MCP 请求体上限 64 KiB；
- 单工具执行超时 10 秒；
- 客户端断开时取消仍可取消的下游工作。

## 9. 错误语义

| 错误码 | 条件 | 对外行为 |
| --- | --- | --- |
| `unauthorized` | 缺少或无效 Token | HTTP 401 + `WWW-Authenticate` |
| `forbidden` | scope 不足 | HTTP 403 |
| `invalid_request` | MCP 或工具参数不合法 | MCP 参数错误，不执行查询 |
| `not_found` | 精确课程或教师不存在 | 可恢复工具错误，建议先搜索 |
| `rate_limited` | 任一限流档超限 | 可恢复工具错误，包含 retry-after 秒数 |
| `result_too_large` | 结果无法在上限内完整序列化 | 工具错误，建议收窄查询 |
| `temporarily_unavailable` | Supabase、限流或下游超时 | 通用消息，不泄漏内部错误 |
| `internal_error` | 输出投影或未分类异常 | 通用消息与 request ID |

空搜索结果是成功响应，返回空数组和可操作提示；精确详情不存在返回 `not_found`。工具不得根据空结果编造课程或教师信息。

## 10. 日志与隐私

Cloudflare 观测日志记录：request ID、Clerk userId 的不可逆散列、工具名、状态类别、耗时、返回条数、是否截断和限流结果。

日志不记录 OAuth Token、用户邮箱、完整工具参数、完整评论正文、完整数据库错误或 Supabase 响应。课程码可以作为低敏感诊断字段；教师名和自由文本查询只记录长度，不记录原文。

插件使用网站现有隐私政策与服务条款 URL。提交前必须更新页面内容，明确说明插件会接收工具查询、使用 Clerk 身份做鉴权和限流，并由 ChatGPT/Codex 处理用户对话；本设计不要求 UMHelper 保存完整对话。

## 11. 插件包

插件源固定放在仓库的 `plugins/what2reg-um/`，结构如下：

```text
plugins/what2reg-um/
  plugin.json
  mcp.json
  skills/um-course-advisor/SKILL.md
  assets/logo.png
  assets/composer-icon.png
```

`mcp.json` 只声明生产 Streamable HTTP 地址 `https://umeh.top/mcp`，不包含 Token、Clerk secret 或 Supabase secret。技能说明模型如何选择五个工具、保留引用、处理无数据结果，并禁止把站外知识包装成 UMHelper 数据。

`plugin.json` 使用 Agent Plugins 1.0，展示名固定为站点规范名 `What2Reg @ UM 澳大選咩課`（即 `lib/site.ts` 的 `SITE_NAME`），短描述为 `澳門大學課程與教師評價平台（澳大選咩課）`。`assets/logo.png` 与 `assets/composer-icon.png` 使用同一张 512×512 透明 PNG，取自共享品牌标记 —— iOS 端 `CatLogo` 使用的 lucide "cat" 矢量图形（`cat-blue.svg`，描边 `#003DB8`，ISC 许可）。受许可的源文件保存在 `design/cat-logo.svg`，由 `scripts/build-plugin-assets.mjs`（`npm run plugin:assets`）无损渲染。`public/whole-icon.png` 已弃用，不得再作为品牌参考；首版不声明 dark-mode 变体或自定义 brand color。

公共发布包不得包含 `.app.json` 或本地 MCP 配置。四个 listing URL 固定为：

- website：`https://umeh.top`
- support：`https://umeh.top/support`（实施时新增公开支持页）
- privacy policy：`https://umeh.top/privacy-policy`
- terms of service：`https://umeh.top/terms-of-service`

## 12. 测试设计

### 12.1 单元测试

- 五个工具输入 schema 的最小值、最大值、规范化与非法值；
- 每个数据投影的精确字段集合；
- 结果数量、正文长度和 64 KiB 上限；
- 课程、教师和评价 URL 编码；
- 空结果、not found、下游错误和限流错误映射；
- scope 检查和缺失认证上下文的 fail-closed 行为。

敏感字段守护测试使用包含 `verify_account`、`hidden`、`admin_note`、`admin_note_en`、`img`、avatar 和内部 ID 的夹具，断言序列化后的 `content` 与 `structuredContent` 都不包含这些值或字段名。

### 12.2 鉴权与协议测试

- 无 Token、伪造 Token、过期 Token、错误 issuer、错误 audience/resource、缺 scope；
- 有效 Clerk OAuth Token 能初始化 MCP、列出工具并调用一个无害搜索；
- `401` 响应带正确 `WWW-Authenticate`；
- 域名验证配置存在时，challenge 路由匿名返回精确纯文本 token、`200`、正确 `Content-Type` 和 `Cache-Control: no-store`；
- 域名验证配置缺失时返回 `404`，非 `GET` 方法返回 `405`，且整个请求不会初始化 Clerk、MCP 或 Supabase；
- protected resource metadata、authorization metadata 和 CORS preflight 可被匿名发现；
- 非协议方法、超大请求体和畸形 JSON 被拒绝；
- 所有工具 annotations 与实际只读行为一致。

自动化测试不得依赖生产 Clerk 账号或生产 Supabase 数据。协议集成测试使用可控的 token 验证替身和本地 Supabase seed；部署前另做一次受控生产 smoke test。

### 12.3 回归与部署验证

- `npm test`
- `npm run build`
- `npm run build:pages`
- 使用 MCP inspector 或等价客户端验证生产端点的初始化、OAuth 和五个工具；
- 从公网请求 `https://umeh.top/.well-known/openai-apps-challenge`，核对响应字节与 portal token 完全一致，并在 OpenAI portal 中通过 **Verify Domain**；
- 确认现有网站、iOS HMAC API、管理员 API 和课表页面仍工作；
- 使用未登录客户端确认 `/mcp` 无法读取任何业务数据。

## 13. 发布与审核

发布前必须完成：

1. 在 OpenAI Platform 完成个人或企业发布身份验证，并确保所属项目具备 Apps Management 权限。
2. 部署公开可访问的生产 MCP 域名，把 portal 生成的 token 写入 Cloudflare secret `OPENAI_APPS_CHALLENGE_TOKEN`，并确认精确 challenge URL 返回纯文本 token。
3. 在 OpenAI portal 点击 **Verify Domain** 并确认成功；域名验证未通过时不得开始 MCP 连接、tool scan 或提交审核。
4. 在 Clerk 启用 OAuth application settings、PKCE 与 CIMD；只请求 `umhelper:read` 及完成登录所需的最小身份 scopes。
5. 为审核准备一个无 MFA、无真实个人数据的测试账号，并仅通过 Dashboard 安全字段提交凭据。
6. 准备恰好 5 个正向与 3 个负向审核用例；正向覆盖五个工具，负向覆盖匿名访问、无结果和越界/禁止请求。
7. 提供 reviewer 可访问的演示视频、发布说明和四个 listing URL。
8. 扫描生产 MCP 工具，核对名称、schema、annotations 和 server instructions，再提交审核；首版没有 MCP UI，因此不提交截图或 UI CSP。
9. 审核通过后由发布者在 portal 中显式 Publish。

插件公开发布不意味着 API 匿名公开。安装者仍必须经过 Clerk 授权，OpenAI 审核团队使用专用测试账号完成相同登录流程。

## 14. 实施顺序约束

后续实施计划应按以下依赖顺序拆分：

1. 最小的 Clerk OAuth + MCP Route Handler 兼容性验证，覆盖本地 Next.js 与 OpenNext build；
2. 认证、scope、metadata 与协议测试；
3. 公共数据 schema、投影和敏感字段守护测试；
4. 五个只读工具及限流；
5. 插件包、技能与品牌资产；
6. 生产 smoke test、隐私/条款更新与提交材料。

兼容性验证只证明既定架构能运行，不得演变成可保留的匿名 MCP 入口。任何临时绕过认证的代码必须在该任务结束前删除。

## 15. 验收标准

- 对 `/mcp` 的匿名、无效 Token 和缺 scope 请求均不能触发业务查询；audience/resource 由 Clerk 授权服务器绑定（见 §5.1 实施修正）。
- 有效 Clerk 用户能在 ChatGPT 或 Codex 中发现并调用五个只读工具。
- 每个工具输出只包含本设计白名单字段，且敏感字段守护测试通过。
- 搜索最多 10 条、教师课程最多 20 条、评价最多 10 条、单次结构化输出不超过 64 KiB。
- 课程、教师、评价和课表事实带可打开的 `https://umeh.top` 引用。
- 无任何写工具、SQL 工具、任意 URL 工具或批量导出入口。
- MCP tool scan、OAuth 登录、生产 smoke test、Vitest、Next.js build 与 OpenNext build 全部通过。
- `https://umeh.top/.well-known/openai-apps-challenge` 按 portal 要求返回精确 token，且 OpenAI **Verify Domain** 状态成功。
- 插件包不含 secret、本地配置、`.app.json` 或未声明依赖。

## 16. 参考资料

- OpenAI Plugins authentication: <https://developers.openai.com/plugins/build/auth>
- OpenAI remote MCP review requirements: <https://developers.openai.com/plugins/deploy/app-review>
- OpenAI plugin submission: <https://developers.openai.com/plugins/deploy/submission>
- Clerk MCP server for Next.js: <https://clerk.com/docs/guides/ai/mcp/build-mcp-server>
- Clerk OAuth implementation: <https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth>
