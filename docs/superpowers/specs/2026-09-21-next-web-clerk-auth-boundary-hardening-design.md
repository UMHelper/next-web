# next-web Clerk 鉴权边界与写接口契约收口设计（P0）

> 状态：Draft，等待人工 review
> 日期：2026-09-21
> 前置：Phase 1A 写接口安全已上线（`docs/superpowers/verification/2026-09-18-write-api-security.md`）
> 后续：review 通过后由 `writing-plans` 生成实施计划
> 不在本 spec：Clerk 大版本升级（P2）、账户生命周期 webhook（P1）、platform admin metadata 迁移（P3-1）

---

## 1. 背景

2026-09-21 对 next-web 的 Clerk 账户体系做了一次只读审查。核心结论：**“身份由服务端派生”这个最重要的边界做对了**，但仍有若干不符合当前最佳实践的点。本 spec 收敛其中风险最低、可独立交付的一批；Clerk 升级、账户生命周期、platform admin 迁移分别由后续 spec 处理。

本 spec 覆盖审查编号：

| 编号 | 问题 | 本 spec 的处理 |
|---|---|---|
| C1 | platform admin 邮箱白名单未校验验证状态，且 fallback 到未验证邮箱 | 过渡期加固；P3-1 会删除整条邮箱白名单 |
| I2 | `/api/(.*)` 在 middleware 默认放行，缺少“默认拒绝”的强制机制 | 增加路由守卫策略测试 + 显式公开白名单 |
| I4 | Clerk 后端调用无分页、无缓存 | 新增 `lib/clerk/user-directory.ts` 统一封装 |
| I5 | Web 客户端仍发送 `verify` / `verify_account` / `created_by`；写接口缺少 401 处理 | 清理客户端 payload + 正确处理非 2xx |
| M1 | `@clerk/backend` 与 `clerkClient` 两套 client 并存 | 统一到 `clerkClient`，移除顶层直接依赖 |
| M2 | middleware matcher 用 `.*\..*` 排除所有带点路径 | 对齐 Clerk 官方默认 matcher |

---

## 2. 目标与非目标

### 2.1 目标

- **G1**：platform admin 邮箱匹配只接受 **primary 且已验证** 的邮箱，删除 `emailAddresses[0]` fallback。
- **G2**：为全部 `app/api/**/route.ts*` 建立“默认拒绝”的自动化检查：每个 route 必须引入已知 guard，或出现在带理由的公开白名单里。
- **G3**：新增 `lib/clerk/user-directory.ts`，统一封装 Clerk 用户目录读取：分页、单次上限、TTL 缓存。
- **G4**：Web 端回复/投票不再发送 `verify` / `verify_account` / `created_by`；客户端正确处理 401 和其他非 2xx。
- **G5**：删除顶层 `@clerk/backend` 直接依赖，统一走 `@clerk/nextjs/server` 的 `clerkClient`。
- **G6**：middleware matcher 对齐 Clerk 官方默认 matcher。
- **G7**：为上述行为补 Vitest 覆盖，`npm run test`、`npx tsc --noEmit` 全绿。

### 2.2 非目标

- **N1**：不升级 `@clerk/nextjs` 大版本（P2 处理）。
- **N2**：不实现 Clerk webhook / `user.deleted`（P1 处理）。
- **N3**：不迁移 platform admin 到 Clerk metadata（P3-1 处理）。
- **N4**：不改数据库 schema，本批不需要迁移。
- **N5**：不做 OAuth / 注册域名策略（P3-2，明确不做）。
- **N6**：不重写评论/回复/投票 UI，只做 payload 与错误处理收口。

---

## 3. 当前事实与证据

- `middleware.ts:1-20`：`authMiddleware`；`publicRoutes` 含 `/api/(.*)`；matcher 为 `["/((?!.*\\..*|_next).*)", "/api/(.*)"]`。
- `lib/admin-auth.ts:31-38`：`ClerkUserEmail` 类型没有 `verification` 字段；`getPrimaryClerkEmail` fallback 到 `emailAddresses[0]`。
- `lib/admin-auth.ts:55-62`：`getUserList({ userId: uniqueIds, limit: uniqueIds.length })`，无上限、无分页。
- `components/comment-card.tsx:184-185`：回复 payload 发送 `verify: 1`、`verify_account: user?.id`。
- `components/comment-card.tsx:401`：投票 payload 发送 `created_by: user?.id`。
- `components/comment-card.tsx:187-208`、`:393-410`：`.then(res => res.json())` 未检查 `res.ok`。
- `app/api/admin/admins/route.ts:1,87`：`import { Clerk } from "@clerk/backend"` 并 `Clerk({ secretKey })`。
- `components/browser-diagnostics.tsx:131` + `components/footer.tsx:43`：`/api/browser-diagnostics` 是面向所有用户的 **Environment Info 支持工具**，当前无鉴权，属于有意的公开支持接口。
- 基线测试：38 files / 108 tests passed（2026-09-21 本地运行 `npm run test`）。

---

## 4. 关键设计决策

### D1：邮箱只认“primary + verified”

`getPrimaryClerkEmail` 的输入类型扩展为包含 `verification`：

```ts
type ClerkEmailAddress = {
  id: string;
  emailAddress: string;
  verification: { status: string | null } | null;
};

type ClerkUserEmail = {
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmailAddress[];
};
```

规则：

1. 找到 `id === primaryEmailAddressId` 的邮箱；
2. 该邮箱存在且 `verification?.status === "verified"` 才返回 `emailAddress.toLowerCase()`；
3. 否则返回 `null`，**不再回退** 到 `emailAddresses[0]`。

理由：邮箱是可变的登录标识，只有已验证的 primary 邮箱才可以作为授权依据。P3-1 会删除整条邮箱白名单，因此这里只做到“不制造新漏洞”。

### D2：路由守卫策略测试 + 显式公开白名单

`/api/(.*)` 在 middleware 层 public 是为了让未登录 API 返回 JSON 401 而不是 HTML 重定向（Phase 1A 的明确决策），本 spec 不改这个运行时行为；改用**测试强制默认拒绝**：

- 新增 `tests/security/api-route-guards.test.ts`：扫描 `app/api/**/route.ts*`；
- 每个 route 文件必须满足以下之一：
  - 引入并调用已知 guard：`verifyIOSRequest`、`requireWriteIdentity`、`resolveCommentIdentity`、`resolveReportIdentity`、`requireAdmin`、`getCurrentAdmin`；
  - 出现在测试内的 `PUBLIC_API_ROUTES` 白名单里，且每条白名单必须在同文件写明理由。
- 本批白名单只允许：`/api/browser-diagnostics`（公开的用户支持工具）。
- 测试失败信息要直接打印缺失 guard 的文件路径，方便新增 route 时立即发现。

这样 future 新增 API 若忘记鉴权，CI 会失败，达到“默认拒绝”的效果，同时不破坏公开支持接口。

### D3：`lib/clerk/user-directory.ts` 统一 Clerk 用户目录

新增模块，作为所有 Clerk 用户信息读取的唯一入口：

```ts
export type ClerkDirectoryUser = {
  id: string;
  primaryEmail: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  publicMetadata: Record<string, unknown>;
};

export async function getDirectoryUser(userId: string): Promise<ClerkDirectoryUser | null>;
export async function getDirectoryUsers(userIds: string[]): Promise<Map<string, ClerkDirectoryUser>>;
export function invalidateDirectoryCache(userIds?: string[]): void;
export function __resetDirectoryCacheForTests(): void;
```

实现要点：

- 单次 `getUserList` 的 `limit` 取 `Math.min(remaining, 100)`，用 `offset` 循环直到取完或达到安全上限（例如 1000，超过则记录 warning）；
- 进程内 TTL 缓存，默认 60s；key 为 `userId`；
- 缓存未命中才调用 Clerk；批量读取去重；
- `lib/admin-auth.ts` 改为从这个模块取邮箱，删除 `getClerkUserEmail(s)` 的重复实现；
- `app/admin/page.tsx` 的 1.5s `Promise.race` 保留，但超时时要 `console.warn`，避免静默丢失。

`invalidateDirectoryCache` 为 P3-1（metadata 变更后失效）预留接口。

### D4：客户端身份字段清理 + 401 处理

`components/comment-card.tsx`：

- `submitReply`：payload 只保留 `replyto` + `content`；删除 `body.verify`、`body.verify_account`、`body.pub_time`。
- `handleVote`：payload 只保留 `comment` + `offset` + `emoji`；删除 `created_by`。
- 两个请求都先检查 `res.ok`：
  - 401 → `toast.error` 提示重新登录，不把错误对象塞进列表；
  - 其他非 2xx → 使用服务端 `error.message` 提示；
  - 仅在成功时更新本地 state。

服务端行为不变（继续忽略客户端身份字段），这是纯契约清理。

### D5：统一 `clerkClient`

`app/api/admin/admins/route.ts` 删除 `import { Clerk } from "@clerk/backend"` 和 `Clerk({ secretKey })`，改用 `clerkClient.users.*`（已在 `@clerk/nextjs/server` 导出）。删除 `package.json` 顶层 `@clerk/backend` 直接依赖；确认 `grep -rn "@clerk/backend" --include=*.ts --include=*.tsx` 为空后即可移除。

### D6：middleware matcher 对齐官方

`middleware.ts` 的 `config.matcher` 改为 Clerk 官方默认：

```ts
export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

理由：现有 `.*\..*` 会跳过任何路径里带点的请求；官方 matcher 只排除“以扩展名结尾”的静态资源，语义更准确。`publicRoutes` 本批不变（由 P2 统一迁移到 `clerkMiddleware`）。

---

## 5. 影响文件清单

| 文件 | 动作 |
|---|---|
| `lib/clerk/user-directory.ts` | 新增 |
| `lib/admin-auth.ts` | 修改：邮箱校验、改用 user-directory |
| `app/api/admin/admins/route.ts` | 修改：统一 `clerkClient`、适配 user-directory |
| `app/admin/page.tsx` | 修改：超时日志、适配 user-directory |
| `components/comment-card.tsx` | 修改：payload 清理、`res.ok` 处理 |
| `middleware.ts` | 修改：matcher |
| `package.json` / `package-lock.json` | 修改：移除顶层 `@clerk/backend` |
| `.env.example` | 修改：`PLATFORM_ADMIN_EMAILS` 注释标注“仅过渡，P3-1 删除” |
| `tests/clerk/user-directory.test.ts` | 新增 |
| `tests/security/api-route-guards.test.ts` | 新增 |
| `tests/admin-auth.test.ts` | 修改：未验证邮箱 / fallback 移除 |
| `tests/components/comment-card*.test.tsx` | 修改或新增：payload / 401 |
| `tests/api/admin/admins.test.ts` | 新增或修改：clerkClient 适配 |

---

## 6. 测试策略

- **单元**：`getPrimaryClerkEmail` 的 verified / unverified / 无 primary / fallback 移除四类；user-directory 的分页、去重、TTL、安全上限。
- **策略测试**：`api-route-guards.test.ts` 覆盖全部现有 API route；故意新增一个无 guard route 时测试必须 FAIL（用 fixture 目录或纯函数拆出扫描逻辑后测试）。
- **组件**：回复 payload 不含 `verify` / `verify_account`；投票 payload 不含 `created_by`；401 时显示错误且不更新列表。
- **回归**：`npm run test`、`npx tsc --noEmit`、`npm run lint`、`npm run build`。
- 所有测试必须能独立运行，不依赖真实 Clerk / Supabase。

---

## 7. 部署与回滚

- 部署：常规发布；本批无 DB 迁移、无人工 Dashboard 步骤。
- 回滚：纯代码回滚，无数据影响；`@clerk/backend` 若移除后需回滚，还原 `package.json` 与 lockfile 即可。
- 观察项：Clerk API 调用量应因缓存下降；管理后台邮箱列不应再出现整列 `-`。

---

## 8. 验收标准

- [ ] `getPrimaryClerkEmail` 对未验证邮箱返回 `null`，且不存在 `emailAddresses[0]` fallback。
- [ ] `tests/security/api-route-guards.test.ts` 覆盖所有 `app/api/**/route.ts*`，且能捕获新增的无 guard route。
- [ ] `lib/clerk/user-directory.ts` 有分页、单次上限、TTL 缓存测试。
- [ ] `components/comment-card.tsx` 不再发送任何客户端身份字段；401 不再被当作成功。
- [ ] `grep -rn "@clerk/backend" --include=*.ts --include=*.tsx` 无结果；`package.json` 不再直接依赖。
- [ ] `npm run test` / `npx tsc --noEmit` / `npm run lint` / `npm run build` 全部通过，并记录原始输出。
- [ ] `.env.example` 中 `PLATFORM_ADMIN_EMAILS` 标注了 P3-1 删除计划。

---

## 9. 待人工确认的决策

1. **`/api/browser-diagnostics` 是否保留公开**：本 spec 默认保留（footer 的 Environment Info 面向所有用户）。如果你希望改为登录后可用或管理员专用，请在 review 时说明，我会调整白名单与客户端提示。
2. **user-directory 缓存 TTL**：默认 60s。管理员列表对实时性要求不高；如果你希望撤销授权更快生效，可降到 10–30s。P3-1 会增加主动失效。
