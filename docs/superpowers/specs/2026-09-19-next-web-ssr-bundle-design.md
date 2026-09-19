# next-web SSR 与包体优化设计（Phase 2）

> 状态：Draft，等待人工 review
> 日期：2026-09-19
> 前置阶段：Phase 1A（安全/数据边界）与 Phase 1B（正确性）已上线
> 后续计划：待 review 后生成；建议拆为 Phase 2A / 2B / 2C 三份 plan

---

## 1. 背景

Phase 1A/1B 已解决写接口安全、隐私边界和一批正确性问题。当前项目仍然有两个会影响首屏体验和部署成本的问题：

1. **核心列表没有 SSR**
   - `components/masonry.tsx` 是客户端组件，初始 `colList` 为空，必须等 `useEffect` 后才把 children 分栏。
   - 评论列表、课程页教师卡片、教授课程列表、catalog/search 结果都使用 `Masonry`，首屏 HTML 中缺少这些核心内容。
   - `colListGen` 在 children 数量不能整除列数时会 push `undefined`。
   - `Math.random() > 0.9` 在分栏时随机塞广告，导致布局不稳定。

2. **客户端包体偏重**
   - `/timetable` 在生产 build 中约 `410 kB route / 555 kB First Load JS`。
   - `@aldabil/react-scheduler` + MUI 是主要来源；MUI 目前只在 `cellRenderer` 里用于一个空白 `Button`。
   - `components/bbs-updates.tsx` 已不再渲染任何东西（`BBSAd` 直接 `return null`），但仍被 course/review/Masonry 引用，可能把 axios、postcss、Carousel、Radix 相关模块带进无关路由。
   - `SparklesText` 每个实例 `setInterval(100ms)` 持续更新星星，列表页会有多个实例同时运行。
   - 部分 unused dependencies（`axios`、`embla-carousel-react`、`motion`、`framer-motion`、`@radix-ui/themes`、`three`、`hastscript` 等）仍留在 `package.json`。

Phase 2 的目标是：**让核心内容恢复服务端渲染，删掉死客户端代码和重依赖，明显降低关键路由的首屏 JS**。不改变业务 UI/视觉方向。

## 2. 目标与非目标

### 2.1 目标

- **G1**：`Masonry` 不再依赖客户端 `useEffect` 分栏，核心列表在 SSR HTML 中可见。
- **G2**：移除 `bbs-updates.tsx` 及其在 course/review/Masonry/page 中的引用；死代码生成的 chunk 不再进入这些路由。
- **G3**：`/timetable` 的 route / First Load JS 显著下降；Scheduler 改为按需加载或替换为轻量周视图。
- **G4**：`SparklesText` 不再使用 100ms `setInterval`；改用 CSS 动画或静态徽章。
- **G5**：评论/投票展示不再在 render 中做重复全量过滤。
- **G6**：移除确认无引用的依赖；`npm ci` / `npm run build` 保持通过。
- **G7**：为 SSR 行为和 bundle 变化补可验证的测试/记录。

### 2.2 非目标

- **N1**：不改写现有视觉设计或交互流程。
- **N2**：不处理缓存、ISR、UM API 同步、Sitemap（Phase 3）。
- **N3**：不做完整的 Supabase 类型治理（Phase 4）。
- **N4**：不为了保证 SSR 而把高交互组件强行改成 Server Component；交互岛屿仍保留客户端。
- **N5**：不改数据库 schema / RPC。

## 3. 范围分解

Phase 2 拆成三个子项目：

| 子阶段 | 主题 | 主要文件 |
|---|---|---|
| **2A** | Masonry SSR + 死客户端代码清理 | `components/masonry.tsx`、`components/bbs-updates.tsx`、`app/page.tsx`、`app/course/[code]/page.tsx`、`app/reviews/[code]/[...prof]/page.tsx` |
| **2B** | Timetable bundle 收缩 | `app/timetable/page.tsx`、`components/timetable-cart.tsx`、`components/timetable-card.tsx`、`package.json` |
| **2C** | 动画/重复计算/依赖审计 | `components/magicui/sparkles-text.tsx`、`components/comments.tsx`、`components/comment-card.tsx`、`package.json` |

## 4. 设计

### 4.1 Phase 2A：Masonry 改 CSS columns

**现状**：

- `Masonry` 是 `'use client'`，用 state 存 `colList`，用 `useEffect` 在 mount 后分栏。
- `colListGen` 按 `children[i + j]` 取元素，没有边界检查。
- `Masonry` 还引入 `AdBanner`、`BbsCard`、`fetchBbsUpdatesRandom`、`autoAnimate`。

**决策**：

- 将 `Masonry` 重写为纯函数组件，不用 `useState` / `useEffect` / `autoAnimate`：

```tsx
export function Masonry({
  children,
  className = "",
  col = 3,
}: {
  children: React.ReactNode;
  className?: string;
  col?: number;
}) {
  const columnsClass =
    col >= 3
      ? "columns-1 md:columns-2 xl:columns-3"
      : col === 2
        ? "columns-1 md:columns-2"
        : "columns-1";

  return (
    <div className={cn(columnsClass, "gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid", className)}>
      {children}
    </div>
  );
}
```

- `col` prop 保留以避免破坏调用方；但不再动态测宽。
- 删除 `MasonryRow` / `MasonryCol` / `colListGen` 的内部实现（如仍被 import，先保留导出别名并标注 deprecated；推荐直接删除）。
- 删除 `Math.random()` 广告插入。若仍需广告，广告 slot 由调用方显式传入，不由排版组件随机插入。
- 删除 `BbsCard` / `fetchBbsUpdatesRandom` / `autoAnimate` / `AdBanner` import。
- `Masonry` 可以从 `components/masonry.tsx` 改名到 `components/card-columns.tsx`，但为了减少改动，建议保留文件名和导出名，只替换实现。

**BBS dead code 清理**：

- 删除 `components/bbs-updates.tsx`。
- 删除 `app/page.tsx` 中未使用的 `BbsUpdates` import。
- 删除 `app/course/[code]/page.tsx` 和 `app/reviews/[code]/[...prof]/page.tsx` 中 `BBSAd` import 与 `<BBSAd />`。
- 删除 `components/masonry.tsx` 中所有 bbs import。
- 确认 `components/ad.jsx` 和 `components/ui/carousel.tsx` 在删除后是否还有引用；无引用则在 2C/Phase 4 删除。
- `app/page.tsx` 中 `{/* <BbsUpdates /> */}` 注释一并删除。

**测试**：

- 新增 `tests/components/masonry.test.tsx`：
  - 用 `renderToStaticMarkup` 渲染 `<Masonry><div>alpha</div><div>beta</div></Masonry>`
  - 断言 HTML 中同时包含 `alpha` 和 `beta`
  - 断言输出包含 `columns-1 md:columns-2 xl:columns-3`
- 新增 `tests/no-bbs-imports.test.ts`：
  - 读取 `app` / `components` 源码，断言不再出现 `bbs-updates` 字符串

**验收**：

- `Masonry` 文件无 `'use client'`、无 `useEffect`、无 `useState`。
- 服务端 build 后，评论页/课程页首屏 HTML 能看到卡片文本。
- 不再有 `BBSAd` 引用。

### 4.2 Phase 2B：Timetable bundle 收缩

**现状**：

- `app/timetable/page.tsx` 是客户端页面，顶部静态 import：
  - `Scheduler` from `@aldabil/react-scheduler`
  - `Button` from `@mui/material`
- `Button` 只在 `cellRenderer` 中作为空白渲染存在。
- `events` 由 `useEffect` + state 派生，`timetableCart` 与 localStorage 重复维护。

**决策（推荐方案）**：

- 将日历部分拆成独立客户端组件 `components/timetable-calendar.tsx`，通过 `next/dynamic` 懒加载：
  ```tsx
  const TimetableCalendar = dynamic(() => import("@/components/timetable-calendar"), {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded bg-slate-100" />,
  });
  ```
- 只有 `events.length > 0` 时才渲染 `TimetableCalendar`，即没有课程时完全不加载 scheduler chunk。
- 用 `useMemo` 从 `data`（localStorage）派生 `events`，删除 `timetableCart` 重复 state 与 `useEffect`。
- 删除 MUI `Button`；`cellRenderer` 返回 `<span />` 或直接不传 `cellRenderer`（视 scheduler API 行为而定）。
- `'none'` 占位 hack 改为 `undefined` / `null` 判断。

**备选方案（如果 2B 后 `/timetable` 仍 > 350 kB）**：

- 用轻量周视图替换 `@aldabil/react-scheduler`：
  - 固定 5 天 × 8:00-20:00 CSS grid
  - events 绝对定位到对应 day/time
  - 支持点击事件跳转 `/reviews/:code/:prof`
- 成功后从 package.json 移除：
  - `@aldabil/react-scheduler`
  - `@mui/material`
  - `@mui/icons-material`
  - `@mui/system`
  - `@mui/x-date-pickers`
  - `@date-io/date-fns`
  - `@emotion/react`
  - `@emotion/styled`
  - `date-fns`（如无其他引用）
  - `rrule`（如存在）

**测试**：

- 单元测试 `tests/timetable-events.test.ts`：把 `convertToEvents` 抽到 `lib/timetable-events.ts`，验证：
  - 一个 section 生成多个 event
  - `event_id` 唯一
  - 缺少 schedules 时返回空数组而不抛错
- Bundle 验证：在 plan 中记录改造前 `/timetable` 的 route/First Load JS，改造后必须下降；目标 `First Load JS <= 350 kB`。
- 手动 smoke：无课表、有课表、clear cart、移动端。

**验收**：

- `/timetable` 的 First Load JS 下降至少 30%，或降到 350 kB 以下。
- 没有课表时不加载 scheduler chunk。
- MUI 不再出现在 timetable 的 import 图里。

### 4.3 Phase 2C：动画、重复计算与依赖审计

**SparklesText**：

- 现状：每个实例 `setInterval(updateStars, 100)`，大量卡片上会持续占用主线程。
- 决策：
  - 用纯 CSS `@keyframes` + `::before` / `::after` 或少量绝对定位的 `<span>` 实现闪烁。
  - 不依赖 `motion` / `framer-motion`。
  - 保留 `SparklesText` 的 props 接口，调用方不改。
  - 列表场景可传 `sparklesCount={0}` 或使用静态 `<span>` 版本。

**评论投票计算**：

- `comments.tsx` 已改为使用 `upvote_count` / `downvote_count` / `emoji_counts`，基本解决全量扫描。
- `comment-card.tsx` 的 `EmojiVote` 仍在 render 中多次 `filter(vote_history)`；由于 `vote_history` 现在只含当前 viewer 的 vote，数据量小，本阶段只做轻量整理：
  - 用 `Set` 保存当前 viewer 的 emoji
  - 用一次循环计算 `hasDirectionVote` / `emojiSet`
- 如果 2C 时间不足，可只做 SparklesText，评论计算放到 Phase 4。

**依赖审计**：

- 删除确认无引用的依赖：
  - `axios`（Phase 1A 已移除服务端使用，bbs 删除后无引用）
  - `embla-carousel-react`（如 carousel 无引用）
  - `motion` / `framer-motion`（SparklesText CSS 化后）
  - `@radix-ui/themes`
  - `three`
  - `hastscript`
  - `rehype-autolink-headings` / `rehype-prism-plus` / `rehype-slug` / `remark-gfm`（如仍存在且无引用）
  - `sass`（如无 .scss）
  - `react-useanimations`（如 app/loading 改用 CSS spinner）
  - `@fancyapps/ui`（如 comment-card 改用 Radix Dialog）
- 每次删除后用 `npm run build` 的 route 表对比，确认未意外增大。
- `package-lock.json` 必须同步；CI 使用 `npm ci`。

**测试**：

- `tests/components/sparkles-text.test.tsx`（如引入 RTL/jsdom）：
  - render 后不创建 interval（可以通过 `vi.useFakeTimers()` + 前进时间断言 DOM 不变，或通过源码不再 import `motion` 断言）
- 可选：`tests/dependencies.test.ts` 断言 package.json 不含指定 dead deps（避免回流）。

**验收**：

- `SparklesText` 不再有 `setInterval`。
- 至少删除 3 个确认无引用依赖。
- `npm ci` 成功且 lockfile 同步。

## 5. 测试与验证策略

- 所有 Phase 2 子阶段必须保持：
  - `npm run test` 通过
  - `npm run lint` 通过
  - `node node_modules/typescript/bin/tsc --noEmit` 通过
  - `npm run build` 通过
  - 隔离目录 `npm ci --ignore-scripts` 通过
- Bundle 基线（Phase 1B 后，2026-09-19）：
  - `/timetable`：route 410 kB / First Load 555 kB
  - `/reviews/[code]/[...prof]`：route 47.4 kB / First Load 264 kB
  - `/catalog/[...departments]`：route 166 B / First Load 177 kB
  - `/course/[code]`：route 1.61 kB / First Load 174 kB
  - `/professor/[...name]`：route 3.45 kB / First Load 147 kB
  - shared First Load JS：87.5 kB
- 每个子阶段在 `docs/superpowers/verification/2026-09-19-ssr-bundle.md` 记录改造前后数字。

## 6. 发布与回滚

- Phase 2 没有数据库迁移，纯前端/构建改动。
- 建议按 2A → 2B → 2C 分三次部署：
  - 2A：Masonry / bbs 清理（视觉风险低；需确认 CSS columns 顺序）
  - 2B：Timetable（UI 风险中；需要 smoke 移动端）
  - 2C：动画/依赖（风险低）
- 任何子阶段出问题可直接回滚该次部署。
- CSS columns 的视觉顺序可能与旧 Masonry 不同，属于预期变化；如不可接受，回滚 2A。

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| CSS columns 与旧 Masonry 排列顺序不同 | 2A smoke 重点检查卡片顺序；必要时用 grid + order，而不是 columns |
| `Masonry` 在 client tree 中被使用（course-filter） | 新实现是纯渲染，不依赖 server-only API，client tree 也可用 |
| Scheduler 懒加载导致课表闪烁 | 提供 skeleton；无 events 不渲染组件 |
| 删除 MUI 打破 scheduler 依赖（如果保留 scheduler） | 2B 推荐先懒加载并保留 MUI；确认能移除 scheduler 后再删 MUI |
| 删除依赖导致隐藏引用失效 | 删除前 `grep`，删除后 `npm ci` + build + 关键页面 smoke |
| bundle 优化导致行为变化 | 每个子阶段独立 commit + 独立回滚 |

## 8. 验收标准

- **AC1**：`Masonry` SSR 输出包含 children；源码无 `'use client'` / `useEffect` / `useState`。
- **AC2**：`components/bbs-updates.tsx` 已删除，仓库中无 `bbs-updates` 引用。
- **AC3**：`/timetable` First Load JS 相比基线下降至少 30% 或 ≤ 350 kB。
- **AC4**：没有课程时不会加载 scheduler chunk。
- **AC5**：`SparklesText` 不再使用 `setInterval`。
- **AC6**：至少移除 3 个确认无引用依赖，`package.json` 与 `package-lock.json` 同步。
- **AC7**：`npm run test` / `lint` / `tsc` / `build` / 隔离 `npm ci` 全部通过。
- **AC8**：改造前后 bundle 数字记录在验证文档中。

## 9. 后续

Phase 2 完成后：

- Phase 3：缓存 / UM API 定时同步 / ISR / Sitemap / OpenNext incremental cache。
- Phase 4：类型、死代码、依赖配置、CI 加固。
