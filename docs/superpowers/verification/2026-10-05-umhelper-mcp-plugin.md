# What2Reg @ UM MCP 插件验证记录

> Plan: `docs/superpowers/plans/2026-10-05-umhelper-mcp-plugin.md`
> Spec: `docs/superpowers/specs/2026-10-05-umhelper-gpt-plugin-design.md`
> Date: 2026-10-05
> Branch / worktree: `feat/mcp-plugin` at `.worktrees/mcp-plugin` (base `55eba74`)

## 1. 结果

计划中可自动化实施的 **Task 1–11 全部完成**，最终门槛全绿。**Task 12–13 是生产控制台与 OpenAI portal 的人工操作，尚未执行**（见 §6）。

## 2. 最终门槛（在最终状态下按顺序执行）

| # | 命令 | 结果 |
| --- | --- | --- |
| 1 | `npm test` | 143 文件 / **756 测试通过** |
| 2 | `npx tsc --noEmit` | 0 错误 |
| 3 | `npm run lint` (`eslint . --max-warnings=0`) | 0 错误 0 警告 |
| 4 | `npm run build` (`next build`) | exit 0，产出 `/mcp` 与 `/support` |
| 5 | `npm run build:pages` (`opennextjs-cloudflare build`) | exit 0，`.open-next/worker.js` 已生成 |

MCP 自有测试 11 个文件 / 207 测试；插件包 38 测试；法律披露 17 测试。

依赖树同时存在两代 SDK，且已验证共存无碍：`@clerk/mcp-tools@0.6.0` → `@modelcontextprotocol/sdk@1.32.1`（zod 3 去重），`@modelcontextprotocol/server@2.3.1` → 嵌套 `zod@4.6.5`。类型检查与 OpenNext 构建均通过，计划的"若 v1/v2 双版本失败则停止"条件未触发。

## 3. 已实现模块

| 单元 | 文件 |
| --- | --- |
| 常量与上限 | `lib/mcp/constants.ts` |
| OpenAI 域名验证 | `app/.well-known/openai-apps-challenge/route.ts` |
| OAuth metadata | `app/.well-known/oauth-protected-resource/mcp/route.ts`、`app/.well-known/oauth-authorization-server/route.ts` |
| Clerk OAuth 适配 | `lib/mcp/auth.ts` |
| 受保护传输 | `app/mcp/route.ts`、`lib/mcp/http.ts` |
| 执行保护层 | `lib/mcp/errors.ts`、`lib/mcp/rate-limit.ts`、`lib/mcp/execute.ts`、`lib/rate-limit.ts`（新增 `mcp` action） |
| 五个只读工具 | `lib/mcp/tools/*` + `lib/mcp/data/*` + `lib/mcp/schemas.ts` |
| 工具注册与 instructions | `lib/mcp/server.ts` |
| 支持页与披露 | `app/support/page.tsx`、`app/privacy-policy/*`、`app/terms-of-service/*` |
| 插件包 | `plugins/what2reg-um/`（plugin.json、mcp.json、SKILL.md、agents/openai.yaml、assets） |

注册的工具恰为五个：`search_catalog`、`get_course`、`get_instructor`、`get_course_reviews`、`get_course_sections`。Task 4 的临时 `health` 工具已在 Task 9 删除，测试断言最终列表精确等于这五个。

## 4. 安全边界证据（均有行为测试）

- 匿名/无效 token 的 `/mcp` POST 返回 `401` 且带指向 `/.well-known/oauth-protected-resource/mcp` 的 `WWW-Authenticate`；缺 `umhelper:read` 返回 `403`；`GET`/`DELETE` 返回 `405` 且不触达数据层。
- 每次工具调用经 `executeMcpTool` 统一执行：认证 → 两档限流（每用户 60/分钟、每用户每工具 300/小时，键含不可逆 userId 散列）→ 10 秒超时 → 输出 schema 校验 → 64 KiB 序列化上限；限流存储异常 fail closed。
- 显式字段投影：适配器逐字段构造新对象，`select("*")`、原始 row 展开、内部 ID、`admin_note(_en)`、`verify_account`、`hidden`、图片、avatar seed、投票历史均有守护测试。
- 不接受 cookie、query-string token 或 iOS HMAC 作为 `/mcp` 回退认证（含源码扫描测试）。
- challenge 路由只读环境变量，不导入 Clerk/Supabase/MCP/数据库模块。

## 5. 与计划/设计的偏差（均已落地并记录）

1. **audience/resource**：`@clerk/nextjs` 的 `auth()` 无 `audience` 选项、不暴露 claims，`verifyClerkToken` 也不校验 audience。经确认后改用 Clerk 官方路径，audience 由 Clerk 授权服务器签发时绑定；spec §5.1 已加"实施修正"，plan Task 12 Step 1 标注为唯一绑定点。
2. **`verifyToken` 签名**：`withMcpAuth` 调用的是 `(req, bearerToken?)`，不是计划所写的单参数；实现按真实签名，plan Task 3 措辞已更正。
3. **`generateClerkProtectedResourceMetadata`** 来自 `@clerk/mcp-tools/server`（计划未指明子路径）。
4. **zod 桥接**：仓库捆绑的 zod 4.0.x（经 `zod/v4`）没有 `~standard.jsonSchema`，而 `@modelcontextprotocol/server` 在 `registerTool` 中要求它。新增 `toMcpSchema()`，用仓库自身的 `z.toJSONSchema` 补齐，未新增依赖、未使用 `any`、未关闭类型检查。
5. **教师名大写**：`prof_with_course.prof_id` 用大小写敏感的 `.eq` 查询且库内为大写（网站各路由都先 `toUpperCase()`），因此 `get_instructor` / `get_course_reviews` / `get_course_sections` 的教师名归一化为 trim + 折叠空白 + 大写，避免模型给 title/lower case 时必然 `not_found`。
6. **法律文案位置**：现有法律正文在 `lib/privacy-policy.ts` / `lib/terms-of-service.ts`，本次披露按计划要求加在路由页文件中（组合 lib 内容 + 追加章节）。后续可集中回 `lib/`。
7. **插件图标复用 iOS 品牌标记**：`assets/logo.png` 与 `composer-icon.png` 由共享品牌图形生成 —— 即 iOS 端 `CatLogo` 使用的 lucide "cat" 矢量标记（`cat-blue.svg`，描边 `#003DB8`，ISC 许可）。受许可的源文件保存在 `design/cat-logo.svg`，`scripts/build-plugin-assets.mjs`（`npm run plugin:assets`）用 `sharp` 以矢量无损方式渲染为 512×512 透明 PNG，因此不存在放大低清位图的问题。`public/whole-icon.png` 已弃用、未参与生成。计划要求的小尺寸可读性与透明边缘人工评审仍需在提交前完成。
8. **支持页语言切换**沿用站内既有 `?lang=zh` 模式（无 `/support/zh` 路由）；`/support` 尚未加入 sitemap/footer。
9. **对外品牌名与文案修正（2026-10-05，评审反馈）**：产品对外名是站点规范名 `What2Reg @ UM 澳大選咩課`（`lib/site.ts` 的 `SITE_NAME`），不是"澳大选课助手/课程助手"。`plugin.json` 的 `interface.displayName` 已改为该规范名，`shortDescription` 改为 `澳門大學課程與教師評價平台（澳大選咩課）`，顶层 `description`、`zh-TW` / `en-US` 的 `subtitle` 同步修正；spec §11 与 plan Task 11 Step 4 的措辞也已更正。`public/whole-icon.png` 已弃用，品牌参考只用 `public/icon/*`。
10. **`WWW-Authenticate` 的 `resource_metadata` 被拼错（本地真实运行发现并修复）**：`mcp-handler` 把 `withMcpAuth` 的 `resourceUrl` 选项当作 **origin**，再拼上 `resourceMetadataPath`（源码为 `${origin}${path}`）。计划与初版实现都传了完整的 `MCP_RESOURCE_URL`，于是匿名 POST 返回的 challenge 指向 `https://umeh.top/mcp/.well-known/oauth-protected-resource/mcp`（多了一层 `/mcp`），MCP 客户端按此发现元数据会 404。现改为 `resourceUrl: new URL(MCP_RESOURCE_URL).origin`，challenge 正确指向 `https://umeh.top/.well-known/oauth-protected-resource/mcp`；`tests/mcp/http.test.ts` 增加了对该完整 URL 的精确断言以及"不得出现 `/mcp/.well-known/`"的反向断言，plan Task 4 Step 3 的示例也已更正。注意 metadata 路由里的 `generateClerkProtectedResourceMetadata({ resourceUrl: MCP_RESOURCE_URL })` 仍然要用完整 URL（那是 RFC 9728 的 `resource` 字段），两处语义不同。
11. **Account Portal 同意页导致 OAuth 无法完成 → 改为自建同意页（2026-10-05，真实联调发现）**：用真实 Clerk 实例联调时，客户端始终停在实例的 Home URL（dev 是 `/default-redirect`，生产是 `https://www.umeh.top/`），从未签发过 token。定位过程与结论：
    - 用 Backend API 读取实例配置与日志：`oauth_authorization.failed` 多次出现，`oauth_client_id` 为真实 client，`reason` 为 Clerk 内部错误码 `oauth2idp_patch_fosite_state_non_invalid_state_error`（`state` 相关，`fosite` 是 Clerk 的 OAuth2 底层库）；
    - 用会话 JWT 构造 cookie 复现完整链路：`/oauth/authorize` → `/oauth/authorize/continue` → `accounts.<instance-domain>/sign-in?redirect_url=…/oauth-consent?…`，而 sign-in 页在**已登录自动跳转**时**丢弃 `redirect_url`** 并改送 Home URL —— 同意步骤永远执行不到；
    - 排除我方因素：metadata / discovery / client_id / redirect_uri 注册（四个回调逐一确认）/ scopes / PKCE 全部正确，且用**参数完全可控的自建 PKCE 客户端**（自带回调监听）复现出同样失败，去掉 `resource`、去掉 `prompt` 亦然；
    - 修复：按 Clerk 文档自建同意页 `app/oauth-consent/[[...index]]/page.tsx`（渲染 `<OAuthConsent />`，`auth()` 守卫，必须设 `referrer: "strict-origin-when-cross-origin"`）。本地已验证该路由可编译、`referrer` 策略生效、组件已渲染；`next build` 输出含 `ƒ /oauth-consent/[[...index]]`；
    - 仍需人工：Dashboard → **Paths → Component paths → OAuth consent** 填 `https://umeh.top/oauth-consent`（生产）/ `/oauth-consent`（dev），再走一次真实授权确认闭环。详见 spec §5.6。
12. **端到端真实 OAuth 与五个工具验证通过（2026-10-05，生产）**：完成 Paths 配置（OAuth consent = `https://umeh.top/oauth-consent`）并先登出再登录后，生产 Clerk 首次记录 `oauth_authorization.granted`。随后用参数完全可控的自建 PKCE 客户端（带 `resource=https://umeh.top/mcp` 与 `prompt=consent`，即 ChatGPT/Inspector 的真实请求形态）跑通全链路，原始结果：
    - `### got code (state match: true)` → `### TOKEN status=200`，`scope` 含 `umhelper:read`；
    - `initialize` 200 → `serverInfo {name: "what2reg-um", version: "0.1.0"}`；
    - `tools/list` 200 → 恰好五个：`search_catalog`、`get_course`、`get_instructor`、`get_course_reviews`、`get_course_sections`；
    - 五个工具全部 `isError=false` 并返回真实数据：`search_catalog` 列出 ACCT 系列课程；`get_course ACCT1000` 返回 11 位教师与评价数；`get_course_sections` 返回 `Section 007: FRI 11:30-12:45 @ E22-2002`；`get_instructor "CHAI LAI PING"` 返回 8 门课；`get_course_reviews ACCT1000 + CHAI LAI PING` 返回 5 条公开评价（日期、评分、赞踩、正文）；
    - 输出全部带 `https://umeh.top/...` 引用链接，且不含 email、内部 ID、评论者身份或 `admin_note` —— 敏感字段禁区在真实数据下同样成立。
    - 遗留的客户端小问题（与服务器无关）：MCP Inspector 若在流程中途重复点击连接，回调会因 `state` 过期报 "OAuth callback could not be matched"；重新一次性连完即可。生产 OAuth app `What2Reg@UM MCP`（`kOJV0bh86NtGDVte`）已登记稳定回调 `https://chatgpt.com/connector_platform_oauth_redirect`，可直接进行 ChatGPT 侧联调。

## 6. 仍需人工/控制台完成

| 计划步骤 | 内容 |
| --- | --- |
| Task 9 Step 5 | 用真实 Clerk OAuth token 跑 MCP Inspector 本地协议检查（需要真实凭据，未执行） |
| Task 12 Step 1 | Clerk Dashboard：启用 Authorization Code + S256 PKCE 与 CIMD、添加 `umhelper:read`、**把 resource/audience 绑定为 `https://umeh.top/mcp`**、允许 ChatGPT/Codex 官方 CIMD client |
| Task 12 Step 2–4 | Cloudflare 设置 `OPENAI_APPS_CHALLENGE_TOKEN`、部署、匿名边界 curl 复核、在 OpenAI portal 完成 **Verify Domain**（未成功前不得连接 MCP 或提交审核） |
| Task 12 Step 5 | 用真实测试账号完成 OAuth 登录 + 五个工具各至少一次成功调用 + 撤销后旧 token 失效 |
| Task 13 | 最终门槛（含 `npm audit --omit=dev`）、提交前安全 grep、审核 demo 视频、测试账号、portal 预检与提交、代码审查与分支收尾 |
| Task 11 补充 | 人工评审并替换占位图标；在 portal 上校验 `plugin.json` 的 OpenAI 扩展字段（本地测试只能保证内部一致性与计划描述一致） |

## 7. 提交记录

```
2cdc882 chore: add compatible MCP server dependencies
ca92730 feat: add OpenAI domain verification endpoint
576c36c feat: add Clerk OAuth metadata and token verification
b7ededa feat: add protected MCP transport
d51ef3b feat: enforce MCP execution limits
d4a953d feat: add catalog search MCP tool
8e2b795 feat: add course and instructor MCP tools
d580d69 feat: add reviews and sections MCP tools
67227cb test: verify authenticated MCP protocol boundaries
7299ae9 docs: add plugin support and privacy disclosures
2981061 feat: package What2Reg public agent plugin
```
