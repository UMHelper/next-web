# next-web 网页版举报功能设计

> 状态：Draft，等待人工 review
> 日期：2026-09-19
> 前置：`POST /api/report` 已支持 iOS HMAC 客户端
> 后续计划：待 review 后生成

---

## 1. 背景

当前 `app/api/report/route.ts` 只接受 iOS 专用 HMAC 请求：

```ts
if (!verifyIOSRequest(request)) return iosUnauthorized();
const versionResponse = iosVersionGuard(request);
```

它已经能把举报内容通过 Telegram Bot 推送到群组，并做了 Telegram HTML 转义、长度截断和目标评论查询。

问题：

- 网页版登录用户无法举报评论；
- 没有网页端举报入口；
- 如果直接把接口开放给 Web，需要区分 iOS HMAC 与 Clerk 身份，不能信任客户端传的 `reporterId`；
- 举报接口需要限流，避免 Telegram 被刷。

本设计把 `/api/report` 扩展为**同时支持 iOS 客户端和登录网页用户**。

## 2. 目标与非目标

### 2.1 目标

- **G1**：`POST /api/report` 支持 login Web（Clerk）和 iOS（HMAC）两种认证。
- **G2**：Web 端新增举报入口，只对已登录用户展示。
- **G3**：服务端不信任客户端身份字段，Web 使用 Clerk `userId`，iOS 沿用现有行为。
- **G4**：举报接口加限流，Web/iOS 分别按身份/IP 计数。
- **G5**：目标评论、课程、教授、作者、内容全部由服务端按 `targetId` 查询。
- **G6**：保持 iOS 旧客户端请求格式兼容。
- **G7**：补单元测试；Telegram 发送逻辑不变。

### 2.2 非目标

- **N1**：不新增举报后台/审核面板。
- **N2**：不自动隐藏或删除被举报内容。
- **N3**：不支持举报教授、课程页面本身（只支持 comment target；结构保留 targetType）。
- **N4**：不允许匿名 Web 用户举报。
- **N5**：不改变 Telegram 消息内容结构（仅新增 source/reporter）。
- **N6**：不改数据库 schema。

## 3. 用户流程

### Web

1. 用户已登录 Clerk，浏览评论。
2. 评论卡片（含回复）显示 `Report` 图标/按钮。
3. 点击打开 Dialog：
   - reason：Spam / Harassment / Hate / Misinformation / Privacy / Other
   - details：可选，`other` 时必填
   - email：可选
4. 提交 `POST /api/report` JSON。
5. 成功后 toast：`Report submitted`；失败显示错误。
6. 未登录用户不显示按钮。

### iOS

保持现有流程不变：

- `verifyIOSRequest` + `iosVersionGuard`
- body 可为现有字段（`source`, `targetType`, `targetId`, `reason`, `details`, `email`, `appVersion` 等）
- 旧客户端不需要新增 header。

## 4. 认证与身份模型

`/api/report` 分支：

```ts
async function resolveReportIdentity(request) {
  if (verifyIOSRequest(request)) {
    const versionResponse = iosVersionGuard(request);
    if (versionResponse) return { response: versionResponse };
    return {
      identity: {
        platform: "ios",
        id: request.headers.get("cf-connecting-ip") || "ios-unknown",
      },
      source: "ios",
    };
  }

  const { userId } = auth();
  if (!userId) return { response: apiError("unauthorized", "Sign in required", 401) };

  return {
    identity: { platform: "web", id: userId },
    source: "web",
  };
}
```

说明：

- Web 以 Clerk `userId` 作为 reporter 和限流 key。
- iOS 没有可靠单用户身份；继续用 HMAC + IP 限流，`reporterId` 不再从 body 信任（可以保留在 Telegram 中但标记为客户端提供）。
- 新增 `lib/api-auth.ts` 的 `resolveReportIdentity()`，避免 route 内重复分支。
- `rateLimitKey` action union 扩展为 `"comment" | "reply" | "vote" | "report"`。

## 5. API 设计

`POST /api/report`

### Web 请求

```json
{
  "targetType": "comment",
  "targetId": 12345,
  "reason": "spam",
  "details": "optional",
  "email": "optional@example.com"
}
```

- `targetType`：当前仅 `"comment"`。
- `targetId`：正整数。
- `reason`：`spam | harassment | hate | misinformation | privacy | other`。
- `details`：≤1000；`reason=other` 时必填。
- `email`：≤100。
- 客户端传的 `reporterId` / `courseCode` / `professor` 全部忽略。

### iOS 请求

保持原 JSON 格式；继续接受 `source`, `courseCode`, `professor`, `appVersion` 等字段。

### 校验

新增 `lib/validation/report.ts`：

```ts
export const reportSubmissionSchema = z.object({
  targetType: z.literal("comment").default("comment"),
  targetId: z.coerce.number().int().positive(),
  reason: z.enum(["spam", "harassment", "hate", "misinformation", "privacy", "other"]),
  details: z.string().trim().max(1000).optional(),
  email: z.string().trim().max(100).optional(),
}).superRefine((value, ctx) => {
  if (value.reason === "other" && !value.details) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["details"], message: "details required" });
  }
});
```

### 限流

- 新 env：`RATE_LIMIT_REPORT_PER_HOUR=5`
- key：
  - Web：`web:${userId}:report`
  - iOS：`ios:${ip}:report`
- 超限返回 429 + `Retry-After`。

## 6. Telegram 消息

保持现有结构，追加/调整：

- `Source` 使用服务端判定值（`web` 或 `ios`）。
- `Reporter`：
  - Web：Clerk userId（服务端写入）
  - iOS：客户端字段仅作为参考，标记 `(client-provided)`，不作为可信身份。
- 其余字段继续 escape + truncate。

## 7. UI 设计

新增 `components/report-dialog.tsx`（client component）：

- Props：
  ```ts
  {
    targetId: number;
    targetLabel?: string;
  }
  ```
- 使用现有 Radix Dialog / Select / Textarea / Button / sonner。
- 只对 `useUser().isSignedIn === true` 渲染。
- 流程：
  1. Flag 图标按钮
  2. Dialog 表单
  3. 提交调用 `/api/report`
  4. 检查 `response.ok`
  5. toast 成功/失败
  6. 关闭并重置

接入位置：

- `components/comment-card.tsx` 主评论卡片操作区
- `components/comment-card.tsx` 的 `ReplyCard` 回复卡片操作区（如果目标 id 可用）

如果回复的 `reply.id` 是数字，则可举报 reply；否则只支持主评论。

## 8. 测试策略

### API route tests

`tests/api/report.test.ts`：

- mock `@/lib/ios-auth`、`@/lib/ios-version`、`@/lib/api-auth`、`@/lib/supabase/admin`、`@/lib/telegram`、`@/lib/rate-limit`
- 未登录 Web → 401
- 登录 Web + 合法 payload → 200，`sendTelegramMessage` 被调用，message 包含 `Source: web`
- Web 伪造 `reporterId` / `courseCode` → 被忽略
- `reason=other` 无 details → 400
- `targetId` 不存在 → 404
- iOS HMAC 合法 → 200，保持兼容
- 超限 → 429

### Component tests

`tests/components/report-dialog.test.tsx`：

- 未登录不渲染
- 已登录渲染 Flag 按钮
- 点击提交调用 fetch（mock）并显示成功 toast

### 手动 smoke

- 登录后评论卡片出现举报按钮
- 提交 spam 举报，Telegram 群收到消息
- 未登录不显示按钮
- iOS 旧接口仍可用

## 9. 验收标准

- **AC1**：Web 未登录 `POST /api/report` 返回 401。
- **AC2**：Web 登录用户可成功举报评论，Telegram 收到 `source=web` 消息。
- **AC3**：Web 客户端传的 `reporterId` / `courseCode` / `professor` 不进入可信字段；iOS 仍可把客户端字段作为 Telegram 增强信息展示。
- **AC4**：iOS 现有请求格式仍返回 200。
- **AC5**：举报接口按 `RATE_LIMIT_REPORT_PER_HOUR` 限流，超限 429。
- **AC6**：评论/回复卡片对已登录用户显示 Report 入口，未登录不显示。
- **AC7**：`npm run test` / `lint` / `tsc` / `build` 通过。

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 举报接口被刷 Telegram | 限流 + 登录要求 + HMAC；必要时加 Turnstile |
| 旧 iOS 客户端不兼容 | 保持现有 body/header 要求不变，不强制新 header |
| Web 伪造目标信息 | 服务端只信 `targetId`，其余查库 |
| Telegram token 缺失 | 保持现有 503 行为 |
| 举报按钮出现在自己的评论上 | 可接受；后续可按 verify_account 隐藏 |

## 11. 后续

- 举报后台/审核状态表
- 自动隐藏阈值
- 举报历史去重
- 可选：web/iOS 举报同一评论合并提示
