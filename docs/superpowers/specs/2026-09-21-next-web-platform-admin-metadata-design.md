# next-web Platform Admin 迁移到 Clerk Metadata 设计（P3-1）

> 状态：Draft，等待人工 review
> 日期：2026-09-21
> 前置：P0（`lib/clerk/user-directory.ts`）、P1（`app_users` 表 + Clerk webhook）已上线
> 后续：review 通过后由 `writing-plans` 生成实施计划
> 不在本 spec：P2 Clerk 大版本升级（排在 P3-1 之前）、P3-2 OAuth/注册策略、后台自助授予 platform admin

---

## 1. 背景

当前 platform admin 的授权来源是环境变量：

- `PLATFORM_ADMIN_USER_IDS`：逗号分隔 Clerk userId（`.env.example:45`）
- `PLATFORM_ADMIN_EMAILS`：逗号分隔 Clerk 邮箱（`.env.example:47`）

`lib/admin-auth.ts:66-90` 的判定顺序：

1. `auth()` 有 userId；
2. userId 在 `PLATFORM_ADMIN_USER_IDS` → platform admin；
3. 主邮箱在 `PLATFORM_ADMIN_EMAILS` → platform admin；
4. userId 在 `admin_users` 且 `active = true` → 普通 admin。

问题：

1. **改一个 platform admin 要改生产环境变量 + 重新部署**，撤销不即时，审计困难。
2. **邮箱是可变的登录标识**：邮箱白名单不校验验证状态（P0 已做过渡加固），但根本上不该拿邮箱当授权依据。
3. **授权来源分散**：env（platform admin）+ `admin_users` 表（普通 admin），谁到底有权限不直观。
4. `admin_users.role` 目前只有 `'admin'` 一个值（`supabase/migrations/20260919_admin_console.sql:5`），无法扩展分级。
5. Clerk 已经是账号的 source of truth，但角色没有挂在账号上。

---

## 2. 目标与非目标

### 2.1 目标

- **G1**：platform admin 的唯一常规来源 = Clerk user `publicMetadata.role === "platform_admin"`。
- **G2**：删除 `PLATFORM_ADMIN_EMAILS` 整条路径（读取、API 返回、UI 展示、env、类型、测试）。
- **G3**：`PLATFORM_ADMIN_USER_IDS` 降级为 **break-glass**（仅 bootstrap / 紧急恢复），保留并在文档中明确其定位。
- **G4**：读取路径优先用 P1 的 `app_users.role`，未命中或过期再回退 Clerk backend API，并做 TTL 缓存。
- **G5**：`getCurrentAdmin()` 判定顺序变为：break-glass env → `app_users.role`（回退 Clerk metadata）→ `admin_users` 表。
- **G6**：提供一次性迁移脚本，给现有 platform admin 写 `publicMetadata.role`。
- **G7**：更新 `/admin/admins` 的 API 与 UI，移除 email 白名单展示，展示 role 来源。
- **G8**：测试覆盖 metadata 命中/缺失/错误 role/break-glass/DB admin/撤销即时性。

### 2.2 非目标

- **N1**：不做后台自助授予/撤销 platform admin（需要 Clerk metadata 写权限与更细的审计，后续独立 spec）。
- **N2**：不删除 `admin_users` 表；它继续承载普通业务 admin。
- **N3**：不扩展 `admin_users.role` 的 check constraint（后续做 moderator / data_editor 时再改）。
- **N4**：不引入 Clerk Organizations（当前单站点，metadata 足够）。
- **N5**：不改业务权限模型（普通 admin 仍是全后台可写，除了 admins 管理页）。

---

## 3. 当前事实与接口依赖

来自 P0：

- `lib/clerk/user-directory.ts` 暴露 `getDirectoryUser` / `getDirectoryUsers` / `invalidateDirectoryCache`；
- `ClerkDirectoryUser` 含 `publicMetadata: Record<string, unknown>`。

来自 P1：

- `app_users` 表含 `role text`、`public_metadata jsonb`、`synced_at timestamptz`；
- Clerk webhook `user.updated` 会更新 `app_users.role` 并调用 `invalidateDirectoryCache([userId])`；
- `user.deleted` 会把 `app_users.role` 置空并停用 `admin_users`。

本 spec 消费以上接口，不重复建表。

---

## 4. 关键设计决策

### D1：角色契约

```ts
export const PLATFORM_ADMIN_ROLE = "platform_admin";

export function hasPlatformAdminRole(metadata: Record<string, unknown> | null | undefined): boolean {
  return metadata?.role === PLATFORM_ADMIN_ROLE;
}
```

- 只认 `publicMetadata.role` 的**精确字符串匹配**，不接受子角色、数组或大小写变体。
- 不读取 `privateMetadata`（服务端读取没有额外收益，且会让角色定义分裂）。
- `app_users.role` 与 `publicMetadata.role` 必须同源；webhook 写入时只镜像这个字段。

### D2：`getCurrentAdmin()` 新判定顺序

```ts
export async function getCurrentAdmin(): Promise<...> {
  const { userId } = await auth();
  if (!userId) return 401;

  // 1. break-glass：只用于 bootstrap / 紧急恢复
  if (getPlatformAdminIds().has(userId)) {
    return { ok: true, session: { userId, isPlatformAdmin: true, source: "break_glass" } };
  }

  // 2. platform admin：app_users.role -> Clerk metadata 回退
  if (await isPlatformAdmin(userId)) {
    return { ok: true, session: { userId, isPlatformAdmin: true, source: "clerk_metadata" } };
  }

  // 3. 业务 admin：admin_users 表
  //    沿用 lib/admin-auth.ts 现有 `admin_users` 查询与 500/403 分支，
  //    仅把成功返回值补上 source: "admin_users"（抽成 getDbAdminSession(userId) 便于测试）
  return getDbAdminSession(userId);
}
```

`AdminSession` 增加 `source: "break_glass" | "clerk_metadata" | "admin_users"`，用于审计与 UI 展示；不改变 `isPlatformAdmin` 的语义。

### D3：`isPlatformAdmin(userId)` 读取策略

```ts
export async function isPlatformAdmin(userId: string): Promise<boolean> {
  // 1. app_users 命中且未过期 -> 用 role
  // 2. 否则 getDirectoryUser(userId) 回填，再判 role
  // 3. Clerk 不可用且 app_users 有 stale 数据 -> 用 stale 数据（fail-safe 读）
}
```

- 新鲜度窗口默认 5 分钟（`app_users.synced_at`）。
- 若 `app_users` 无记录且 Clerk 调用失败 → 返回 `false`（fail-closed），并记录 error。
- `user.updated` webhook 已主动更新 `app_users` 并失效缓存；TTL 只是兜底。
- **撤销即时性**：Dashboard 改 metadata → webhook `user.updated` → `app_users.role` 更新 + 缓存失效 → 下一请求立即生效。这是 P1 已建立的链路。

### D4：删除 `PLATFORM_ADMIN_EMAILS`

删除范围：

- `lib/admin-auth.ts`：`getPlatformAdminEmails`、`getPrimaryClerkEmail` 的 platform-admin 用途；P0 引入的 user-directory 保留邮箱读取**仅供管理员列表展示**，不再参与授权。
- `app/api/admin/admins/route.ts`：
  - GET 返回体移除 `platformAdminEmails`；
  - `platformAdminRows` 改为从 metadata-backed directory 解析（带 email 展示，可选）；
  - POST 仍可把用户加入 `admin_users`（普通 admin），继续支持“userId 或 email”作为**查找目标用户**的方式；这里的 email 只是查找键，不是授权依据。
- `components/admin/admin-admins-client.tsx`：移除 `platformAdminEmails` state/UI；platform admin 行显示“来源：Clerk metadata”与邮箱（若可读）。
- `.env.example`：删除 `PLATFORM_ADMIN_EMAILS`，`PLATFORM_ADMIN_USER_IDS` 加注释“break-glass only”。
- `cloudflare-env.d.ts`：删除 `PLATFORM_ADMIN_EMAILS`。
- 测试：删除邮箱白名单用例，新增 metadata 用例。

### D5：break-glass 策略

- `PLATFORM_ADMIN_USER_IDS` 保留，但明确只用于：
  1. 首次 bootstrap（还没有任何 metadata platform admin 时）；
  2. Dashboard / Clerk API 不可用时的紧急恢复。
- 生产文档要求该变量保持为空或只含 1–2 个 owner userId；不用于日常授权。
- break-glass 判定在 metadata 之前，因此即使 webhook/DB 全部错误，owner 仍能进后台修复。
- UI 上把 `source=break_glass` 的 platform admin 标为“Break-glass”。

### D6：一次性迁移脚本

新增 `scripts/set-platform-admin.mjs`：

```
node scripts/set-platform-admin.mjs --user-id user_xxx            # 设置 role
node scripts/set-platform-admin.mjs --user-id user_xxx --remove   # 删除 role
```

要求：

- 必须显式传 `--confirm` 才写入；
- 使用 `CLERK_SECRET_KEY` 调用 `clerkClient.users.updateUserMetadata`（或 REST Admin API），只改 `publicMetadata.role`，保留其他 metadata 字段（读-改-写）；
- `--dry-run` 打印将发生的变更；
- 找不到 user 时退出码非 0，不静默成功；
- 脚本只用于迁移和紧急操作，不进后台 UI。

### D7：不做的自助授予

后台暂不提供“授予 platform admin”按钮。原因：授予 platform admin = 授予 Clerk metadata 写权限；要保证只有 platform admin 能写、不能自锁、且每次写入都有审计。这需要单独的 spec 与更严格的评审。本 spec 的授予/撤销走 Dashboard 或 D6 脚本。

---

## 5. 影响文件清单

| 文件 | 动作 |
|---|---|
| `lib/admin-auth.ts` | 重写 platform admin 判定；删除 email 白名单；`AdminSession` 加 `source` |
| `app/admin/layout.tsx` | 适配 `session.source`（可选展示） |
| `app/api/admin/me/route.ts` | 返回体可加 `source`（不破坏现有消费方） |
| `app/api/admin/admins/route.ts` | 移除 `platformAdminEmails`；适配 metadata 来源 |
| `components/admin/admin-admins-client.tsx` | 移除 email 白名单 UI |
| `.env.example` / `cloudflare-env.d.ts` | 删除 `PLATFORM_ADMIN_EMAILS`；注释 break-glass |
| `scripts/set-platform-admin.mjs` | 新增 |
| `tests/admin-auth.test.ts` | 重写为 metadata / break-glass / DB admin 场景 |
| `tests/api/admin/admins.test.ts` | 适配返回体 |
| `tests/components/admin-entry.test.tsx` | 如受 `/api/admin/me` 返回体影响则更新 |
| `docs/development-guide.md` | 更新管理员配置说明 |

---

## 6. 人工步骤

1. **前置**：确认 P1 的 webhook 已上线、`app_users` 已 backfill、`user.updated` 事件可正常更新 `app_users.role`。
2. **设置 metadata**：对每个现有 platform admin 执行 `node scripts/set-platform-admin.mjs --user-id <id> --confirm`（或 Clerk Dashboard 手动设置 `publicMetadata.role = "platform_admin"`）。
3. **验证**：确认每个目标用户在 `/admin` 可访问，且 `/api/admin/me` 返回 `isPlatformAdmin: true`、`source: "clerk_metadata"`。
4. **保留 break-glass**：确认 `PLATFORM_ADMIN_USER_IDS` 至少包含 1 个 owner。
5. **移除 email 白名单**：从生产环境删除 `PLATFORM_ADMIN_EMAILS`，部署本 spec 代码。
6. **回归**：确认普通 `admin_users` 仍能进入后台；非管理员仍 403/404。

---

## 7. 部署与回滚

**部署顺序**：

1. P0 / P1 / P2 已上线；
2. 部署 `set-platform-admin` 脚本与 metadata 读取代码（此时可先保留 `PLATFORM_ADMIN_EMAILS` 双读一个窗口）；
3. 给现有 platform admin 写 metadata；
4. 验证通过后删除生产 `PLATFORM_ADMIN_EMAILS`；
5. 删除代码中的邮箱白名单路径并部署。

**回滚**：

- 重新配置 `PLATFORM_ADMIN_EMAILS` 环境变量即可恢复旧路径（在代码删除前的窗口内）；
- 代码删除后回滚上一个构建产物；
- break-glass `PLATFORM_ADMIN_USER_IDS` 始终保留，保证任何情况下都有 owner 能进后台；
- `publicMetadata.role` 是 additive，可随时 `--remove` 清理。

---

## 8. 测试策略

- **单元**：`hasPlatformAdminRole` 精确匹配；`isPlatformAdmin` 的 app_users 命中 / stale 回退 / Clerk 失败 fail-closed。
- **`getCurrentAdmin`**：break-glass 优先；metadata platform admin；普通 `admin_users`；非管理员 403；未登录 401。
- **撤销即时性**：先 mock `app_users.role=platform_admin` 通过，再模拟 webhook 更新为 null，断言下一请求 403（同时验证缓存失效）。
- **API**：GET 不再返回 `platformAdminEmails`；POST 仍能用 userId/email 查找并授予普通 admin。
- **脚本**：dry-run 不写入；无 `--confirm` 拒绝；保留其他 metadata 字段。
- **回归**：`npm run test`、`npx tsc --noEmit`、`npm run lint`、`npm run build`。

---

## 9. 验收标准

- [ ] `publicMetadata.role === "platform_admin"` 的用户可以访问 `/admin`，`source=clerk_metadata`。
- [ ] 删除生产 `PLATFORM_ADMIN_EMAILS` 后，platform admin 鉴权不受影响。
- [ ] 未验证邮箱在任何路径下都不产生授权。
- [ ] Dashboard 撤销 metadata role 后，下一请求即 403（不需要重新部署）。
- [ ] `PLATFORM_ADMIN_USER_IDS` 作为 break-glass 可用，且文档明确其定位。
- [ ] 普通 `admin_users` 用户行为不变。
- [ ] `grep -rn "PLATFORM_ADMIN_EMAILS"`（代码 + `.env.example` + `cloudflare-env.d.ts`）无结果。
- [ ] `npm run test` / `npx tsc --noEmit` / `npm run lint` / `npm run build` 全部通过，并记录原始输出。
- [ ] 迁移脚本 dry-run / confirm / remove 行为有测试或人工记录。

---

## 10. 待人工确认的决策

1. **break-glass 保留几个 owner**：默认保留 1–2 个 `PLATFORM_ADMIN_USER_IDS`。请确认具体 userId（不写进仓库，只配到生产环境）。
2. **是否在 `/api/admin/me` 暴露 `source`**：默认暴露（便于排障），不暴露具体 metadata。若你希望更保守，可只在服务端日志记录。
3. **迁移窗口**：是否允许在本 spec 部署当天临时保留 `PLATFORM_ADMIN_EMAILS` 作为双读兜底？默认允许，验证通过后删除。
