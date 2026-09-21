# next-web Clerk 账户生命周期同步设计（P1）

> 状态：Draft，等待人工 review
> 日期：2026-09-21
> 前置：`docs/superpowers/specs/2026-09-21-next-web-clerk-auth-boundary-hardening-design.md`（P0，提供 `lib/clerk/user-directory.ts` 接口）
> 后续：review 通过后由 `writing-plans` 生成实施计划
> 不在本 spec：Clerk 大版本升级（P2）、platform admin metadata 迁移（P3-1）

---

## 1. 背景

当前 next-web 的 Clerk 账户只存在于 Clerk 侧，本地数据库没有任何账户镜像：

- `comment.verify_account`、`vote.created_by` 保存 Clerk userId；
- `admin_users.clerk_user_id`、`admin_audit_log.actor_id` 保存 Clerk userId；
- 没有 `/api/webhooks/clerk`，没有任何 `user.deleted` 处理；
- 管理员列表与审计日志每次实时调用 Clerk API 取邮箱（P0 已加缓存，但没有本地读模型）。

因此存在两个问题：

1. **生命周期缺口**：用户注销后，本地仍保留可关联到自然人的标识。`lib/privacy-policy.ts:63-65,147` 承诺了查阅、更正、删除个人资料的权利，但当前只有人工流程。
2. **读模型缺口**：`app_users` 之类的本地镜像不存在，管理员相关页面在 Clerk 不可用或限流时退化为空值。

本 spec 新增 Clerk webhook 与本地 `app_users` 读模型，把账户生命周期落到数据库。

---

## 2. 目标与非目标

### 2.1 目标

- **G1**：新增 `app_users` 表，作为 Clerk 用户的本地读模型。
- **G2**：新增 `POST /api/webhooks/clerk`，校验 Svix 签名，处理 `user.created` / `user.updated` / `user.deleted`。
- **G3**：`user.deleted` 时清理本地 PII：匿名化评论/回复的 `verify_account`、投票的 `created_by`，停用 `admin_users`，清空 `app_users` 上的个人字段。
- **G4**：`lib/clerk/user-directory.ts` 优先读 `app_users`，未命中再回退 Clerk API；webhook 更新后主动失效缓存。
- **G5**：提供一次性 backfill 脚本，把现存 Clerk 用户灌入 `app_users`。
- **G6**：webhook 幂等，可安全重放。
- **G7**：为签名校验、事件处理、幂等、匿名化补 Vitest 覆盖。

### 2.2 非目标

- **N1**：不做用户管理后台（查看/编辑/删除用户）——属于后续独立需求。
- **N2**：不硬删除评论/回复内容；内容保留策略见 ToS，本 spec 只做身份匿名化。
- **N3**：不改 platform admin 授权来源（P3-1 处理）；本 spec 只保证 `user.deleted` 会停用 `admin_users`。
- **N4**：不做数据导出接口。
- **N5**：不清理 `admin_audit_log`（审计保留有合法理由，见 D5）。

---

## 3. 当前事实与约束

- 数据库访问统一走 `supabaseAdmin`（service role），RLS 只对 `service_role` 放行。
- 现有迁移目录：`supabase/migrations/`，迁移不会自动 apply，需人工/脚本在目标库执行（见 `docs/superpowers/specs/2026-09-18-next-web-write-api-security-design.md` §4.1）。
- 部署目标包含 Vercel 风格 `next build` 与 OpenNext/Cloudflare（`wrangler.jsonc`，`nodejs_compat`）。
- 环境变量通过 `process.env` 读取，Cloudflare 类型在 `cloudflare-env.d.ts`。
- 现有依赖没有 `svix`。

---

## 4. 关键设计决策

### D1：新增 `app_users` 读模型

迁移 `supabase/migrations/20260921_app_users.sql`：

```sql
create table if not exists public.app_users (
  clerk_user_id   text primary key,
  primary_email   text,
  email_verified  boolean not null default false,
  first_name      text,
  last_name       text,
  image_url       text,
  role            text,
  public_metadata jsonb not null default '{}'::jsonb,
  created_at      timestamptz,
  updated_at      timestamptz,
  deleted_at      timestamptz,
  synced_at       timestamptz not null default now()
);

alter table public.app_users enable row level security;
revoke all on public.app_users from public, anon, authenticated;
grant select, insert, update, delete on public.app_users to service_role;

create index if not exists app_users_primary_email_idx
  on public.app_users (lower(primary_email));
```

字段说明：

- `role`：镜像 `publicMetadata.role`；P3-1 会读它判定 platform admin。
- `email_verified`：只存 primary 且已验证的邮箱；未验证时为 `null` + `false`。
- `public_metadata`：保留完整 metadata，方便未来扩展（不存 `privateMetadata`）。
- `deleted_at`：软删除标记；已删除用户保留一行以维持 `clerk_user_id` 唯一性与幂等。

**为什么不直接删行**：`user.deleted` 事件可能重放；保留 tombstone 让 upsert 幂等，也避免历史事件重新创建用户。

### D2：webhook 签名校验

Clerk 使用 Svix。请求头：

- `svix-id`
- `svix-timestamp`
- `svix-signature`

校验算法（HMAC-SHA256）：

```
signed_content = `${svix-id}.${svix-timestamp}.${rawBody}`
expected = base64(HMAC_SHA256(secret_without_prefix, signed_content))
```

`svix-signature` 形如 `v1,<base64>`，可能包含多个空格分隔的签名；必须用**常量时间比较**，且拒绝超出容忍窗口（默认 ±5 分钟）的时间戳。

**实现选择**：优先尝试 `svix` npm 包；如果 OpenNext/Cloudflare 构建不通过，则改用 `lib/clerk/webhook-signature.ts`（纯 Web Crypto + `buffer` polyfill 由 `nodejs_compat` 提供）。无论走哪条，签名校验逻辑必须有独立单元测试：

- 正确签名 → 通过；
- 篡改 body / 错误 secret / 过期时间戳 / 缺失头 / 多签名中任意一个匹配 → 预期结果；
- 时间戳容差边界。

route 必须先用 `await request.text()` 拿原始 body 再校验，**不能**先 `readJsonBody()`。

`secret` 来自新增环境变量 `CLERK_WEBHOOK_SIGNING_SECRET`（`whsec_...`，去掉前缀后作为 HMAC key）。

### D3：事件处理

`app/api/webhooks/clerk/route.ts`：

| 事件 | 处理 |
|---|---|
| `user.created` | `upsert app_users`（含 email、姓名、头像、metadata、Clerk `created_at`/`updated_at`） |
| `user.updated` | 同上 upsert；若 `role` 变化则 `invalidateDirectoryCache([userId])` |
| `user.deleted` | 见 D4 |
| 其他 | 返回 200 `{ ok: true, ignored: true }`（避免 Clerk 重试） |

幂等：每个事件用 `svix-id` 去重。新增 `webhook_events(event_id text primary key, event_type text, received_at timestamptz default now())`，插入冲突时直接返回 200。这样重放不会重复执行匿名化。

`user.created` / `user.updated` 的邮箱规则必须和 P0 一致：只把 **primary 且 verified** 的邮箱写入 `primary_email` / `email_verified`；未验证则 `primary_email = null`、`email_verified = false`。

### D4：`user.deleted` 的 PII 清理与匿名化

在一个事务里执行（通过一个新的 Postgres 函数 `anonymize_deleted_clerk_user(target_user_id text)`，`security definer`，只授予 `service_role`）：

1. `app_users`：`primary_email = null`、`first_name = null`、`last_name = null`、`image_url = null`、`public_metadata = '{}'`、`role = null`、`deleted_at = now()`；
2. `admin_users`：`active = false`、`updated_at = now()`；
3. `comment`：对该用户的行设置 `verify = 0`、`verify_account = 'deleted:' || substr(digest(...), 1, 32)`；
4. `vote`：`created_by` 同样替换为 `'deleted:' || ...`。

**伪名化规则**：`'deleted:' || encode(hmac(user_id, PII_PEPPER, 'sha256'), 'hex')[:32]`。

- 使用 HMAC + 服务端 `PII_PEPPER`，不可从伪名反推 Clerk userId；
- 同一用户的所有评论/投票得到同一个伪名，保持 `avatar_seed` 稳定；
- 不同用户不会碰撞（32 hex + HMAC）。

**为什么不用空字符串**：`vote` 有唯一约束 `(comment_id, created_by)` 与 `(comment_id, created_by, emoji)`；多个已删除用户共用 `''` 会触发约束冲突。伪名既满足约束又不泄露身份。

**保留 `admin_audit_log.actor_id`**：审计日志属于安全记录，需保留可追溯性；在隐私政策中已声明可能保留必要记录。`user.deleted` 时把审计日志的 actor 显示名匿名化（可选），但不改 `actor_id`。这条作为明确的非目标 N5。

### D5：backfill

新增 `scripts/backfill-app-users.mjs`：

- 使用 `CLERK_SECRET_KEY` + `getUserList` 分页（`limit=100`，`offset` 递增），
- 逐页 upsert 到 `app_users`；
- 支持 `--dry-run`（只打印统计）与 `--limit=N`；
- 遇到 Clerk 限流时退避重试；
- 不做删除，只 upsert。

### D6：`user-directory` 读取顺序

P0 新增的 `lib/clerk/user-directory.ts` 在本 spec 扩展：

1. 先查 `app_users`（按 id 批量 `select`）；
2. 未命中或 `synced_at` 超过 DB 层新鲜度窗口（默认 5 分钟）→ 调用 Clerk API 回填并 upsert；
3. 再经过 P0 已有的进程内 TTL 缓存（默认 60s）：命中进程缓存时连 `app_users` 都不查；
4. `invalidateDirectoryCache()` 同时清进程缓存；webhook `user.updated` 调用它。

两层缓存的分工：进程缓存（60s）挡 Clerk API 和 DB 的重复读；`app_users.synced_at`（5 分钟）决定本地读模型是否需要向 Clerk 回源。两者都只是兜底，`user.updated` webhook 才是撤销/变更的即时路径。这样管理员页面在 Clerk 短暂不可用时仍有本地数据可用。

---

## 5. 环境变量

| 变量 | 用途 | 写入位置 |
|---|---|---|
| `CLERK_WEBHOOK_SIGNING_SECRET` | Svix 签名校验 | `.env.example` + 生产环境 + `cloudflare-env.d.ts` |
| `PII_PEPPER` | 匿名化 HMAC 密钥（≥32 字节随机） | `.env.example` + 生产环境 + `cloudflare-env.d.ts` |

两个都是 server-only，**不能**加 `NEXT_PUBLIC_` 前缀。

---

## 6. 影响文件清单

| 文件 | 动作 |
|---|---|
| `supabase/migrations/20260921_app_users.sql` | 新增：表 + RLS + `webhook_events` + `anonymize_deleted_clerk_user` |
| `app/api/webhooks/clerk/route.ts` | 新增 |
| `lib/clerk/webhook-signature.ts` | 新增（若不使用 `svix` 包） |
| `lib/clerk/user-mapping.ts` | 新增：Clerk user JSON → `app_users` 行 |
| `lib/clerk/user-directory.ts` | 修改：DB 优先 + 回填 |
| `scripts/backfill-app-users.mjs` | 新增 |
| `.env.example` / `cloudflare-env.d.ts` | 修改：新增两个 secret |
| `package.json` | 视 D2 决定是否新增 `svix` |
| `tests/clerk/webhook-signature.test.ts` | 新增 |
| `tests/api/webhooks/clerk.test.ts` | 新增 |
| `tests/clerk/user-mapping.test.ts` | 新增 |
| `tests/database/anonymize-user-sql.test.ts` | 新增（SQL 文本断言） |

---

## 7. 人工步骤（必须在部署窗口执行）

1. **Clerk Dashboard**：创建 webhook，Endpoint URL 填 `https://umeh.top/api/webhooks/clerk`，订阅 `user.created`、`user.updated`、`user.deleted`，复制签名密钥。
2. **配置生产环境变量**：`CLERK_WEBHOOK_SIGNING_SECRET`、`PII_PEPPER`（随机生成，妥善保存；丢失后历史伪名不可重建，但也不需要重建）。
3. **执行迁移**：在目标 Supabase 库执行 `20260921_app_users.sql`，并保留执行输出。
4. **Backfill**：先 `--dry-run`，再正式跑；确认 `app_users` 行数与 Clerk 用户数一致。
5. **Clerk “Send test event”**：确认 webhook 返回 2xx，`webhook_events` 有记录。
6. **匿名化演练**：在 preprod 对测试用户触发 `user.deleted`，核对 `comment.verify` / `verify_account` / `vote.created_by` / `admin_users.active` 的变化。

---

## 8. 部署与回滚

**部署顺序**：

1. 先部署新增 webhook route + 表（additive，对现有功能无影响）；
2. 执行迁移；
3. 配置 Clerk Dashboard webhook；
4. backfill；
5. 最后让 `user-directory` 启用 DB 优先。

**回滚**：

- 表是 additive，可保留；
- webhook 可在 Dashboard 直接禁用；
- `user-directory` 可切回“纯 Clerk API”路径（保留 feature flag 或环境开关 `CLERK_DIRECTORY_DB_READ=0`，默认 1）。
- 匿名化不可逆，回滚前必须有数据库快照。

**风险**：

- Svix 库在 Cloudflare Workers 的兼容性 → 备选纯 Web Crypto 实现；
- `user.deleted` 事务耗时 → 用单个 SQL 函数在库内执行，避免多次 round trip；
- 迁移误伤 → 迁移前必须备份/snapshot。

---

## 9. 测试策略

- **签名**：正确/错误 secret、篡改 body、过期时间戳、多签名、缺失头。
- **事件**：三种事件各一条 happy path；未知事件返回 200 ignored；重复 `svix-id` 不重复执行。
- **邮箱规则**：未验证 primary 不写入 `primary_email`。
- **匿名化**：SQL 文本断言 + preprod 演练；断言 `vote` 唯一约束不被破坏。
- **回填**：分页、去重、限流重试逻辑（mock fetch）。
- **回归**：`npm run test`、`npx tsc --noEmit`、`npm run lint`、`npm run build`。

---

## 10. 验收标准

- [ ] `app_users` / `webhook_events` / `anonymize_deleted_clerk_user` 已应用到目标库并保留输出。
- [ ] `POST /api/webhooks/clerk` 对错误签名返回 401，对合法事件返回 2xx。
- [ ] `user.deleted` 后：`comment.verify=0`、`verify_account` 为伪名、`vote.created_by` 为伪名、`admin_users.active=false`。
- [ ] 重复投递同一 `svix-id` 不产生二次副作用。
- [ ] `app_users` backfill 行数与 Clerk 用户数一致（允许 tombstone 差异并在报告中说明）。
- [ ] `user-directory` 在 Clerk API 不可用时仍能从 `app_users` 读到用户。
- [ ] 全量测试/类型/lint/build 通过，并记录原始输出。

---

## 11. 待人工确认的决策

1. **`app_users` 是否保留 tombstone**：默认保留（幂等 + 唯一性）。如果你希望严格物理删除，需要额外设计重放去重键。
2. **匿名化范围**：默认只处理 `comment` / `vote` / `admin_users`；`reports.reporter_id`、`reports.email` 是否也要匿名化？建议一并处理 `reporter_id`，`email` 置空；请 review 时确认。
3. **`svix` 依赖 vs 纯 Web Crypto**：默认优先试 `svix`，构建失败则手写；如果你倾向零新依赖，我直接手写。
