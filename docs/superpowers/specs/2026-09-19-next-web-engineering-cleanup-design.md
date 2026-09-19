# next-web 工程化收尾设计（Phase 4）

> 状态：Draft，等待人工 review
> 日期：2026-09-19
> 前置阶段：Phase 1A / 1B / 2 / 3（部分待部署）已完成
> 后续计划：待 review 后生成

---

## 1. 背景

功能和安全问题已经基本收口，剩余的是工程卫生问题：

1. **配置重复/过时**
   - `tailwind.config.js` 和 `tailwind.config.ts` 同时存在且内容不同
   - `tsconfig.json` 仍使用 `target: "es5"` 和 contentlayer 遗留 paths
   - `next.config.js` 使用已弃用的 `images.domains`

2. **死代码**
   - `lib/in-app-browser.ts` / `lib/utils.ts:ua_check` 已无调用
   - `lib/clerk.ts`、`lib/database/database.js`、根目录 `consant.js` 无人引用
   - `components/course-info.tsx`、`components/toolbar.tsx` 已无实际调用
   - `lib/inference.ts` 只提供隐式全局 `MenuItem`，类型边界不清晰

3. **类型覆盖弱**
   - 仍存在较多 `any`
   - 没有 Supabase generated types
   - 路由 payload / RPC 返回值主要靠约定

4. **CI 与依赖管理**
   - 没有 CI workflow
   - 部分 build-time 依赖放在 dependencies
   - caniuse-lite / eslint 等依赖维护偏弱

Phase 4 只做工程化整理，不改变业务行为。

## 2. 目标与非目标

### 2.1 目标

- **G1**：清理死代码，不留下隐式全局类型。
- **G2**：合并/修正重复与过时配置。
- **G3**：引入 CI 门禁：`npm ci` + `lint` + `tsc` + `test`（build 视 secrets 情况可选）。
- **G4**：逐步减少 `any`，优先覆盖数据库层和 API payload。
- **G5**：整理 `package.json` 依赖分层，删除确认无引用依赖。
- **G6**：保证 Phase 4 每一小步都有测试/构建验证。

### 2.2 非目标

- 不改 UI、不改业务逻辑、不改数据库 schema。
- 不做大规模重写；不为了类型把所有东西一次改完。
- 不引入新框架/状态管理。

## 3. 范围分解

| 子阶段 | 主题 | 风险 |
|---|---|---|
| **4A** | 死代码 + 配置去重 | 低 |
| **4B** | 依赖分层 + CI 门禁 | 低-中 |
| **4C** | 类型与 `any` 收敛 | 中 |

## 4. 设计

### 4.1 4A：死代码与配置

删除确认无引用的文件：

- `lib/in-app-browser.ts`（删除后移除 `lib/utils.ts` 的 `ua_check` 和 import）
- `lib/clerk.ts`
- `lib/database/database.js`
- 根目录 `consant.js`
- `components/course-info.tsx`
- `components/toolbar.tsx`（同时移除 `app/course`、`app/reviews` 的 import）
- `lib/inference.ts`（把 `MenuItem` 变成 `lib/consant.ts` 的显式 export，更新 `navbar-list` / `mobile-sidebar` import）

配置修正：

- 删除 `tailwind.config.ts`，只保留 `tailwind.config.js`
- `tsconfig.json`：
  - `target: "ES2017"`
  - 删除 `"contentlayer/generated"` path
- `next.config.js`：
  - `images.domains` → `images.remotePatterns`
  - 增加 `reactStrictMode: true`
- 删除未使用的 `sass` dependency

验证：

- `grep` 无死文件引用
- `npm run test` / `lint` / `tsc` / `build` 通过
- 隔离 `npm ci`

### 4.2 4B：依赖分层与 CI

`package.json`：

- 将以下移到 `devDependencies`：
  - `typescript`
  - `eslint`
  - `eslint-config-next`
  - `postcss`
  - `autoprefixer`
  - `tailwindcss`
  - `@types/*`
- 保持 `dependencies` 只放运行时依赖。

CI：

- 新增 `.github/workflows/ci.yml`：
  - `npm ci`
  - `npm run lint`
  - `npx tsc --noEmit`
  - `npm run test`
  - `npm run build`（如果 secrets 可用；否则先只跑前三项）

### 4.3 4C：类型与 any

优先级：

1. Supabase schema types：用 `supabase gen types typescript --project-id ...` 或本地 DB 生成 `lib/database/types.ts`。
2. 数据库层函数返回类型：
   - `getCourseInfo` → `CourseRow | null`
   - `getReviewInfo` → `ProfWithCourseRow | null`
   - `getCommentsPage` → `CommentPageRow[]`
3. API payload：
   - 已有 zod schemas 的，从 `z.infer` 导出类型
   - 移除 `any` 优先覆盖 `lib/database/**`、`app/api/**`

不做一次性全量替换；每个 PR/commit 只收缩一个模块。

## 5. 测试策略

- 4A/4B：行为不变，主要靠 `lint` / `tsc` / `test` / `build` / `npm ci`。
- 4C：类型变化必须保持运行时行为不变；必要时补 fixture/type tests。
- CI 必须能在无 secrets 情况下至少跑 lint/tsc/test；build job 可由 secret 控制。

## 6. 验收标准

- **AC1**：无死文件引用；`lib/inference.ts` 移除，`MenuItem` 显式 import。
- **AC2**：只保留一个 Tailwind 配置；tsconfig 无 contentlayer；next.config 使用 remotePatterns。
- **AC3**：CI workflow 存在并可通过 lint/tsc/test。
- **AC4**：build-time 依赖移入 devDependencies。
- **AC5**：数据库层至少 3 个函数有明确返回类型。
- **AC6**：`npm ci` / `test` / `lint` / `tsc` / `build` 通过。

## 7. 后续

Phase 4 完成后，项目进入维护模式；后续按需单独立项（例如评论 moderation、更多 iOS API、观测性）。
