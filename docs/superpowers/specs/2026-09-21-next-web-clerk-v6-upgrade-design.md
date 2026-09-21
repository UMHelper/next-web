# next-web Clerk v4 → v6 升级设计（P2）

> 状态：Draft，等待人工 review
> 日期：2026-09-21
> 前置：P0（鉴权边界收口）、P1（账户生命周期 webhook）已上线
> 后续：review 通过后由 `writing-plans` 生成实施计划
> 不在本 spec：P3-1（platform admin metadata 迁移，最后做）

---

## 1. 背景

next-web 当前使用 `@clerk/nextjs` v4（`package.json:23` 声明 `^4.27.1`，实际安装 `4.31.8`），并使用 v4 的 `authMiddleware`：

```ts
// middleware.ts:1-3
import { authMiddleware } from "@clerk/nextjs/server";
export default authMiddleware({ publicRoutes: [...] });
```

问题：

1. **`authMiddleware` 已被废弃**：Clerk v5 起推荐 `clerkMiddleware`，v6 是当前主线；v4 已不在支持周期。
2. **`auth()` 是同步 API**：v5+ 改为 async，升级会导致 5 处调用点全部需要改。
3. **客户端 props / 环境变量命名变化**：`SignInButton redirectUrl`、`NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` 等在 v5+ 有替代。
4. **附带安全项 I6**：iOS 请求的 `X-UM-Viewer-Id` 不在 HMAC 签名范围内（`lib/ios-auth.ts:40`），任何持有共享密钥的客户端可以冒充任意 viewer id。

本 spec 负责把 Clerk 升到 v6，并顺带收紧 iOS 签名。

---

## 2. 目标与非目标

### 2.1 目标

- **G1**：`@clerk/nextjs` 升级到 v6（若兼容性 spike 证明 v6 需要 Next 15 且不允许升 Next，则退到 v5 最新版，理由写入实施记录）。
- **G2**：`middleware.ts` 迁移到 `clerkMiddleware` + `createRouteMatcher`；保持现有 public/protected 语义完全一致。
- **G3**：全项目 `auth()` 改为 `await auth()`；相关 mock / 测试同步改。
- **G4**：客户端 `SignInButton` / `UserButton` props 迁移到 v6 API；环境变量改名。
- **G5**：API route 继续保持“返回 JSON 401”的行为，不做 HTML 重定向。
- **G6**：iOS `X-UM-Viewer-Id` 纳入 HMAC 签名，并提供新旧双接受的过渡期。
- **G7**：升级后 `npm run test`、`npx tsc --noEmit`、`npm run lint`、`npm run build`、`opennextjs-cloudflare preview` 全部通过。
- **G8**：补 middleware 集成测试与 iOS 签名双版本测试。

### 2.2 非目标

- **N1**：不迁移 platform admin 到 metadata（P3-1）。
- **N2**：不做 OAuth / 注册域名策略（P3-2，明确不做）。
- **N3**：不重写认证 UI，只做必需的 props 迁移。
- **N4**：不改数据库 schema。
- **N5**：不在本 spec 实现 next-ios 的 UI 变更；iOS 侧只改签名构造（跨仓库，见 §9）。

---

## 3. 当前事实与证据

`auth()` 调用点（全项目 5 处）：

- `app/reviews/[code]/[...prof]/page.tsx:67`
- `lib/api-auth.ts:50,84,108`
- `lib/admin-auth.ts:74`

客户端 props：

- `components/comment-card.tsx:142,162,365`：`<SignInButton mode="modal" redirectUrl={pathname}>`
- `components/navbar-avatar.tsx:19,24`：`UserButton afterSignOutUrl`、`SignInButton redirectUrl`
- `components/mobile-sidebar.tsx:51`：`SignInButton redirectUrl`

环境变量：

- `.env.example:52-55`：`NEXT_PUBLIC_CLERK_SIGN_IN_URL`、`NEXT_PUBLIC_CLERK_SIGN_UP_URL`、`NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`、`NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`
- `cloudflare-env.d.ts:18-21` 同样列出

iOS 签名：

- `lib/ios-auth.ts:40`：`message = `${method}\n${pathname}\n${timestamp}``，不含 `x-um-viewer-id`
- `next-ios` 侧 `APIClient` 已发送 `X-UM-Viewer-Id`（见 `.agents/superpowers/verification/2026-09-20-next-ios-write-identity-sync.md`）

部署目标：Next.js 14.2.35 + OpenNext/Cloudflare（`wrangler.jsonc` 使用 `nodejs_compat`）。

---

## 4. 关键设计决策

### D1：升级目标与兼容性 spike（必须先做）

实施第一步是一个**只验证、不保留代码**的 spike：

1. 在临时 worktree 把 `@clerk/nextjs` 升到 v6 最新，跑 `npm install`；
2. 检查 peer dependency：是否要求 `next@^15`、`react@^19`；
3. 跑 `npx tsc --noEmit`、`npm run build`、`opennextjs-cloudflare build`；
4. 记录结论，然后**丢弃** spike 改动，正式实现从干净 worktree 开始。

决策规则：

- v6 兼容当前 Next 14.2 / React 18 → **目标 v6**；
- v6 要求 Next 15 / React 19 → 暂停并请人工决策；
  - 若允许：本 spec 追加“Next 15 升级”任务（见 D7）；
  - 若不允许：目标改为 **v5 最新版**，并在 spec 状态里注明。
- v6 在 OpenNext/Cloudflare 构建失败且无法绕过 → 目标改为 v5 最新版或暂缓，并把失败证据写入计划。

### D2：middleware 迁移

v4：

```ts
export default authMiddleware({
  publicRoutes: [/* ... */],
});
```

v6：

```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/catalog(.*)",
  "/course(.*)",
  "/professor(.*)",
  "/reviews(.*)",
  "/search(.*)",
  "/timetable(.*)",
  "/submit(.*)",
  "/privacy-policy(.*)",
  "/terms-of-service(.*)",
  "/api/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

要点：

- **public 集合必须逐条等价**，包括 `/api/(.*)`（API 继续由 route 自校验 JSON 401）。P0 已用策略测试强制所有 API route 有 guard，因此这里保持“middleware 放行 API、route 守门”。
- `auth.protect()` 只用于非 API 的受保护页面；这样未登录用户访问 `/admin` 仍会被重定向到 sign-in，与现状一致。
- sign-in / sign-up 路径继续通过 env 自动纳入 public。

### D3：`auth()` 异步化

所有调用点改为 `const { userId } = await auth();`：

- `lib/api-auth.ts`：3 处；函数本身已是 async，无签名变化。
- `lib/admin-auth.ts`：1 处；`getCurrentAdmin` 已是 async。
- `app/reviews/[code]/[...prof]/page.tsx`：1 处；页面组件已是 async（Server Component）。

测试影响：

- `tests/api-auth.test.ts:9`、`tests/admin-auth.test.ts:10` 等 mock 的 `auth` 需要返回 Promise（`vi.fn().mockResolvedValue({ userId })`）；
- 所有直接构造 `auth` mock 的测试都要检查一遍（`grep -rn "auth: vi.fn()" tests`）。
- 这个改动是机械的，但必须逐个断言，不能靠“编译过”。

### D4：客户端 props 与环境变量迁移

| 旧（v4） | 新（v6） |
|---|---|
| `<SignInButton redirectUrl={pathname}>` | `<SignInButton fallbackRedirectUrl={pathname}>`（显式流程用 `forceRedirectUrl`） |
| `<UserButton afterSignOutUrl={pathname}>` | 保留 `afterSignOutUrl`；若类型已移除，改用 v6 等价 prop，以类型定义为准 |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `SIGN_UP_URL` | 保持不变 |

同时更新 `.env.example`、`cloudflare-env.d.ts`，并在生产环境变量里新增新名、保留旧名一个发布周期（避免回滚窗口内配置缺失）。旧名确认无引用后再清理。

由于 `redirectUrl` 是 `SignInButton` 的 API，需要逐处确认 v6 类型；实现时以 `node_modules/@clerk/nextjs` 的类型声明为准，**不接受“看起来能跑”**。

### D5：ClerkProvider 与 sign-in/sign-up 页面

检查 v6 对 App Router 的要求：

- `app/layout.tsx` 的 `<ClerkProvider>` 位置是否仍支持包住 `<html>`；
- `app/sign-in/[[...sign-in]]/page.tsx`、`app/sign-up/[[...sign-up]]/page.tsx` 的 catch-all 路由在 v6 是否仍推荐；如果 v6 推荐 path-based（`routing="path"` + `NEXT_PUBLIC_CLERK_SIGN_IN_URL`），按 v6 文档调整并保留现有 URL 不变。
- 如果 v6 要求对 sign-in/sign-up 页面设置 `export const dynamic = "force-dynamic"` 或 `runtime`，一并加上（以文档与构建结果为准）。

### D6：iOS `X-UM-Viewer-Id` 纳入 HMAC（I6）

新签名格式：

```
message = `${method}\n${pathname}\n${viewerId}\n${timestamp}`
```

服务端 `lib/ios-auth.ts` 增加双接受过渡：

```ts
export function verifyIOSRequest(request: Request): boolean {
  // 1. 读 viewerId（可能为空）
  // 2. 若存在 x-um-viewer-id：只接受新格式
  // 3. 若不存在 viewerId：先按新格式校验，失败再按旧格式校验（兼容老客户端）
}
```

更精确的迁移策略：

- **阶段 1（本 spec 部署）**：服务端接受新格式 + 旧格式；`UM_IOS_REQUIRE_SIGNED_VIEWER_ID` 未设置时保持旧格式可用。
- **阶段 2（next-ios 发布后）**：客户端所有写请求按新格式签名并发送 `X-UM-Viewer-Id`。
- **阶段 3（收口）**：把 `UM_IOS_REQUIRE_SIGNED_VIEWER_ID=1` 打开，服务端拒绝旧格式；再过一个版本号后删除旧格式代码路径。

注意：读接口（GET）目前不发送 `X-UM-Viewer-Id`，阶段 1 必须继续允许旧格式，否则会立即打断已发布客户端。收口依据是 `UM_IOS_MIN_SUPPORTED_VERSION` 与真实流量观测。

安全边界说明：纳入签名后，viewer id 与请求绑定，不能再被持有密钥的第三方随意替换；但仍不宣称是强身份（本机 UUID 仍是匿名设备标识，`verify=0`）。

### D7：若必须升级 Next.js（条件分支）

仅当 D1 spike 证明 v6 需要 Next 15 且人工批准时执行：

- 把 Next 14.2 → 15.x，React 18 → 19（如果 v6 要求）；
- 检查 `open-next.config.ts`、`wrangler.jsonc`、`next.config.js` 的兼容性；
- 逐页处理 Next 15 的 breaking changes（`params` / `searchParams` 变 Promise 等）；
- 这一步作为 Spec C 内的独立 task，不与其他 Clerk 改动混在一个提交里。

---

## 5. 影响文件清单

| 文件 | 动作 |
|---|---|
| `package.json` / `package-lock.json` | 升级 `@clerk/nextjs`（可能含 `@clerk/backend`、`@clerk/clerk-react`）；条件分支可能升 Next/React |
| `middleware.ts` | 迁移到 `clerkMiddleware` |
| `lib/api-auth.ts` | `await auth()` |
| `lib/admin-auth.ts` | `await auth()` |
| `app/reviews/[code]/[...prof]/page.tsx` | `await auth()` |
| `components/comment-card.tsx` / `navbar-avatar.tsx` / `mobile-sidebar.tsx` | props 迁移 |
| `app/layout.tsx` / `app/sign-in/**` / `app/sign-up/**` | 按 v6 要求调整 |
| `.env.example` / `cloudflare-env.d.ts` | env 改名 + 新增 `UM_IOS_REQUIRE_SIGNED_VIEWER_ID` |
| `lib/ios-auth.ts` | 新签名格式 + 双接受 |
| `tests/api-auth.test.ts` / `tests/admin-auth.test.ts` / 其他 auth mock | 改为 async mock |
| `tests/middleware/*.test.ts` | 新增 |
| `tests/ios-auth.test.ts` | 新增：新旧签名、边界 |
| `next-ios`（另一仓库） | `APIClient` 签名加入 viewer id |

---

## 6. 测试策略

- **中间件**：用 Next 的 middleware 测试方式或直接调用导出的 middleware 函数，覆盖：public 路由放行、受保护页面未登录重定向、已登录放行、API 路由不被重定向、matcher 排除静态资源。
- **auth helper**：`requireWriteIdentity` / `getCurrentAdmin` 在 async `auth()` 下的路径；mock 改为 resolved promise。
- **组件**：`SignInButton` / `UserButton` props 变更后仍能渲染（jsdom）。
- **iOS 签名**：新格式通过；旧格式在未开启强制时通过；开启 `UM_IOS_REQUIRE_SIGNED_VIEWER_ID=1` 后旧格式 401；viewer id 被替换 → 签名失败。
- **构建**：`npm run build` + `opennextjs-cloudflare build` + `preview` 冒烟。
- **人工回归清单**：登录、登出、注册、匿名评论、登录评论、回复、投票、举报、`/admin` 访问、iOS 三个写接口。

---

## 7. 部署与回滚

**部署顺序**：

1. P0 / P1 已上线；
2. 执行 D1 spike，确定目标版本；
3. 在 worktree 内完成升级，跑全量验证；
4. preprod 冒烟（含 OpenNext/Cloudflare preview）；
5. 生产部署；
6. 观察 Clerk 错误率、middleware 重定向、iOS 426/401 指标。

**回滚**：

- 依赖升级不可“部分回滚”，必须保留上一版构建产物；出问题直接回滚到上一个部署。
- env 改名期间新旧名并存，保证回滚时配置不缺失。
- iOS 签名阶段 1 兼容旧格式，服务端回滚不会立即打断客户端。

---

## 8. 风险

| 风险 | 缓解 |
|---|---|
| v6 与 Next 14 / OpenNext / Cloudflare 不兼容 | D1 spike 前置；必要时退 v5 |
| `auth()` 异步化漏改导致运行时错误 | 全量 `grep "auth()"` + 类型检查 + 集成测试 |
| `auth.protect()` 在 API 路由产生 HTML 重定向 | API 继续 middleware 放行，route 自校验 JSON 401 |
| env 改名导致生产登录跳转异常 | 新旧名并存一个发布周期 |
| iOS 签名升级打断老客户端 | 阶段 1 双接受 + 强制开关 + 观测；收口依赖 min version |
| Cloudflare Worker bundle 体积/兼容 | preview 阶段 smoke + 构建体积对比 |

---

## 9. 验收标准

- [ ] `@clerk/nextjs` 已升级到 v6（或 decision gate 后的 v5），且实现记录里写明了选择依据。
- [ ] `middleware.ts` 使用 `clerkMiddleware`，public/protected 语义与升级前逐条等价，并有中间件测试。
- [ ] 全项目无未 await 的 `auth()`。
- [ ] 客户端无 v4-only props；env 新旧名配置齐全。
- [ ] iOS 新签名格式可用；旧格式在未强制时仍可用；强制开关开启后旧格式被拒绝。
- [ ] `npm run test` / `npx tsc --noEmit` / `npm run lint` / `npm run build` / OpenNext preview 全部通过，并记录原始输出。
- [ ] 人工回归清单全部勾选。
- [ ] 回滚方案与上一版构建产物可用。

---

## 10. 待人工确认的决策

1. **是否允许把 Next.js 从 14 升到 15**：只有 v6 明确要求时才需要。默认策略是“先尝试 v6 on Next 14；需要 Next 15 时暂停询问”。
2. **iOS 收口时间点**：阶段 3 打开 `UM_IOS_REQUIRE_SIGNED_VIEWER_ID=1` 前，需要有 next-ios 发布与采用率数据；请确认谁来观测与拍板。
3. **sign-in/sign-up 是否改为 v6 推荐的 path-based routing**：这会影响现有 catch-all 路由文件结构；默认保持现有 URL 行为，只在 v6 要求时调整。
