# next-web Next.js 15 + Clerk 7 基础升级设计

> 状态：Approved for planning
> 日期：2026-10-05
> 前置：现有 Next.js 14.2 + Clerk 4 网站可构建、可测试
> 后续：完成本升级后，再实施 `2026-10-05-umhelper-gpt-plugin-design.md`

## 1. 背景

`next-web` 当前使用 Next.js `^14.2.35`、React `^18.2.0` 和 `@clerk/nextjs` `^4.27.1`。计划中的公开 GPT 插件需要 Clerk 官方 MCP 工具，而当前 `@clerk/mcp-tools@0.6.0` 要求 `@clerk/nextjs@^7.2.3` 与 Next.js 15.2.8 以上。Clerk 7 还把 `auth()`、`clerkClient()` 变为异步接口，并移除了若干旧组件与重定向属性。

本升级建立插件实施所需的框架与认证基线。它只处理 Next.js、Clerk 以及直接受其 breaking changes 影响的代码，不实现 MCP、OAuth client 配置、OpenAI 域名验证路由或任何插件工具。

2026-09-21 的 Clerk v6 草案混合了旧版本判断和 iOS HMAC 迁移，已经不适用于当前目标。该草案标记为 Superseded，本设计取代其中的 Clerk 升级部分；iOS HMAC 工作继续作为独立安全任务。

## 2. 目标与非目标

### 2.1 目标

- **G1**：升级到 Next.js `15.5.27`、`eslint-config-next` `15.5.27`、`@clerk/nextjs` `7.9.10`。
- **G2**：保留 React / React DOM 18，避免无关的 React 19 行为变化。
- **G3**：迁移 Clerk middleware、异步服务端 API、客户端控制组件与重定向环境变量。
- **G4**：迁移 Next.js 15 的异步 `params` / `searchParams`，不依赖临时兼容类型。
- **G5**：保持现有网站页面、JSON API、管理员权限、匿名评论和 iOS HMAC 行为。
- **G6**：继续通过 Vitest、TypeScript、ESLint、Next production build 和 OpenNext Cloudflare build。
- **G7**：为后续安装 `@clerk/mcp-tools` 提供满足 peer dependency 的稳定基线。

### 2.2 非目标

- **N1**：本次不安装 `@clerk/mcp-tools`，不新增 `/mcp` 或 OAuth discovery 路由。
- **N2**：不实现 OpenAI `/.well-known/openai-apps-challenge`；该项属于插件实施计划。
- **N3**：不配置 Clerk Dashboard 的 OAuth application、CIMD、scope 或 redirect URI。
- **N4**：不升级到 Next.js 16、React 19、ESLint 9 或 Tailwind 新主版本。
- **N5**：不修改数据库 schema、Supabase RPC、管理员模型或 iOS HMAC 协议。
- **N6**：不重新设计登录、注册、导航或账户 UI。

## 3. 固定版本与运行环境

升级使用明确版本，避免 caret 在安装或 CI 中解析到未经验证的新主线行为：

| 包或运行时 | 目标 | 理由 |
| --- | --- | --- |
| `next` | `15.5.27` | Next 15.5 当前补丁版；同时满足 Clerk 7 与 OpenNext peer range |
| `eslint-config-next` | `15.5.27` | 与 Next 精确对齐 |
| `@clerk/nextjs` | `7.9.10` | 当前 Clerk 7 稳定版；满足后续 MCP tools `^7.2.3` |
| `react` / `react-dom` | 保持 `^18.2.0` | Clerk 7 与 Next 15.5 均支持，缩小迁移面 |
| `@opennextjs/cloudflare` | 保持 `^1.14.10` | peer range 支持 `~15.5.9`，覆盖 15.5.27 |
| Node.js | `>=20.9.0` | Clerk 7 的最低要求 |
| ESLint | 保持 `^8.57.1` | `eslint-config-next@15.5.27` 仍支持 ESLint 8 |

`package.json` 新增 `engines.node: ">=20.9.0"`。直接依赖 `@clerk/backend` 当前没有源码引用，应移除，由 `@clerk/nextjs` 管理其兼容的后端依赖。`package-lock.json` 使用当前 npm 重新生成并提交。

## 4. Clerk 迁移

### 4.1 Middleware 只负责注入 Clerk 请求状态

当前 `authMiddleware({ publicRoutes })` 同时承担 Clerk 初始化和路由保护。Clerk 当前指南建议在真正读取资源的位置执行授权。仓库已有以下边界：

- `/admin` 页面通过 `app/admin/layout.tsx` 调用 `getCurrentAdmin()`；
- 管理 API 调用 `requireAdmin()`；
- 写 API 调用 `requireWriteIdentity()` 或同级专用 guard；
- 课表 API 在 Route Handler 内检查 Clerk userId；
- 公开页面本来就允许匿名访问。

因此 `middleware.ts` 改为无回调的 `clerkMiddleware()`，保留推荐 matcher，只注入 Clerk 请求状态。它不再维护易失真的 public-route 白名单，也不在 API 边界产生 HTML 重定向。权限检查继续由页面 layout 和 Route Handler 返回既有的 redirect、404 或 JSON `401/403`。

实施时要保留一项静态安全测试：每个敏感 API 仍引用批准的 guard。升级不得通过删除 route-level guard 来消除测试失败。

### 4.2 服务端 API 全部异步化

所有 Clerk 服务端调用遵守 Clerk 7 契约：

```ts
const { userId } = await auth();
const client = await clerkClient();
```

这包括 `lib/api-auth.ts`、`lib/admin-auth.ts`、所有课表 API、vote API、管理员用户 API，以及 `lib/clerk/user-directory.ts`。测试 mock 也必须返回 Promise，避免同步 mock 掩盖遗漏的 `await`。

`getDirectoryUsers()` 保留现有缓存、100 人分块、异常降级和公开字段映射。唯一行为变化是先等待 `clerkClient()`，再调用 `client.users.*`。

### 4.3 客户端组件与重定向

Clerk Core 3 移除 `SignedIn` / `SignedOut`。导航组件改用：

```tsx
<Show when="signed-in">...</Show>
<Show when="signed-out">...</Show>
```

`SignInButton redirectUrl` 改为 `fallbackRedirectUrl={pathname}`，保留“登录后回到当前页”的现有体验，同时允许显式 OAuth 流程提供更高优先级的 redirect。Clerk Core 3 不再接受 `UserButton afterSignOutUrl`，因此从 `UserButton` 删除该 prop，并在 `ClerkProvider` 设置全局 `afterSignOutUrl="/"`，避免登出后把用户留在受保护页。

环境变量改名：

| 旧变量 | 新变量 |
| --- | --- |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` |

`NEXT_PUBLIC_CLERK_SIGN_IN_URL` 和 `NEXT_PUBLIC_CLERK_SIGN_UP_URL` 保持不变。开发示例与 Cloudflare 类型只保留新名；生产部署在切换版本前先增加新变量，旧变量可留到回滚窗口结束再从 Cloudflare 删除。

### 4.4 Provider 与认证页面

`ClerkProviderClient` 已位于 `<body>` 内，符合 Clerk Core 3 要求，继续保留该结构。`/sign-in/[[...sign-in]]` 与 `/sign-up/[[...sign-up]]` 保持现有 URL 和 catch-all 路由；只增加 Clerk 7 明确要求的 props 或动态渲染声明，不改变页面外观。

## 5. Next.js 15 迁移

### 5.1 异步页面 props

所有动态 App Router 页面和 layout 将 `params` / `searchParams` 声明为 Promise，并在使用前等待：

```ts
type PageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function Page({ params, searchParams }: PageProps) {
  const { code } = await params;
  const query = await searchParams;
}
```

`generateMetadata` 同样改为 async。迁移范围包括 catalog、compare、course、professor、reviews、search 和 submit 动态页面。不能使用 `UnsafeUnwrapped*`、`any` 或类型断言保留同步读取。

### 5.2 异步 Route Handler context

所有动态 Route Handler 把 context 改为 `params: Promise<...>` 并在进入业务逻辑时等待。范围包括：

- 评论和投票动态路由；
- 管理员 comments、courses、reports、prof-with-course、admins、Supabase relay；
- 课表 course、instructor、sections、plans、share、public share 路由。

对应的 Vitest 路由测试传入 `Promise.resolve({...})`，与生产类型一致。请求状态码、JSON shape 和 guard 顺序保持不变。

### 5.3 Lint 与构建

Next 15 的 `next lint` 已弃用。脚本改为 `eslint . --max-warnings=0`，继续使用现有 `.eslintrc.json` 与 ESLint 8。本次不迁移 flat config。

验证顺序固定为：

1. `npm test`
2. `npx tsc --noEmit`
3. `npm run lint`
4. `npm run build`
5. `npm run build:pages`

`next build` 负责生成并验证 App Router 类型；OpenNext build 证明 Cloudflare 适配仍可产出 Worker。任何 Next 15 deprecation warning 都要分类记录，只有与本升级直接相关且会阻止后续版本的警告才在本次处理。

## 6. 测试策略

### 6.1 认证契约

- `api-auth` 和 `admin-auth` 的 Clerk mock 改为 `mockResolvedValue`，确认登录、匿名、iOS 与管理员分支不变；
- 所有课表、vote 和管理员路由测试用异步 `auth()` mock；
- `user-directory` 的 `clerkClient` mock 改为返回 Promise 的函数，继续验证缓存、分块和失败降级；
- 增加 middleware 契约测试，确认它使用 `clerkMiddleware()` 且不在 middleware 内代替资源授权；
- 保留 `tests/security/api-route-guards.test.ts`，确保敏感 Route Handler 仍有 guard。

### 6.2 页面与路由类型

- 动态页面与 layout 由 `tsc` 和 `next build` 验证生成的 `PageProps`；
- Route Handler 单测使用 Promise params，确保生产入口实际等待 context；
- 针对 reviews 的 `params + searchParams`、Supabase catch-all 的数组 params 和三方法 plans/share 路由保留代表性回归覆盖。

### 6.3 UI 与人工 smoke test

自动化验证导航中 signed-in / signed-out 控件使用 Clerk 7 的 `Show` 与新 redirect props。生产或 preview 人工检查：

- 匿名访问首页、课程、教授、评价、搜索与课表页面；
- modal 登录后返回原页面；
- `/sign-in`、`/sign-up`、登出跳转；
- 匿名访问 `/admin`，登录后的非管理员和管理员访问；
- 受保护 JSON API 对匿名请求继续返回 JSON `401/403`，不返回 Clerk HTML；
- 评论、回复、投票、举报和课表增删改查；
- iOS HMAC 请求行为不变。

## 7. 部署与回滚

生产部署前先配置两个新的 Clerk fallback redirect 环境变量。升级构建作为一个原子版本发布，不能只部署 package 升级而不部署异步 API 改造。

回滚使用升级前的完整构建产物与 lockfile。回滚窗口内保留旧的 `NEXT_PUBLIC_CLERK_AFTER_*` 变量，同时新旧变量都存在不会影响新版本。确认新版本登录、管理员与写 API 稳定后再删除旧变量。

本次没有数据库迁移，因此回滚不涉及数据还原。

## 8. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 漏掉未等待的 `auth()` 或 `params` | 异步 mock、严格 TypeScript、Next 生成类型和全量源码搜索 |
| middleware 改造后受保护资源失守 | 资源级 guard 回归测试与 API guard 静态测试 |
| API 匿名请求变成 HTML redirect | middleware 不调用 `auth.protect()`；Route Handler 继续返回 JSON |
| Clerk 客户端 prop 变化导致登录后跳错页面 | 组件契约测试和 preview 登录/登出 smoke test |
| Next 15 与 OpenNext 不兼容 | 固定 15.5.27；执行 Next build 与 OpenNext build；保留上一构建回滚 |
| 新环境变量未同步到 Cloudflare | 部署前置清单；旧变量保留到回滚窗口结束 |
| React 19 带来额外组件问题 | 本次明确保留 React 18 |

## 9. 验收标准

- `package.json` 固定 Next `15.5.27`、Clerk `7.9.10`、matching eslint config，并声明 Node `>=20.9.0`。
- 直接 `@clerk/backend` 依赖已移除，`npm install` 无 peer dependency 错误。
- `middleware.ts` 使用 `clerkMiddleware()`；所有敏感资源仍在 layout 或 Route Handler 内授权。
- 源码不存在同步 `auth()`、同步 `clerkClient`、`SignedIn`、`SignedOut`、`redirectUrl` 或旧 `NEXT_PUBLIC_CLERK_AFTER_*` 引用。
- 所有动态页面、layout 和 Route Handler 按 Next 15 契约等待 `params` / `searchParams`，无 `any` 兼容绕过。
- `npm test`、`npx tsc --noEmit`、`npm run lint`、`npm run build`、`npm run build:pages` 全部通过。
- preview smoke test 覆盖登录、登出、注册、管理员、写 API 和课表；匿名业务 API 不因升级变为公开读取。
- 完成本升级后，安装 `@clerk/mcp-tools@0.6.0` 不再产生 Next 或 Clerk peer dependency 冲突。

## 10. 参考资料

- Next.js 15 upgrade guide: <https://nextjs.org/docs/app/guides/upgrading/version-15>
- Clerk Core 3 upgrade guide: <https://clerk.com/docs/guides/development/upgrading/upgrade-guides/core-3>
- Clerk resource-level authorization migration: <https://clerk.com/docs/guides/development/upgrading/upgrade-guides/migrate-from-create-route-matcher>
- OpenNext Cloudflare package compatibility: <https://www.npmjs.com/package/@opennextjs/cloudflare>
