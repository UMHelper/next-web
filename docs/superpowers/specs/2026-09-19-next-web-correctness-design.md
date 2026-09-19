# next-web 正确性修复设计（Phase 1B）

> 状态：Draft，等待人工 review
> 日期：2026-09-19
> 前置阶段：`docs/superpowers/specs/2026-09-18-next-web-write-api-security-design.md`（Phase 1A，已上线）
> 后续计划：待 review 后生成；预计 `docs/superpowers/plans/2026-09-19-next-web-correctness.md`

---

## 1. 背景

Phase 1A 已经完成并上线：

- 写接口身份校验、字段白名单、限流
- `get_comment_page_v2` 隐私化
- 硬编码 UM token 移除
- Supabase `security_hardening` 已执行
- 生产 build 通过

`docs/technical-optimization-audit.md` 和 Phase 1A 走读中仍留有一组明确的 P0 正确性问题。它们不涉及架构重做，但会直接影响用户：

1. `reviews` 路由使用 `params.prof.pop()` 识别页码，会修改 Next.js 传入的 `params`；
2. `ReviewNotice` 在 React render 阶段调用 `toast.error()`；
3. `SubmitPage` 的 `isSubmitting` 在图片校验失败和请求失败时不会复位，且不检查 `fetch` 的 HTTP 状态；
4. GE Course 的 catalog 路由常量不一致，导致 `/catalog/GE Course` 等路径判定错误，GE 系目录链接可能显示 Oops。

Phase 1B 只修这些正确性问题，不做性能、缓存、依赖减重。

## 2. 目标与非目标

### 2.1 目标

- **G1**：`reviews` 页面和 `generateMetadata` 不再修改 `params`；页码解析变成纯函数。
- **G2**：`ReviewNotice` 只在客户端 mount / note 变化后弹一次 toast，不在 render 中产生副作用。
- **G3**：`SubmitPage` 在成功、失败、图片校验失败时都能正确复位提交状态；只有 HTTP 2xx 才算成功。
- **G4**：GE Course 在 menu、catalog navigation、route、`fetchCatalogList`、sitemap 中使用同一个 canonical slug。
- **G5**：为上述行为补 Vitest 单元测试；必要时补 React 组件测试。
- **G6**：保持旧 URL 可用：`/reviews/[code]/[...prof]/2` 仍能显示第 2 页；`/catalog/gecourse` 和旧 `/catalog/GE Course` 都落到同一 canonical 结果。

### 2.2 非目标

- **N1**：不重做 `Masonry` / SSR / 评论性能。
- **N2**：不处理 Timetable、MUI、Scheduler、SparklesText 包体问题。
- **N3**：不处理缓存、Sitemap 效率、UM API 定时同步。
- **N4**：不修改数据库 schema 或 RPC；Phase 1B 不需要新的 migration。
- **N5**：不引入 `any` 类型治理的大规模重构，只对本次触碰的函数补类型。

## 3. 范围分解

| 子项 | 文件 | 问题 |
|---|---|---|
| 1B-1 Reviews 页码解析 | `app/reviews/[code]/[...prof]/page.tsx`、`components/review-pagination.tsx`、新建 `lib/review-route.ts` | `params.prof.pop()` 修改入参，metadata/page 可能不一致；数字结尾教授名会被误判 |
| 1B-2 ReviewNotice 副作用 | `components/review-notice.tsx` | render 中 toast + console.log，重复弹 |
| 1B-3 Submit 状态与错误处理 | `app/submit/[code]/[prof]/page.tsx` | 校验失败卡 `isSubmitting`；不检查 `res.ok`；假成功 |
| 1B-4 GE Catalog canonical | `lib/consant.ts`、`components/catalog-navigation.tsx`、`app/catalog/[...departments]/page.tsx`、`lib/database/get-course-info.ts`、`app/sitemap.ts` | `'GE Course'` / `'GECourse'` / `'gecourse'` 三套值不一致 |

## 4. 设计

### 4.1 Reviews 页码解析（1B-1）

**现状**：

```ts
let page_num = 1;
let prof = params.prof.join('/').replaceAll('%2C', ",").toUpperCase();
if (!Number.isNaN(parseInt(params.prof[params.prof.length - 1]))) {
  page_num = parseInt(params.prof.pop() as string);
  prof = params.prof.join('/').replaceAll('%2C', ",").toUpperCase();
}
```

`generateMetadata` 和 page 各执行一次；`pop()` 会修改 `params.prof`，可能让另一个函数看到已删掉页码的数组。

**决策**：

- 新建 `lib/review-route.ts`，提供纯函数：

```ts
export type ReviewRoute = {
  code: string;
  prof: string;
  page: number;
};

export function parseReviewRoute(
  code: string,
  profSegments: readonly string[],
  searchPage?: string | string[],
): ReviewRoute;
```

- 解析优先级：
  1. 如果 `searchPage`（`?page=`）是合法正整数，用它；`prof` 为完整 `profSegments`。
  2. 否则，如果 `profSegments` 最后一项是纯数字，把它作为页码，并从 prof 中排除。
  3. 否则页码为 1，prof 为完整 segments。
- 函数内部使用 `slice` / `filter`，不调用 `pop` / `splice` / `reverse`。
- `generateMetadata` 和 page 都只调用 `parseReviewRoute`，不直接改 `params.prof`。
- `ReviewPagination` 的 canonical 链接改为 `?page=n`：

```text
/reviews/ACCT1000/CHAN%20TAI%20MAN?page=2
```

- 旧链接 `/reviews/ACCT1000/CHAN%20TAI%20MAN/2` 继续能被 `parseReviewRoute` 解析为第 2 页，不做 redirect，避免破坏已有 SEO/分享链接。
- `TimetableCard`、`ProfCard`、`report` 等只生成无页码链接，不受影响。

**错误/边界处理**：

- `?page=0`、`?page=-1`、`?page=abc`、`?page=999999999999` → 回退到 trailing page 或 1。
- 教授名最后一段是数字（真实姓名）暂时保持旧行为，视为页码；如未来出现真实数字结尾姓名，再改路由结构。
- `generateMetadata` 不抛错，永远能返回标题。

### 4.2 ReviewNotice 副作用（1B-2）

**决策**：

- 保持组件返回 `null`（UI 不变化）。
- 把 toast 移到 `useEffect`：

```tsx
useEffect(() => {
  if (!hasNotice) return;
  const shown = shownRef.current;
  if (shown) return;
  shownRef.current = true;

  toast.error(title, {
    description: ...,
    duration: 10000,
    toasterId: "admin_notice",
  });
}, [hasNotice, admin_note, admin_note_en]);
```

- 删除 `console.log`。
- `admin_note` / `admin_note_en` 任一变化时允许再次弹一次；同一组件生命周期内相同 note 不重复弹。

### 4.3 Submit 状态与错误处理（1B-3）

**决策**：

- 图片类型/大小校验失败时，不进入提交；在 `setIsSubmitting(true)` 之前完成所有本地校验。
- 用 `try/finally` 包住请求，确保任何路径都 `setIsSubmitting(false)`。
- `fetch` 必须检查 `response.ok`：
  - `response.ok === true`：刷新/跳转。
  - `response.ok === false`：抛错 / 展示服务端错误，不要跳转，不要提示成功。
- 移除客户端 `verify` / `verify_account` 的拼接；Phase 1A 的服务端已经根据 Clerk / anonymous / iOS 身份派生，客户端传值无效。
- 保留 `image` 字段；服务端仍会校验。
- 把“提交逻辑”抽成可测试函数更好，推荐：
  - 新建 `lib/submit-comment.ts`：
    ```ts
    export async function submitComment(input: {
      url: string;
      formData: FormData;
      fetchImpl?: typeof fetch;
    }): Promise<{ ok: true } | { ok: false; status: number; message: string }>;
    ```
  - 组件只负责组装 FormData、toast、路由跳转。
- 失败时 toast 描述包含 HTTP status 和服务端 error message（如果服务端返回 JSON）。

### 4.4 GE Catalog canonical（1B-4）

**决策**：

- Canonical slug 统一为小写 `gecourse`。
- Display label 保持 `"GE Course"`。
- `lib/consant.ts`：
  - `faculty` 数组中的 GE 项改为 `'gecourse'`（用于路由/查询）。
  - `faculty_dept` key 改为 `'gecourse'`。
  - 新增：
    ```ts
    export const GE_COURSE_SLUG = "gecourse";
    export function getFacultyLabel(slug: string) {
      return slug.toLowerCase() === GE_COURSE_SLUG ? "GE Course" : slug.toUpperCase();
    }
    export function normalizeFacultySlug(value: string) {
      const normalized = value.toLowerCase().replace(/\s+/g, "");
      if (normalized === GE_COURSE_SLUG) return GE_COURSE_SLUG;
      return value.toUpperCase();
    }
    ```
- `app/catalog/[...departments]/page.tsx`：
  - 对 `departments[0]` 做 `normalizeFacultySlug`。
  - 校验失败返回现有 Oops UI。
  - 把 normalized departments 传给 `fetchCatalogList`。
- `components/catalog-navigation.tsx`：
  - URL 使用 canonical `fac`（`faculty` 数组已规范化）。
  - 显示使用 `getFacultyLabel(fac)`。
- `lib/database/get-course-info.ts`：
  - `fetchCatalogList` 用 `normalizeFacultySlug(departments[0])`。
  - 单段 GE：`like('New_code', 'GE%')`。
  - 两段 GE：`like('New_code', `${departments[1]}%`)`，不再走 `Offering_Unit='GECOURSE'`。
- `app/sitemap.ts`：
  - 使用 `faculty` canonical slug 生成 `/catalog/gecourse` 和 `/catalog/gecourse/GEGA`。
- 旧路径 `/catalog/GE%20Course`、`/catalog/GECourse` 通过 `normalizeFacultySlug` 仍可访问，不 redirect，保持向后兼容。

## 5. 测试策略

Phase 1B 使用现有 Vitest（Phase 1A 已引入）。

### 5.1 纯函数单元测试

- `tests/review-route.test.ts`
  - `?page=2` 优先
  - trailing `/2` 回退
  - 非法 page 回退
  - 不修改传入数组（传入 frozen array 也不报错）
  - 教授名中间含 `$` / `%2C` 时 prof 拼接正确
- `tests/validation/catalog-route.test.ts`（或 `tests/consant.test.ts`）
  - `normalizeFacultySlug('GE Course') === 'gecourse'`
  - `normalizeFacultySlug('GECourse') === 'gecourse'`
  - `normalizeFacultySlug('FBA') === 'FBA'`
  - `getFacultyLabel('gecourse') === 'GE Course'`
  - `getFacultyLabel('FBA') === 'FBA'`

### 5.2 Submit helper 单元测试

- `tests/submit-comment.test.ts`
  - `fetch` 返回 200 → `{ ok: true }`
  - 返回 400/500 → `{ ok: false, status, message }`
  - 网络异常 → `ok: false`
  - 无论成功失败都只调用一次 `fetch`

### 5.3 ReviewNotice 组件测试

Phase 1B **引入** React 组件测试，因为 render 副作用必须用真实挂载/卸载行为验证。

新增 devDependencies：

- `@testing-library/react`
- `jsdom`

`tests/components/review-notice.test.tsx`：

- mock `sonner` 的 `toast.error`
- render 两次相同 props，等待 effects flush → `toast.error` 只调用一次
- 修改 props 后重新 render → 再调用一次
- render 阶段不调用 toast（断言 render 返回后、effects flush 前调用次数为 0，flush 后为 1）

Vitest 配置：

- 在 `vitest.config.ts` 中增加 `environmentMatchGlobs: [["tests/components/**", "jsdom"]]`
- 或在 `.tsx` 测试文件顶部使用 `// @vitest-environment jsdom`

### 5.4 手动 smoke

- `/reviews/ACCT1000/TEACHER`、`/reviews/ACCT1000/TEACHER/2`、`/reviews/ACCT1000/TEACHER?page=2` 三种入口的结果一致。
- 评论页有 `admin_note` 时只弹一次 toast。
- 提交页：图片超 5MB、图片类型错误、服务端 500、成功四种路径都不会卡住按钮。
- `/catalog/gecourse`、`/catalog/GE%20Course`、`/catalog/GECourse`、`/catalog/gecourse/GEGA` 都能显示对应课程。

## 6. 迁移与发布

- Phase 1B 不需要数据库迁移。
- 发布顺序：
  1. 代码 + 测试合并；
  2. 部署；
  3. 手动 smoke 老链接兼容；
  4. 观察错误日志。
- 回滚：纯前端，可直接回滚到上一部署。

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 旧 `/reviews/.../2` 链接失效 | `parseReviewRoute` 保留 trailing numeric 解析，不删旧行为 |
| 数字结尾教授名被误判为页码 | 本阶段保持旧行为，记为已知限制；后续可改路由结构 |
| `faculty` 常量改动影响 sitemap 与导航 | 统一走 `getFacultyLabel` / `normalizeFacultySlug`，不直接比较字符串 |
| `normalizeFacultySlug` 把未知 slug 大写后仍走查询 | page 校验 `faculty.includes(normalized)`，非法输入返回 Oops |
| RTL 引入增加 dev 依赖/测试时间 | 只作为 devDependency，不进生产 bundle；组件测试只挂 `ReviewNotice` |

## 8. 验收标准

- **AC1**：`app/reviews` 中不再出现 `params.prof.pop()`、`params.prof.splice` 等修改入参的调用。
- **AC2**：`parseReviewRoute` 对同一输入永远返回同一结果，且不修改输入数组。
- **AC3**：`ReviewNotice` 不在 render 阶段调用 `toast.error`；相同 note 在同一次 mount 内只弹一次。
- **AC4**：Submit 页图片校验失败、网络失败、HTTP 非 2xx 时，`isSubmitting` 都会复位。
- **AC5**：提交请求只有在 HTTP 2xx 时才提示成功并跳转。
- **AC6**：`/catalog/gecourse`、`/catalog/GE Course`、`/catalog/GECourse` 都进入同一 canonical 数据路径；`faculty` / `faculty_dept` / sitemap / navigation / `fetchCatalogList` 使用同一 canonical slug。
- **AC7**：`npm run test`、`npm run lint`、`tsc --noEmit`、`npm run build` 全部通过。
- **AC8**：旧 URL 行为在 smoke 中验证通过。

## 9. 后续

Phase 1B 完成后：

- Phase 2：`Masonry` CSS columns、评论/教师卡片 SSR、删除 bbs-updates 死代码、Timetable/MUI/Scheduler 包体、SparklesText、评论聚合计算。
- Phase 3：缓存 / UM API 定时同步 / Sitemap / OpenNext cache。
- Phase 4：类型、死代码、依赖审计、CI 加固。
