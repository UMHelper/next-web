# What2Reg @ UM MCP 与公共插件实施计划

> **For implementation agent:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在现有 `next-web` Cloudflare/OpenNext 应用中发布一个使用 Clerk OAuth 的只读 MCP 服务，并生成可提交至 ChatGPT 与 Codex 公共目录的 What2Reg @ UM 插件包。

**Architecture:** `POST /mcp` 是唯一的业务入口。请求先经过 Clerk OAuth token、resource/audience 与 `umhelper:read` scope 校验，再进入统一的请求体、超时、限流和响应体积保护层，最后调用 `lib/mcp/data/*` 对现有数据库 helper 或受控 RPC 做显式字段投影。OAuth discovery 和 OpenAI 域名验证使用独立的 `.well-known` 路由；它们公开协议元数据或 challenge token，但不能触达任何业务查询。

**Tech Stack:** Next.js 15 Route Handlers、OpenNext Cloudflare 1.16.6、Clerk 7、`@clerk/mcp-tools` 0.6、`mcp-handler` 2.2、Model Context Protocol server 2.x、Zod、Supabase RPC、Vitest、TypeScript。

**Design spec:** [`docs/superpowers/specs/2026-10-05-umhelper-gpt-plugin-design.md`](../specs/2026-10-05-umhelper-gpt-plugin-design.md)

---

## 固定边界

- 生产 MCP resource 是精确字符串 `https://umeh.top/mcp`。
- 所有五个业务工具都需要有效 Clerk OAuth Bearer token、匹配的 audience/resource、非空 `userId` 和 `umhelper:read` scope。
- `/mcp` 不接受 Clerk cookie、query-string key、iOS HMAC 或共享 secret 作为替代认证。
- `GET /.well-known/openai-apps-challenge` 匿名公开且只返回 portal 下发的精确 token；它不调用 Clerk、MCP 或 Supabase。
- OAuth metadata 匿名公开且只返回协议元数据。
- MCP 数据输出只允许显式构造的白名单对象；禁止传播原始 Supabase row、`select("*")` 结果或内部 ID。
- 每次工具调用请求体至多 64 KiB、执行至多 10 秒、`structuredContent` 序列化后至多 64 KiB。
- 限流同时执行每用户总量 60 次/分钟和每用户每工具 300 次/小时；限流存储异常时拒绝请求。
- 首版只有五个只读工具：`search_catalog`、`get_course`、`get_instructor`、`get_course_reviews`、`get_course_sections`。
- 不新增 SQL、任意 URL、写评价、投票、课表写入、用户资料或批量导出工具。

## 交付阶段

代码工作分成三个可独立验收的阶段：

1. **受保护的 MCP 服务**：Tasks 1–9。
2. **公开插件包与站点材料**：Tasks 10–11。
3. **生产配置、域名验证与目录提交**：Tasks 12–13。

第三阶段包含 Clerk、Cloudflare 与 OpenAI portal 中的人工操作。凭据、测试账号密码和 challenge token 只进入对应控制台 secret/表单，不写入仓库或提交记录。

---

## Task 1：锁定 MCP/Clerk 依赖兼容性

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/mcp/dependency-contract.test.ts`

- [ ] **Step 1: 写依赖契约测试**

测试读取 `package.json` 与已安装包的公开导出，断言：

- `@clerk/mcp-tools` 固定为 `0.6.0`；
- `mcp-handler` 固定为 `2.2.0`；
- `@modelcontextprotocol/server` 固定为 `2.3.1`；
- Node engine 仍是 `>=20.9.0`；
- `mcp-handler` 暴露 `createMcpHandler` 与 `withMcpAuth`；
- Clerk 包暴露 `verifyClerkToken`、`generateClerkProtectedResourceMetadata`、`authServerMetadataHandlerClerk` 和 `metadataCorsOptionsRequestHandler`；
- 当前 `zod` 安装能成功加载 `zod/v4`，避免未经评估把整个网站迁移到 Zod 4。

- [ ] **Step 2: 运行测试并确认缺依赖失败**

Run: `npx vitest run tests/mcp/dependency-contract.test.ts`

Expected: FAIL，指出 MCP 包尚未安装。

- [ ] **Step 3: 安装并固定依赖**

Run:

```bash
npm install --save-exact @clerk/mcp-tools@0.6.0 mcp-handler@2.2.0 @modelcontextprotocol/server@2.3.1
```

不要直接添加 `@modelcontextprotocol/sdk`：Clerk 包需要的 v1 SDK由其传递依赖提供；MCP handler 使用新的 server 包。业务代码通过一个小型适配器把 Clerk 返回的 v1 `AuthInfo` 结构规范化成 handler v2 接受的结构。

- [ ] **Step 4: 验证依赖树和 Cloudflare 构建**

Run:

```bash
npm ls @clerk/mcp-tools mcp-handler @modelcontextprotocol/server @modelcontextprotocol/sdk zod
npx vitest run tests/mcp/dependency-contract.test.ts
npx tsc --noEmit
npm run build:pages
```

Expected: 全部 PASS。若类型检查或 OpenNext 构建因 SDK v1/v2 双版本失败，停止后续实现并更新设计；不要使用 `any` 或关闭类型检查绕过。

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json tests/mcp/dependency-contract.test.ts
git commit -m "chore: add compatible MCP server dependencies"
```

## Task 2：实现域名验证端点和 MCP 常量

**Files:**

- Create: `lib/mcp/constants.ts`
- Create: `app/.well-known/openai-apps-challenge/route.ts`
- Create: `tests/mcp/domain-verification.test.ts`
- Modify: `.env.example`（若仓库存在；只加变量名和说明，不放 token）

- [ ] **Step 1: 写失败测试**

覆盖：

- 配置 `OPENAI_APPS_CHALLENGE_TOKEN="abc123"` 时，匿名 GET 返回 `200`、精确正文 `abc123`、`text/plain; charset=utf-8`、`Cache-Control: no-store`；
- 缺失、空字符串或只有空白时返回 `404`；
- POST/PUT/PATCH/DELETE 返回 `405`；
- 路由源码不导入 Clerk、Supabase、`lib/mcp/server` 或数据库模块；
- `MCP_RESOURCE_URL` 固定为 `https://umeh.top/mcp`，scope 固定为 `umhelper:read`。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/mcp/domain-verification.test.ts`

- [ ] **Step 3: 实现最小路由**

在 `constants.ts` 定义并导出：

```ts
export const MCP_RESOURCE_URL = "https://umeh.top/mcp";
export const MCP_REQUIRED_SCOPE = "umhelper:read";
export const MCP_RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";
export const MCP_MAX_BODY_BYTES = 64 * 1024;
export const MCP_MAX_RESULT_BYTES = 64 * 1024;
export const MCP_TOOL_TIMEOUT_MS = 10_000;
```

challenge route 只读取服务器环境变量并构造纯文本 `Response`。不要 trim 后返回另一个值；只用 trim 判断是否为空，成功时返回环境变量的原始精确内容。

- [ ] **Step 4: 验证**

Run: `npx vitest run tests/mcp/domain-verification.test.ts && npx tsc --noEmit`

- [ ] **Step 5: 提交**

```bash
git add lib/mcp/constants.ts app/.well-known/openai-apps-challenge tests/mcp/domain-verification.test.ts .env.example
git commit -m "feat: add OpenAI domain verification endpoint"
```

## Task 3：实现 OAuth metadata 与 Clerk token 适配器

**Files:**

- Create: `app/.well-known/oauth-protected-resource/mcp/route.ts`
- Create: `app/.well-known/oauth-authorization-server/route.ts`
- Create: `lib/mcp/auth.ts`
- Create: `tests/mcp/oauth-metadata.test.ts`
- Create: `tests/mcp/auth.test.ts`

- [ ] **Step 1: 写 metadata 失败测试**

断言 protected resource metadata：

- `resource` 精确等于 `https://umeh.top/mcp`，不能退化成 origin `https://umeh.top`；
- `scopes_supported` 包含 `openid`、`profile`、`email`、`umhelper:read`；
- `resource_documentation` 是 `https://umeh.top/support`；
- GET 和 OPTIONS 允许匿名访问并带正确 CORS；其他方法 405；
- 不执行任何数据库调用。

使用 `generateClerkProtectedResourceMetadata({ resourceUrl: MCP_RESOURCE_URL, ... })` 显式生成内容。不要使用会从 `req.url` 推导 origin 的便捷 handler。

- [ ] **Step 2: 写认证失败测试**

使用 Clerk helper mock 覆盖：

- `auth({ acceptsToken: "oauth_token" })` 被精确调用（Clerk SDK 不提供 `audience` 选项，audience/resource 由 Clerk 授权服务器签发时绑定，见 spec §5.1 实施修正）；
- 无 token、签名无效、过期返回 unauthorized；
- 缺 `umhelper:read` 返回 forbidden；
- 缺 `userId` 返回 unauthorized；
- 合法 token 被规范化为 handler v2 所需的 `AuthInfo`，保留 token、scopes、clientId，并把 `userId` 放入受控 `extra`；
- 错误和日志不含 bearer token、email 或 Clerk metadata。

- [ ] **Step 3: 实现 metadata 路由和认证适配器**

`lib/mcp/auth.ts` 提供两个入口：

```ts
export async function verifyMcpAccessToken(
  bearerToken: string,
): Promise<McpAuthInfo>;

export function requireMcpPrincipal(authInfo: unknown): {
  userId: string;
  scopes: string[];
};
```

`verifyMcpAccessToken` 在当前 Route Handler 请求上下文中调用 Clerk `auth()`，让 Clerk 验证签名、issuer、时间与 audience，然后调用 `verifyClerkToken` 并做结构适配；它的单参数签名可以直接传给 `withMcpAuth`。`requireMcpPrincipal` 是工具边界的第二次 scope/user 检查。

- [ ] **Step 4: 运行测试**

Run:

```bash
npx vitest run tests/mcp/oauth-metadata.test.ts tests/mcp/auth.test.ts
npx tsc --noEmit
```

- [ ] **Step 5: 提交**

```bash
git add app/.well-known/oauth-protected-resource app/.well-known/oauth-authorization-server lib/mcp/auth.ts tests/mcp/oauth-metadata.test.ts tests/mcp/auth.test.ts
git commit -m "feat: add Clerk OAuth metadata and token verification"
```

## Task 4：建立受保护的最小 MCP Route Handler

**Files:**

- Create: `lib/mcp/server.ts`
- Create: `lib/mcp/http.ts`
- Create: `app/mcp/route.ts`
- Create: `tests/mcp/http.test.ts`
- Create: `tests/mcp/protocol.test.ts`

- [ ] **Step 1: 写 HTTP 边界失败测试**

断言：

- `POST /mcp` 无 Authorization 时为 `401`，`WWW-Authenticate` 指向 `/.well-known/oauth-protected-resource/mcp`；
- 无效 token 为 `401`；有效 token 缺 scope 为 `403`；
- `GET /mcp` 与 `DELETE /mcp` 为 `405` 且数据库 mock 未被调用；
- `Content-Length > 65536` 立即返回 `413`；无 Content-Length 的流式正文实际超过 64 KiB 也返回 `413`；
- 合法 initialize 请求返回 MCP 协议响应；
- 路由不读取 cookie，也不接受 URL 中的 token。

- [ ] **Step 2: 确认测试失败**

Run: `npx vitest run tests/mcp/http.test.ts tests/mcp/protocol.test.ts`

- [ ] **Step 3: 实现最小 server 和 route**

`lib/mcp/http.ts` 先检查 `Content-Length`，再读取 `arrayBuffer()` 并复核真实长度，最后用同一 URL、method、headers 和受控 body 重建 `Request`。不要在日志中输出 body 或 Authorization header。

`app/mcp/route.ts` 创建无状态 handler，并使用：

```ts
withMcpAuth(handler, verifyToken, {
  required: true,
  requiredScopes: [MCP_REQUIRED_SCOPE],
  // 注意：`mcp-handler` 把这个选项当作 **origin**，再拼上 resourceMetadataPath
  // （`${origin}${path}`）。传完整的 MCP_RESOURCE_URL 会得到
  // `https://umeh.top/mcp/.well-known/...`，客户端跟随会 404。
  resourceUrl: new URL(MCP_RESOURCE_URL).origin,
  resourceMetadataPath: MCP_RESOURCE_METADATA_PATH,
});
```

先只注册一个测试用 `health` 工具或空 server 来证明 initialize/list-tools 协议可用；该临时工具必须在 Task 9 前删除，不能进入插件包。

- [ ] **Step 4: 运行协议和构建验证**

Run:

```bash
npx vitest run tests/mcp/http.test.ts tests/mcp/protocol.test.ts
npx tsc --noEmit
npm run build:pages
```

- [ ] **Step 5: 提交**

```bash
git add app/mcp lib/mcp/server.ts lib/mcp/http.ts tests/mcp/http.test.ts tests/mcp/protocol.test.ts
git commit -m "feat: add protected MCP transport"
```

## Task 5：建立统一执行保护层

**Files:**

- Create: `lib/mcp/errors.ts`
- Create: `lib/mcp/rate-limit.ts`
- Create: `lib/mcp/execute.ts`
- Modify: `lib/rate-limit.ts`
- Create: `tests/mcp/execution.test.ts`

- [ ] **Step 1: 写执行边界失败测试**

覆盖：

- 工具回调从 `ctx.http?.authInfo` 读取身份并再次调用 `requireMcpPrincipal`；
- 每次调用依次消费 `mcp:user:<hash>:minute` 的 60/60s 档位和 `mcp:user:<hash>:tool:<tool>:hour` 的 300/3600s 档位；
- 任何一档拒绝时不调用数据层，返回稳定 `rate_limited` 和 retry 信息；
- 限流 RPC 报错时 fail closed；
- 10 秒超时或调用方中止映射成稳定 `temporarily_unavailable`；
- 输出先经过 Zod output schema，再序列化测量 UTF-8 bytes；超过 64 KiB 返回 `result_too_large`，不返回部分对象；
- 日志只含 request ID、用户 hash、工具名、耗时、结果数量和错误分类。

- [ ] **Step 2: 确认测试失败**

Run: `npx vitest run tests/mcp/execution.test.ts`

- [ ] **Step 3: 实现错误、限流和执行器**

扩展 `ConsumeRateLimitInput.action` 加入 `"mcp"`。稳定错误码限定为：

```text
unauthorized
forbidden
invalid_request
not_found
rate_limited
result_too_large
temporarily_unavailable
internal_error
```

`executeMcpTool` 合并 `ctx.signal` 与 10 秒 timeout signal，执行双重认证、两档限流、数据 handler、输出 schema 校验和字节上限。不要把 Supabase error message 或原始异常堆栈作为面向模型的内容。

- [ ] **Step 4: 验证**

Run: `npx vitest run tests/mcp/execution.test.ts tests/rate-limit.test.ts && npx tsc --noEmit`

- [ ] **Step 5: 提交**

```bash
git add lib/rate-limit.ts lib/mcp/errors.ts lib/mcp/rate-limit.ts lib/mcp/execute.ts tests/mcp/execution.test.ts
git commit -m "feat: enforce MCP execution limits"
```

## Task 6：实现 schema 与 `search_catalog`

**Files:**

- Create: `lib/mcp/schemas.ts`
- Create: `lib/mcp/data/search-catalog.ts`
- Create: `lib/mcp/tools/search-catalog.ts`
- Create: `tests/mcp/search-catalog.test.ts`

- [ ] **Step 1: 写输入、查询和投影失败测试**

覆盖设计规格 6.1 的输入限制，并断言：

- `query`、`faculty`、`department` 至少一项存在；空白视为不存在；
- limit 默认 10，范围 1..10，page offset 固定 0；
- course 使用 `search_planner_courses`，instructor 使用 `search_planner_instructors`；
- 返回对象只含规格白名单字段和绝对 `https://umeh.top` URL；
- `total_count`、内部教师 ID 和任何额外 mock 字段不会传播；
- 不使用 `fetch("/api/...")`；
- `annotations` 明确声明只读、非破坏、closed world，并提供审核所需的说明文本。

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx vitest run tests/mcp/search-catalog.test.ts`

- [ ] **Step 3: 实现 schema、data adapter 和工具注册器**

从 `zod/v4` 导入 MCP schema。data adapter 逐字段构造新对象；即使 RPC mock 添加 `secret` 字段，输出也不能改变。工具通过 `executeMcpTool` 执行。

- [ ] **Step 4: 验证**

Run: `npx vitest run tests/mcp/search-catalog.test.ts && npx tsc --noEmit`

- [ ] **Step 5: 提交**

```bash
git add lib/mcp/schemas.ts lib/mcp/data/search-catalog.ts lib/mcp/tools/search-catalog.ts tests/mcp/search-catalog.test.ts
git commit -m "feat: add catalog search MCP tool"
```

## Task 7：实现 `get_course` 与 `get_instructor`

**Files:**

- Create: `lib/mcp/data/get-course.ts`
- Create: `lib/mcp/data/get-instructor.ts`
- Create: `lib/mcp/tools/get-course.ts`
- Create: `lib/mcp/tools/get-instructor.ts`
- Modify: `lib/mcp/schemas.ts`
- Create: `tests/mcp/course-instructor.test.ts`

- [ ] **Step 1: 写失败测试**

覆盖：

- 课程码 trim 后转大写；教师名 trim 并折叠连续空白；
- `get_course` description 在 Unicode code point 层面最多 1,200 字符、教师最多 20 条；
- `get_instructor` limit 默认 20、最大 20；
- `ilo`、映射 ID、`admin_note`、`admin_note_en`、未知字段永不输出；
- 不存在时返回 `not_found`，数据库异常返回不泄露内部信息的 `internal_error`；
- course、professor 和 review URL 均由 `lib/site.ts` helper 构造。

- [ ] **Step 2: 确认测试失败**

Run: `npx vitest run tests/mcp/course-instructor.test.ts`

- [ ] **Step 3: 实现两个工具**

允许复用 `fetchCourseInfo`、`fetchCourseListByProf` 与 `getReviewInfo`，但只在 adapter 内读取其返回值，并立即映射到公开 DTO。不得把 raw row 交给工具回调或 `structuredContent`。

- [ ] **Step 4: 验证**

Run: `npx vitest run tests/mcp/course-instructor.test.ts && npx tsc --noEmit`

- [ ] **Step 5: 提交**

```bash
git add lib/mcp/schemas.ts lib/mcp/data/get-course.ts lib/mcp/data/get-instructor.ts lib/mcp/tools/get-course.ts lib/mcp/tools/get-instructor.ts tests/mcp/course-instructor.test.ts
git commit -m "feat: add course and instructor MCP tools"
```

## Task 8：实现评价与开课时间工具

**Files:**

- Create: `lib/mcp/data/get-course-reviews.ts`
- Create: `lib/mcp/data/get-course-sections.ts`
- Create: `lib/mcp/tools/get-course-reviews.ts`
- Create: `lib/mcp/tools/get-course-sections.ts`
- Modify: `lib/mcp/schemas.ts`
- Create: `tests/mcp/reviews-sections.test.ts`

- [ ] **Step 1: 写评价工具失败测试**

断言：

- page 输入是 1..50，传给 `get_comment_page_v2` 时转成零基 `page - 1`；
- `target_page_size` 使用调用者 limit 1..10，而不是现有固定 20 的 helper；
- 只输出 `replyto === null` 的顶层公开评价；
- `content` 与 `contentEn` 各自最多 600 Unicode 字符；
- 评论 ID、关联 ID、作者、`verify_account`、隐藏状态、图片、投票历史和 emoji 不输出。

- [ ] **Step 2: 写 sections 失败测试**

断言：

- 最多 20 个 section，每个最多 20 个 schedule；
- `date` 明确映射到 `weekday`；`time` 用确定性的 parser 分成 `startTime`/`endTime`；
- 非法或不完整时间数据被安全跳过或映射成稳定内部错误，行为由测试固定；
- 只读取课程目录，不读取用户保存的 timetable 表。

- [ ] **Step 3: 确认测试失败**

Run: `npx vitest run tests/mcp/reviews-sections.test.ts`

- [ ] **Step 4: 实现两个工具**

评价 adapter 直接调用受控 RPC，并在服务端过滤顶层评论。sections adapter 可复用 `getScheduleList`，随后逐字段映射。时间 parser 独立成纯函数并覆盖常见、空值和畸形输入。

- [ ] **Step 5: 验证并提交**

Run: `npx vitest run tests/mcp/reviews-sections.test.ts && npx tsc --noEmit`

```bash
git add lib/mcp/schemas.ts lib/mcp/data/get-course-reviews.ts lib/mcp/data/get-course-sections.ts lib/mcp/tools/get-course-reviews.ts lib/mcp/tools/get-course-sections.ts tests/mcp/reviews-sections.test.ts
git commit -m "feat: add reviews and sections MCP tools"
```

## Task 9：注册五个正式工具并完成协议安全测试

**Files:**

- Modify: `lib/mcp/server.ts`
- Modify: `tests/mcp/protocol.test.ts`
- Create: `tests/mcp/security-boundaries.test.ts`

- [ ] **Step 1: 扩展协议测试**

通过真实 MCP initialize、tools/list、tools/call 请求断言：

- 工具列表精确等于五个批准名称，无临时 health 工具；
- 每个工具都有 title、清晰 description、input schema、output schema 和只读 annotations；
- 成功调用同时返回简短 `content` 与匹配 output schema 的 `structuredContent`；
- 缺 auth、缺 scope、oversize、rate limit、timeout 与 not found 分别保持稳定协议/HTTP 语义；
- GET/DELETE 不产生数据库调用。

- [ ] **Step 2: 添加源码级安全库存测试**

扫描 `lib/mcp` 与 `app/mcp`，拒绝：

- `select("*")`、raw row spread、`console.log` token/body；
- `/api/` 自调用；
- `cookies()` 或 iOS HMAC helper；
- 未列入清单的工具注册；
- 输出 schema 中出现已禁止字段名。

源码扫描只守护高风险边界，不替代行为测试。

- [ ] **Step 3: 实现正式 server instructions 和注册**

instructions 说明：数据来自 What2Reg @ UM、只读、结果应保留引用 URL、工具结果可能分页或截断。不要声称数据是澳门大学官方意见。

- [ ] **Step 4: 运行 MCP 完整门槛**

Run:

```bash
npx vitest run tests/mcp
npx tsc --noEmit
npm run lint
npm run build
npm run build:pages
```

- [ ] **Step 5: 用 MCP Inspector 做本地协议检查**

在本地开发环境中使用测试 Clerk OAuth token 连接 `/mcp`，逐个调用五个工具，保存结果摘要到 `docs/superpowers/verification/2026-10-05-umhelper-mcp-plugin.md`。验证记录不能包含 token 或用户资料。

- [ ] **Step 6: 提交**

```bash
git add lib/mcp/server.ts tests/mcp/protocol.test.ts tests/mcp/security-boundaries.test.ts docs/superpowers/verification/2026-10-05-umhelper-mcp-plugin.md
git commit -m "test: verify authenticated MCP protocol boundaries"
```

## Task 10：补齐支持页与隐私/条款披露

**Files:**

- Create: `app/support/page.tsx`
- Modify: `app/privacy-policy/page.tsx`
- Modify: `app/privacy-policy/en/page.tsx`
- Modify: `app/privacy-policy/zh/page.tsx`
- Modify: `app/terms-of-service/page.tsx`
- Modify: `app/terms-of-service/zh/page.tsx`
- Create: `tests/legal/plugin-disclosures.test.ts`

- [ ] **Step 1: 先读取现有双语法律页和共享组件**

Run: `rg -n "Privacy|隱私|Terms|條款" app/privacy-policy app/terms-of-service components`

沿用现有的语言跳转、metadata 和页面组件结构；不要新建一套平行的法律页路由。

- [ ] **Step 2: 写披露失败测试**

断言公开页面包含：

- 支持联系方式或支持渠道、账户删除/撤销授权指引、插件故障反馈方式；
- ChatGPT/Codex 会向 UMHelper 发送用户主动查询及 OAuth 标识用于鉴权/限流；
- UMHelper 返回公开课程、教师、评价和班次数据；
- 不向模型返回 email、private metadata、评论者身份或个人课表；
- 数据保留、日志用途、撤销授权和第三方平台政策链接；
- 网站、支持、隐私、条款 URL 都能匿名访问。

- [ ] **Step 3: 实现页面并更新日期**

保持站点现有中英文/繁中表达和布局。支持页不能暴露内部调试信息或测试账号。

- [ ] **Step 4: 验证并提交**

Run: `npx vitest run tests/legal/plugin-disclosures.test.ts && npm run build`

```bash
git add app/support app/privacy-policy app/terms-of-service tests/legal/plugin-disclosures.test.ts
git commit -m "docs: add plugin support and privacy disclosures"
```

## Task 11：创建可提交的 portable Agent Plugin 包

**Files:**

- Create: `plugins/what2reg-um/plugin.json`
- Create: `plugins/what2reg-um/mcp.json`
- Create: `plugins/what2reg-um/skills/um-course-advisor/SKILL.md`
- Create: `plugins/what2reg-um/skills/um-course-advisor/agents/openai.yaml`
- Create: `plugins/what2reg-um/assets/logo.png`
- Create: `plugins/what2reg-um/assets/composer-icon.png`
- Create: `tests/plugin/package.test.ts`
- Create: `tests/plugin/skill.test.ts`

- [ ] **Step 1: 写插件包失败测试**

断言：

- `plugin.json` 使用 `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`；
- `mcp.json` 使用对应 MCP schema，并且唯一 server key 为 `what2reg-um`、类型为 `streamable-http`、URL 为 `https://umeh.top/mcp`；
- `agents/openai.yaml` 的 dependency value 同样是 `what2reg-um`，transport 为 `streamable_http`，URL 完全一致；
- listing 的 website/support/privacy/terms 都是 `https://umeh.top` 绝对 URL；
- review metadata 恰有 5 个 positive case 和 3 个 negative case；
- publication metadata 不含空必填字段；
- ZIP 内容没有 `.app.json`、hooks、token、test credentials、`.env` 或源码地图；
- 两张 PNG 是要求的尺寸、透明背景且文件大小在 portal 限制内。

- [ ] **Step 2: 写 skill 行为失败测试**

断言 SKILL.md：

- 仅引用五个允许工具；
- 要求事实答案保留返回 URL；
- 信息不足时先调用搜索/详情工具，不编造开课或评分；
- 不尝试写评价、查用户资料、访问任意 URL 或执行 SQL；
- 比较课程时按用户偏好组织，而不是把评分当作官方结论；
- 对未找到、限流、鉴权失败给出可操作但不泄露内部信息的说明。

- [ ] **Step 3: 创建 manifest、skill 和审核案例**

五个 positive cases 应分别覆盖：目录搜索、课程详情、教师比较、公开评价摘要、班次查询。三个 negative cases 应覆盖：要求写评价、要求读取个人课表/用户资料、要求 SQL/批量导出。

`plugin.json` 的 OpenAI 扩展同时填写 interface、review 和 publication。公开 ZIP 只包含运行时需要的 manifests、skill 与 assets。

- [ ] **Step 4: 生成并检查品牌 assets**

插件图标来源为共享品牌标记：iOS 端 `CatLogo` 使用的 lucide "cat" 矢量图形（`cat-blue.svg`，描边 `#003DB8`，ISC 许可）。把受许可的源文件复制到 `design/cat-logo.svg`，用 `scripts/build-plugin-assets.mjs`（`npm run plugin:assets`）无损渲染为 512×512 透明 PNG。`public/whole-icon.png` 已弃用不得使用；不得直接放大低清 favicon。人工检查小尺寸可读性和透明边缘。展示名必须使用站点规范名 `What2Reg @ UM 澳大選咩課`（`lib/site.ts` 的 `SITE_NAME`），短描述为 `澳門大學課程與教師評價平台（澳大選咩課）`。

- [ ] **Step 5: 验证并生成候选 ZIP**

Run:

```bash
npx vitest run tests/plugin/package.test.ts tests/plugin/skill.test.ts
cd plugins/what2reg-um && zip -r ../../artifacts/what2reg-um-plugin.zip plugin.json mcp.json skills assets
cd ../.. && unzip -l artifacts/what2reg-um-plugin.zip
```

将 `artifacts/` 加入 `.gitignore`；提交源文件，不提交发布 ZIP，除非仓库已有 release artifact 规范。

- [ ] **Step 6: 提交**

```bash
git add plugins/what2reg-um tests/plugin .gitignore
git commit -m "feat: package What2Reg public agent plugin"
```

## Task 12：生产部署、Clerk 配置与 OpenAI 域名验证

**Files:**

- Modify: `docs/superpowers/verification/2026-10-05-umhelper-mcp-plugin.md`
- Modify: `cloudflare-env.d.ts`（仅通过 `npm run cf-typegen` 生成）

- [ ] **Step 1: 配置 Clerk OAuth application**

在 Clerk Dashboard：

- 启用 Authorization Code + S256 PKCE 和 CIMD；
- 添加 `umhelper:read`，并确认 `openid profile email umhelper:read` 可申请；
- 资源/audience 使用 `https://umeh.top/mcp`（这是 audience 的唯一绑定点：资源服务器不重复校验，见 spec §5.1 实施修正）；
- 允许 ChatGPT/Codex 官方 CIMD client；DCR 保持关闭，除非实际客户端明确要求；
- 确认授权页展示应用名称、scope 和撤销入口。

记录非敏感配置截图或文字结论；不要记录 client secret、token、email 或测试密码。

- [ ] **Step 2: 配置 Cloudflare secrets**

在生产 Worker 设置 `OPENAI_APPS_CHALLENGE_TOKEN`，并确认 Clerk/Supabase 现有 server secrets 仍是 secret binding。运行 `npm run cf-typegen` 更新类型；检查 diff 只包含预期变量名，不包含值。

- [ ] **Step 3: 部署并先验证匿名边界**

部署后用未登录请求检查：

```bash
curl -i https://umeh.top/.well-known/openai-apps-challenge
curl -i https://umeh.top/.well-known/oauth-protected-resource/mcp
curl -i -X POST https://umeh.top/mcp
curl -i https://umeh.top/mcp
```

Expected：challenge 为精确纯文本；metadata 为公开 JSON；匿名 POST 为 401 且带 `WWW-Authenticate`；GET 为 405。不要把 challenge 正文复制进验证文档。

- [ ] **Step 4: 在 OpenAI portal 完成 Verify Domain**

使用 `umeh.top` 发起验证。**只有 portal 明确显示域名验证成功后**，才继续连接 MCP、工具扫描和提交审核。若 portal 轮换 token，只更新 Cloudflare secret 并重新部署；不要改源码硬编码。

- [ ] **Step 5: 用真实 Clerk 测试账号连接 MCP**

通过 ChatGPT Developer Mode 或 MCP Inspector 完成一次 OAuth 登录，检查：

- PKCE/CIMD 成功；
- 授权后 tools/list 恰有五个工具；
- 五个工具各至少一次成功调用；
- 退出/撤销授权后旧 token 不能继续访问；
- 另一普通网站 Clerk cookie 在无 Bearer token 时不能访问 `/mcp`。

- [ ] **Step 6: 更新验证记录并提交**

记录 HTTP status、工具名、脱敏结果数量、时间和环境；不记录响应中的用户信息或 token。

```bash
git add cloudflare-env.d.ts docs/superpowers/verification/2026-10-05-umhelper-mcp-plugin.md
git commit -m "docs: record production MCP verification"
```

## Task 13：最终门槛、插件审核材料和目录提交

**Files:**

- Modify: `plugins/what2reg-um/plugin.json`（填入真实 demo URL/最终 publication 字段）
- Modify: `docs/superpowers/verification/2026-10-05-umhelper-mcp-plugin.md`

- [ ] **Step 1: 运行最终自动化门槛**

Run:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run build:pages
npm audit --omit=dev
```

任何失败先修复并重新执行受影响门槛。对 audit 结果按可利用性和生产依赖判断，不用强制升级破坏固定的兼容依赖。

- [ ] **Step 2: 执行提交前安全检查**

Run:

```bash
git grep -nE 'OPENAI_APPS_CHALLENGE_TOKEN=|Bearer [A-Za-z0-9._-]+|sk_(live|test)_' -- . ':!package-lock.json'
git status --short
```

再人工确认 MCP 输出样本不含 email、Clerk metadata、内部 ID、评论者身份、admin note、个人课表或原始数据库行。

- [ ] **Step 3: 录制审核 demo**

视频展示：安装/连接、Clerk OAuth、至少三个代表性只读工具、结果引用链接、一次不允许的写入请求被正确拒绝或说明不支持。上传到审核方可访问的 HTTPS URL，并把最终 URL 填入 publication metadata。

- [ ] **Step 4: 准备测试账号**

创建最低权限的普通 Clerk 测试账号，只能使用 `umhelper:read`。账号凭据只填写在 OpenAI submission portal，不能写入 `plugin.json`、SKILL.md、Git、视频字幕或验证文档。

- [ ] **Step 5: 执行目录预检**

在 ChatGPT Developer Mode 直接连接 `https://umeh.top/mcp`，运行工具扫描和 5 个 positive / 3 个 negative cases。修正全部 manifest、annotation、schema、OAuth 或隐私披露错误，再重跑完整案例。

- [ ] **Step 6: 提交公共目录审核**

选择 “With MCP”，使用已验证域名和生产 endpoint，上传最终 ZIP、demo、测试账号与 listing 内容。保存 submission ID 和提交时间到验证记录，不保存凭据。

- [ ] **Step 7: 请求代码审查并完成分支**

应用 `superpowers:requesting-code-review` 检查设计符合性、认证边界、字段投影和发布包。修复 findings 后重跑最终门槛，再应用 `superpowers:finishing-a-development-branch` 选择合并/PR 流程。

```bash
git add plugins/what2reg-um/plugin.json docs/superpowers/verification/2026-10-05-umhelper-mcp-plugin.md
git commit -m "docs: finalize What2Reg plugin submission"
```

---

## 验收标准

以下条件全部满足才算下一阶段完成：

- `https://umeh.top/mcp` 的匿名 POST 是 401、缺 scope 是 403、GET/DELETE 是 405；这些路径都不能读业务数据。
- 合法 Clerk OAuth token 能调用精确五个只读工具，且每个工具在回调边界再次检查 userId 与 scope。
- 五个工具的输入、输出、行数、正文和 64 KiB 上限均有行为测试。
- 输出样本不包含任何规格禁止字段，数据库新增未知列不会自动进入 MCP 输出。
- 每用户总量和每工具限流、10 秒超时、请求体上限、输出上限均 fail closed。
- OAuth metadata 的 resource 精确等于 `https://umeh.top/mcp`。
- challenge endpoint 返回 portal 下发的精确纯文本，OpenAI portal 已显示 `umeh.top` 验证成功。
- 站点支持、隐私、条款披露已上线。
- 插件包通过 schema/一致性测试，包含 5 个 positive 和 3 个 negative case，不含秘密或禁止文件。
- `npm test`、TypeScript、lint、Next build 和 OpenNext build 全部通过。
- ChatGPT Developer Mode 完成真实 OAuth 和五工具 smoke test，随后提交公共目录审核。
