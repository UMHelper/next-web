# Next Web 课表分享与比较设计（P2）

- 日期：2026-09-21
- 状态：Draft（待 review）
- 依赖：`2026-09-21-next-web-timetable-planner-core-design.md`（P1）
- 后续：P3 完整工作台

---

## 1. 背景

P1 解决课表方案、自动保存和全局悬浮预览。P2 要在方案之上增加两个人之间的分享与比较：

- 用户 A 分享自己的课表方案；
- 用户 B 登录 UMHelper 后打开链接；
- B 选择自己的同 term 方案；
- 页面并排展示双方周视图，并高亮双方都空闲的时间段。

这个需求的核心不是“复制课表”，而是 **在各自拥有、各自编辑课表的前提下做比较**。因此分享链接必须是实时的，但编辑权仍然只属于 owner。

---

## 2. 目标与非目标

### 2.1 本期目标（In scope）

1. owner 可生成、复制、轮换、撤销分享链接。
2. 分享链接实时指向 owner 最新方案；不做快照。
3. 查看者必须登录 Clerk 账号，持有 token 才能访问。
4. 新增 `/compare/[token]` 比较页。
5. 查看者选择同 term 的自己的方案进行双方案周视图比较。
6. 计算并展示周一至周五 08:00–20:00 的共同空闲时段，只显示 ≥30 分钟的空档。
7. 查看页做 15 秒轮询：页面可见时轮询，切回标签页立即刷新。
8. 失效/撤销/删除方案时给出明确状态，不返回 500。

### 2.2 非目标（Out of scope）

- 匿名用户只看链接即可访问；本设计要求登录。
- WebSocket / Supabase Realtime 推送。
- 双向协作编辑、评论、聊天或比较房间。
- 多人（3 人以上）同时比较。
- 指定账号访问列表（ACL）；本期是“登录 + 持有链接”。
- 链接过期、访问统计、密码保护。
- 比较结果生成图片或导出。

---

## 3. 决策摘要

| 主题 | 决策 |
|---|---|
| 分享形态 | 实时链接，不生成快照 |
| Token 存储 | `timetable_plan.share_token`，高熵随机字符串 |
| 查看权限 | Clerk 登录 + token 有效 |
| 查看者数据 | 脱敏 payload，不返回 ownerClerkId / clientRef / token |
| 更新同步 | owner 自动保存；查看者 15 秒可见轮询 |
| 未变化响应 | `304 Not Modified` |
| 比较布局 | 桌面双周视图并排；移动端共同空闲列表优先 |
| 共同空闲 | Mon–Fri 08:00–20:00，双方都没课且 ≥30 分钟 |
| 链接撤销 | 置空 token，旧链接立即失效 |
| 实时推送 | 不做，轮询即可 |

---

## 4. 数据与安全

### 4.1 复用 P1 表

P2 不新增表；直接使用 P1 已建立的字段：

```sql
share_token text,
share_token_created_at timestamptz
```

规则：

- `share_token` 为空表示未分享。
- 生成新 token 时同时写 `share_token_created_at = now()`。
- 撤销时把 `share_token` 和 `share_token_created_at` 置空。
- 一个方案同一时间只有一个有效 token。

### 4.2 Token 生成

- 使用 Web Crypto `crypto.getRandomValues(new Uint8Array(32))`。
- 转成 URL-safe base64（去掉 `+/=`，或标准 base64url）。
- 示例长度约 43 字符；不可枚举。
- 数据库中明文存储 token，因为 owner 需要重新复制链接；表已启用 RLS 且只允许 `service_role` 访问。

### 4.3 访问控制

- 所有 owner 接口：校验 `owner_clerk_id === Clerk userId`。
- 查看接口：
  1. `auth()` 为空：返回 `401`，页面侧引导登录。
  2. token 不存在或为空：统一返回 `404`，不泄露“存在但无权限”。
  3. token 有效：返回脱敏方案。
- 不返回：`owner_clerk_id`、`client_ref`、`share_token`、创建/更新时间以外的内部字段。
- `/compare/[token]` 不加入 `middleware.ts` 的 `publicRoutes`，由 Clerk 保护。
- API 路由位于 `/api/*`，middleware 公开放行，但 route handler 内必须再次 `auth()`。

### 4.4 Rate limit

- 分享创建/轮换：每个用户每小时最多 30 次。
- 分享读取：每个用户每分钟最多 120 次；15 秒轮询约 4 次/分钟，余量充足。
- 复用现有 rate-limit 基础设施；新增 action 枚举如 `share_write` / `share_read`。

---

## 5. API

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| `GET` | `/api/timetable/plans/[id]/share` | 仅 owner | 返回当前分享状态 |
| `POST` | `/api/timetable/plans/[id]/share` | 仅 owner | 创建 token；`rotate: true` 时轮换 |
| `DELETE` | `/api/timetable/plans/[id]/share` | 仅 owner | 撤销分享 |
| `GET` | `/api/timetable/shares/[token]` | Clerk 登录 | 读取分享方案；支持 `?revision=` |

### 5.1 owner 分享接口

`GET /api/timetable/plans/[id]/share`

```json
{ "shared": true, "token": "...", "url": "https://.../compare/..." }
```

或：

```json
{ "shared": false }
```

`POST /api/timetable/plans/[id]/share`

```json
{ "rotate": false }
```

- 没有 token：创建新 token。
- 有 token 且 `rotate` 为 false：返回现有 token。
- 有 token 且 `rotate` 为 true：生成新 token，旧链接立即失效。

`DELETE /api/timetable/plans/[id]/share`

```json
{ "ok": true }
```

### 5.2 查看接口

`GET /api/timetable/shares/[token]?revision=12`

- 未登录：`401`。
- token 不存在：`404`。
- `revision` 与当前一致：`304 Not Modified`，无 body。
- 有变化：返回：

```json
{
  "plan": {
    "name": "我的课表",
    "year": 2026,
    "sem": 1,
    "revision": 13,
    "updatedAt": "2026-09-21T12:00:00.000Z",
    "payload": { "schemaVersion": 1, "sections": [] }
  }
}
```

不返回内部主键、owner、token。

---

## 6. 比较页 UX

### 6.1 路由与登录

- 路由：`app/compare/[token]/page.tsx`。
- 未登录访问时由 Clerk 引导登录，并保留原始 token URL。
- 登录后若 token 已失效：显示专用空状态“分享链接已失效”。
- 若 owner 删除方案：同样显示失效状态。

### 6.2 选择自己的方案

- 查看者登录后，加载该 term 下的自己的方案列表。
- 默认选中最近更新的同 term 方案。
- 多方案时提供下拉切换。
- 没有同 term 方案：
  - 先展示对方方案只读预览；
  - 提供“创建我的课表”和“复制对方方案作为起点”两个 CTA。
- term 不一致：
  - 明确提示“对方方案属于 2026 Sem 1，你的方案属于 2026 Sem 2，无法直接比较”；
  - 提供切换到同 term 方案的入口。

### 6.3 双方案周视图

- 桌面端：两个 `WeekGrid` 并排，分别标注“对方方案”和“我的方案”。
- 移动端：共同空闲列表放最前，再用 A/B 标签切换两个周视图。
- 双方事件用不同颜色；重叠时间段使用更醒目的边框/纹理。
- 点击事件仍可跳转 review 页。
- 共同空闲时段在两个周视图中用浅绿色背景高亮。

### 6.4 共同空闲计算

时间口径：

- 周一至周五；
- 08:00–20:00；
- 双方都没课；
- 只展示 ≥30 分钟的连续空档。

算法：

1. 把两边所有 section 的 schedules 按天分组。
2. 每个事件转为分钟区间 `[start, end)`，并 clamp 到 `[08:00, 20:00]`。
3. 对每一天分别合并两套事件的 busy intervals。
4. 取 `[08:00, 20:00]` 对 busy 的补集。
5. 过滤掉 `end - start < 30` 的碎片。
6. 返回 `{ date, start, end }[]`，按星期与时间排序。

展示：

- 日历高亮；
- 下方列表如 `MON 12:00–14:00`；
- 无共同空闲时显示明确空状态；
- 解析失败的 schedule 跳过，不影响其他时段。

---

## 7. 轮询与实时性

- 查看页使用 `useSharedPlan(token)` hook。
- 首次加载：无 revision，拿完整数据。
- 后续轮询：`GET /api/timetable/shares/[token]?revision=当前值`。
- 间隔：页面可见时 15 秒；隐藏时暂停；重新可见立即请求一次。
- 请求使用 `AbortController`，避免快速切换时旧请求覆盖新状态。
- 失败指数退避，并在 UI 显示“暂时无法更新，显示的是上一次数据”。
- 收到 `304`：只更新时间戳，不触发重新渲染大组件。
- 收到新 `revision`：更新共享方案，重新计算共同空闲。
- owner 更新路径：P1 的 800ms 自动保存成功即递增服务端 `revision`，无需额外推送。

---

## 8. 错误与空状态

| 场景 | 处理 |
|---|---|
| 未登录 | Clerk 登录后回到 `/compare/[token]` |
| token 为空/不存在 | 404 失效页 |
| owner 撤销 | 下一次轮询或刷新进入失效页 |
| owner 删除方案 | 同上 |
| 自己无同 term 方案 | 只读预览 + 创建/复制 CTA |
| 双方 term 不同 | 明确提示，不画错误比较 |
| 无共同空闲 | 显示“没有 ≥30 分钟的共同空闲” |
| 轮询失败 | 保留旧数据 + 非阻塞提示 |
| 会话过期 | 停止轮询，提示重新登录 |

---

## 9. 测试与验收

### 9.1 单元测试

- `shareToken` 生成长度、字符集、随机性。
- 共同空闲：
  - 完全空闲；
  - 一边有课；
  - 双方有课但有空档；
  - 空档 <30 分钟被过滤；
  - 课程跨 08:00 / 20:00 边界被 clamp；
  - 多段事件合并。
- term 不一致时比较 helper 返回明确错误。

### 9.2 API 测试

- 非 owner 不能创建/轮换/撤销分享。
- owner 创建后 token 非空。
- `rotate: true` 后旧 token 404，新 token 可读。
- `DELETE` 后 token 404。
- 未登录读取分享返回 401。
- revision 相同返回 304。
- 查看响应不包含 `owner_clerk_id` / `client_ref` / `share_token`。

### 9.3 组件与轮询测试

- `useSharedPlan` 首次加载、304、更新、错误退避。
- 比较页无方案、有方案、term 不一致、无共同空闲。
- fake timers 验证仅可见时轮询、重新聚焦立即请求。

### 9.4 手动验收

- 两个 Clerk 账号分别建方案；A 分享给 B。
- B 未登录打开链接会被引导登录。
- B 登录后选择自己的同 term 方案，看到双周视图和共同空闲。
- A 修改课表后，B 页面最多 15 秒自动更新。
- A 撤销链接后，B 刷新或下一次轮询进入失效页。
- 移动端共同空闲列表优先展示。

### 9.5 验收标准

- 分享链接必须登录才能访问。
- owner 编辑后链接始终是最新版，不是快照。
- 共同空闲严格按 Mon–Fri 08:00–20:00、≥30 分钟。
- 未授权的查看者无法拿到 owner 内部标识和 token。
- 无 WebSocket 依赖。

---

## 10. 风险与缓解

| 风险 | 缓解 |
|---|---|
| token 泄露 | 32 字节高熵、可随时轮换/撤销、登录才可读 |
| 15 秒轮询带来请求量 | 只在可见页轮询、304 无 body、rate limit |
| 课程时间数据脏导致空闲计算错误 | 依赖 P1 的 schedule 规范化；无法解析的事件跳过 |
| term 不一致导致无意义比较 | 明确提示并禁止直接比较 |
| 查看页突发销毁 | 使用 `visibilitychange` 和 AbortController 降低无效请求 |
| 多设备同时编辑共享方案 | P2 只看 owner 最新版，编辑冲突由 P1 的 409 机制处理 |
