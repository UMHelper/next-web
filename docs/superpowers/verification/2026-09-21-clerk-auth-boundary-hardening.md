# Clerk 鉴权边界与写接口契约收口 Verification（P0）— 2026-09-21

## Status

P0 已实现，并**以 rebase 线性历史**合入本地 `main`（无 merge commit），worktree 与临时分支已清理。**未 push、未部署。**

- Spec：`docs/superpowers/specs/2026-09-21-next-web-clerk-auth-boundary-hardening-design.md`
- Plan：`docs/superpowers/plans/2026-09-21-next-web-clerk-auth-boundary-hardening.md`
- 基线：`9814613`，baseline 38 test files / 108 tests passed。
- P0 提交叠在 `d509529` 之上。rebase 后做过等价性检查：`git diff --name-only <merged-main> <linear-head> | grep -v '^docs/'` 为空，代码树逐字节一致。

## Commits（线性，无 merge）

| commit | 说明 |
| --- | --- |
| `3e8ddbc` | feat(clerk): add cached verified user directory |
| `198e0d2` | fix(clerk): only trust verified primary admin emails |
| `53379e5` | test(clerk): enforce auth guards for all api routes |
| `366e520` | fix(comments): stop sending client identity fields and handle write errors |
| `3224b2e` | refactor(clerk): use clerkClient consistently |
| `0338320` | fix(clerk): align middleware matcher with upstream default |
| `79a3804` | fix(tests): make robots rule assertion type-safe |
| `486ace9` | test(clerk): recognize direct auth() in route guard policy |

> `79a3804` 是并发进程在 main 上的等价提交（原 `fc41872`）经 rebase 后的新 hash；其余 7 个是本次 P0 工作。

## Commands run（fresh evidence，线性化后的树）

- [x] `npm run test`
      → **49 test files / 158 tests passed**
- [x] `npx tsc --noEmit`
      → exit 0
- [x] `npm run lint`
      → `✔ No ESLint warnings or errors`
- [x] `npm run build`
      → 成功

### Task-level evidence（feature 阶段）

- [x] `tests/clerk/user-directory.test.ts` → 7 passed
- [x] `tests/admin-auth.test.ts` → 8 passed
- [x] `tests/api` → 11 files / 33 passed
- [x] `tests/security/api-route-guards.test.ts` → 24 passed（后扩展到 25，覆盖 main 新增 route）
- [x] `tests/comment-payload.test.ts` → 3 passed
- [x] `tests/comment-payload.test.ts tests/components` → 8 files / 15 passed

## Behavior verification

- [x] verified email：`getVerifiedPrimaryEmail` 只接受 `verification.status === "verified"` 的 primary 邮箱；未验证 / 非 primary 返回 `null`，不再 fallback。
- [x] platform admin：邮箱路径现在只可能拿到 verified primary email；未验证邮箱测试断言 403。
- [x] user-directory：60s TTL 缓存；按 `userId` 每 100 个分块调用 Clerk；Clerk 抛错时返回空 Map。
- [x] API 默认拒绝：所有 `app/api/**/route.ts*` 必须引入已知 guard，或出现在带理由的公开白名单（目前只有 `/api/browser-diagnostics`）；直接 `auth()` + JSON 401 也被识别。
- [x] 客户端写契约：回复 payload 只含 `replyto` + `content`；投票 payload 只含 `comment` + `offset`（+ emoji）；非 2xx 不再被当作成功。
- [x] `clerkClient`：`app/api/admin/admins/route.ts` 不再 `import { Clerk } from "@clerk/backend"`。
- [x] middleware matcher 对齐 Clerk 官方默认。
- [x] 组件重命名兼容：main 已把 `components/comment-card.tsx` 移到 `components/review/comment-card.tsx`；rebase 时 git 自动 rename-merge，改动落在新路径。

## Deviations from plan

1. **`@clerk/backend` 顶层依赖未移除**：本 session 的 worktree 使用指向主 checkout 的 `node_modules` 软链，执行 `npm install` 会修改共享依赖。按 plan 的 fallback，只完成代码统一，`package.json` 保持不变。需要在独立安装环境执行 `npm uninstall @clerk/backend` 并提交 lockfile 更新。
2. **Plan Step 6 的 grep 断言过宽**：`reply.verify_account` 是客户端读取服务端返回字段用于头像，不是发送字段；已改为精确检查 `body.verify` / `verify_account:` / `created_by:`，确认无写入侧身份字段。
3. **Spec 的“offset 分页”改为按 `userId` 分块**：`getUserList` 支持 `userId` 过滤，按 100 个一组分块比 offset 全量拉取更准确、更省调用；行为由 Task 1 测试锁定。
4. **Spec 提到的组件测试改为纯函数 + 源码约束**：新增 `lib/comment-payload.ts` 并单测，避免对复杂评论卡片做脆弱 DOM 测试。
5. **集成方式由 merge 改为 rebase**：首次本地合并用了 merge commit；按要求改为 rebase 线性历史，并同步修正本文件的 commit 列表。

## 未完成 / 留给后续

- P0 的 `PLATFORM_ADMIN_EMAILS` 只是过渡加固；整条路径由 P3-1 删除。
- `@clerk/backend` 依赖移除（见 Deviations #1）。
- P1（webhook 生命周期）、P2（Clerk 升级）、P3-1（metadata 迁移）尚未开始。
- 尚未 push / 部署；未配置任何生产环境变量，未对生产数据做操作。

## 并发与 rebase 说明

- P0 在 worktree 工作期间，main 前进了 27 个提交（含 `components/comment-card.tsx` → `components/review/comment-card.tsx` 等重构）。
- 合并后另一进程提交了 `fix(tests): make robots rule assertion type-safe`（`fc41872`），rebase 时保留为 `79a3804`。
- 仓库另有 `.worktrees/next-web-update-pipeline`、`.worktrees/timetable-planner` 两个无关 worktree，未触碰。
- 环境发现：npm registry 可达，`@clerk/nextjs` 最新为 `7.9.4`（P2 spec 原定 v6，需要重新决策目标版本）。
