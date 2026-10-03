# next-web 深色模式与品牌 logo 对齐设计

> 状态：Draft，等待人工 review
> 日期：2026-10-02
> 前置：`next-ios` 的 `What2REG@UM/Assets.xcassets/CatLogo.imageset`（`cat-blue.svg` / `cat-white.svg`）；next-web 现有 `tailwind.config.js` 的 `darkMode: ["class"]`、`app/globals.css` 的 `.dark` 变量块、`package.json` 的 `next-themes@^0.2.1`
> 后续计划：review 通过后，用 `writing-plans` 生成实施计划

---

## 1. 背景

### 1.1 品牌 logo 现状

web 与 iOS 用的**是同一份图形**：

| 端 | 位置 | 形态 | 颜色来源 |
|---|---|---|---|
| web（导航） | `components/navbar-list.tsx:20` | lucide-react `Cat`，`size=24`、`strokeWidth=2` | 硬编码 prop `color='rgb(14 165 233)'`（sky-500 亮蓝） |
| web（页脚） | `components/footer.tsx:20` | 同上 | 同上 |
| iOS | `What2REG@UM/NavigationShell.swift:144`、`AboutView.swift:19` | `Image("CatLogo")`，36×36 | 浅色 `cat-blue.svg`：`stroke="#003DB8"`；深色 `cat-white.svg`：`stroke="#FFFFFF"` |

`cat-blue.svg` / `cat-white.svg` 的文件头都是 `@license lucide-static v1.31.0 - ISC`，路径数据与 web 用的 lucide `Cat` 完全一致。因此"换成和 iOS 一样的深色"在实现上不是换图，而是**把 stroke 交给 `currentColor`，由一个品牌 token 驱动**。

文字字标两端不同：iOS 是默认前景色的纯文本，web 是 `bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent` 渐变字（`navbar-list.tsx:21`、`footer.tsx:22`）。

### 1.2 深色模式现状

已经具备但未接线的地基：

- `tailwind.config.js:3`：`darkMode: ["class"]`；
- `app/globals.css:34-70`：完整的 `.dark` 变量块（shadcn 默认深色值）；`@layer base` 里 `body { @apply bg-background text-foreground }` 已存在；
- `package.json:61`：`next-themes@^0.2.1` 已安装，但**只有** `components/ui/sonner.tsx:3` 调用 `useTheme`，没有 `ThemeProvider`、没有切换入口，所以深色模式实际上永远不会被激活；
- 页面层仍以硬编码颜色为主：除 `components/ui/**` 与死代码外，**54 个文件、423 处**颜色类命中（其中 `text-white` 27 处、`bg-white/NN` 16 处属有意保留，见 §5.5）；`components/ui/**` 里只有 `drawer.tsx:31` 的 `bg-black/80`（模态遮罩，两种模式都该是黑）。

### 1.3 影响范围的关键发现

`components/timetable-calendar.tsx` 是**死代码**：它是全仓库唯一 import `@aldabil/react-scheduler` 的文件（全仓库再无任何 `@mui/*` 直接引用），但没有任何文件 import 它；课表页用的是自研 `components/timetable/week-grid.tsx`，测试里也没有引用。

因此原计划的"MUI 日程表需要 `createTheme({ palette: { mode } })` 例外"**不再需要**，本轮第三方深色适配成本为 0。

## 2. 目标与非目标

### 2.1 目标

- **G1**：logo 的猫图标颜色**严格对齐 iOS**：浅色 `#003DB8`、深色 `#FFFFFF`，且该对应关系由自动化测试断言（不靠人工比对）。
- **G2**：全站（含 admin）提供 light / dark / system 三种主题，默认 light，用户选择持久化。
- **G3**：颜色收敛为**语义 token 单一定义点**：`:root` 与 `.dark` 各一套值，组件只写语义类名，不写 `gray-900` 这类具体色阶。
- **G4**：浅色模式的观感变化**有界且可列举**：全部位移项写进 §5.6，逐条可对照验证。
- **G5**：无首屏闪烁（FOUC）、无 hydration mismatch、无 hydration 警告。
- **G6**：主题不进入服务端渲染产物，不影响现有 SSR / ISR / Cloudflare 缓存语义。
- **G7**：删除现有 19 处 `dark:` 双写，避免 token 与双写两套机制并存。
- **G8**：用守卫测试把"迁移完整度"变成可机械核验的事实，而不是靠人眼确认。
- **G9**：`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 四个门全绿。
- **G10**：产出 spec / plan / verification 三份文档。

### 2.2 非目标

- **N1**：不做 iOS 那种半透明液态玻璃顶栏（`backdrop-blur` + 发丝描边 + 投影）。顶栏仍是不透明表面，只换 token。
- **N2**：不改 `public/favicon.png`、`public/icon/*.jpg`、`public/banner.jpg`、`public/images/hero-*.jpg` 等光栅资源（需重新出图）。
- **N3**：不删除死代码 `components/timetable-calendar.tsx`，也不清理 `@mui/*` / `@aldabil/react-scheduler` 依赖（属独立一轮，本轮只在守卫测试里加一条带注释的排除）。
- **N4**：不做 Clerk 组件的深色外观（`appearance` / `@clerk/themes`）。`/sign-in`、`/sign-up`、`UserButton` 在深色下是"深色页面 + 白色卡片"，属已知限制。
- **N5**：不做 AdSense 广告单元的深色适配（第三方 iframe，无法从我们的 CSS 控制），属已知限制。
- **N6**：不做 fancyapps 灯箱的深色主题定制，属已知限制。
- **N7**：不改 `app/manifest.ts`（`background_color`/`theme_color` 已是 `#fff`）、不引入 PWA 主题色联动。
- **N8**：不删除源码里残留的注释代码（如 `app/layout.tsx:71-87` 引用已不存在的 `RotatingText` 的注释块）；守卫测试改为**剥离注释后匹配**（见 §9 T2）。
- **N9**：不做"跟随系统变化时无过渡动画"以外的动效设计，不改任何组件布局、间距、字号。
- **N10**：不改 iOS 端、不改任何 API、不改数据库。
- **N11**：不新增颜色 token 之外的 Tailwind 插件或设计系统重构。

## 3. 决策记录（人工已确认）

| # | 决策点 | 结论 | 理由 |
|---|---|---|---|
| D1 | 覆盖范围 | **整站 light/dark 可用**（而非只改品牌区） | 用户明确选择"全站暗色模式" |
| D2 | 默认主题 | ~~**默认 light**，选项 `light` / `dark` / `system`~~；**后续按用户实测反馈改为：默认跟随系统（`defaultTheme="system"`），选项只有 `light` / `dark`，不再有 System 与下拉菜单，点击图标即在两者间切换并持久化** | 原决定以「对已上线站点与 SEO 零风险」为由默认 light；用户实测后要求「默认跟随系统、由用户自己改」，故推翻原决定 |
| D3 | 实现方案 | **语义 token 迁移**（非逐处双写 `dark:`） | 单一事实来源；迁移完整度可用守卫测试机械核验 |
| D4 | 浅色收敛策略 | **token 的 light 值迁就现有硬编码色**，接受 §5.6 列出的微量位移 | 收敛 token 数量，同时把浅色变化压到可列举、可核验 |
| D5 | 品牌区 | 猫图标**照搬 iOS 两色**；字标**保留渐变**、深色下提亮 | 图标对齐诉求最彻底；字标保留现有品牌感 |
| D6 | 切换入口 | 桌面**导航栏右上角下拉** + 移动端**侧边栏三选项** | 与 iOS 侧边栏 `themeIcon` 的三按钮结构一致，可发现性最好 |
| D7 | MUI 例外 | **取消**（`timetable-calendar.tsx` 是死代码） | YAGNI；实际第三方适配成本为 0 |
| D8 | admin 处理 | **一起迁移**（深色下也是真深色） | 用户选择；避免"深壳 + 白块"混合外观 |
| D9 | Clerk / AdSense / fancyapps / 光栅资源 | **已知限制，不做** | 见 N4–N6 |
| D10 | 顶栏玻璃质感 | **不做** | 避免从"配色"膨胀为"视觉语言重构"（N1） |

## 4. 主题模型与基础设施

### 4.1 数据流

```text
next-themes ThemeProvider（'use client'，attribute="class"）
  │  默认 light / 允许 system / storageKey="umeh-theme" / disableTransitionOnChange
  │  挂载前：注入阻塞 <script> 读 localStorage → 给 <html> 加 class="dark" 或不加
  │
  ├─ <html class=""> 或 <html class="dark">   ← SSR 产物里没有这个 class，由脚本在首次绘制前写入
  │      └─ .dark { ...变量... } 覆盖 :root
  │
  ├─ Navbar → <ThemeToggle />（'use client'：setTheme + resolvedTheme）
  ├─ MobileSidebar → 三选项按钮（同一 setTheme）
  ├─ <ThemeColorMeta />（'use client'：effect 内改写 <meta name="theme-color">）
  └─ 页面组件：只写语义类名（bg-background / text-muted-foreground / text-brand-logo …）
```

### 4.2 接线

- 新建 `components/providers/theme-provider.tsx`（`'use client'`）：

```tsx
"use client";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      storageKey="umeh-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
```

- `app/layout.tsx`：`<html lang="zh-Hant" suppressHydrationWarning>`，并把 `<ThemeProvider>` 放在最外层（必须包住 `ClerkProviderClient` 与 `<Toaster />`，因为 `components/ui/sonner.tsx` 已经调用 `useTheme`）。

### 4.3 防闪烁（FOUC）与 hydration

- `next-themes` 会在 hydration 之前插入一段阻塞 `<script>`，读 `localStorage` 并给 `<html>` 加 `class="dark"`。这就是全部防闪烁机制，**不需要**额外的 `next/script` 或 `beforeInteractive`。
- 该脚本会在客户端改动 `<html>` 的属性，因此 `<html>` **必须**加 `suppressHydrationWarning`，否则 React 会报属性不匹配。
- 所有读取 `useTheme()` 的客户端组件都必须用 `mounted` 状态做首次渲染占位（§7.1），因为 `resolvedTheme` 在挂载前是 `undefined`。

### 4.4 `theme-color` 与状态栏

现状（`app/layout.tsx:43-44`）：

```html
<meta name='theme-color' content='#2563EB' />
<meta name='apple-mobile-web-app-status-bar-style' content='#2563EB' />
```

两个问题：

1. `theme-color` 是静态 `#2563EB`，与浅色页面 `--background: #FFFFFF` 并不一致，也不会随主题变化。
2. `apple-mobile-web-app-status-bar-style` 的合法取值是 `default` / `black` / `black-translucent`，**写十六进制是无效值**，浏览器会忽略。

处理：

- 静态 SSR 值改为 `<meta name="theme-color" content="#FFFFFF" />`；新建 `components/theme-color-meta.tsx`（`'use client'`）在 `useEffect` 中**直接改写该 meta 元素的 `content` 属性**（不是用 React 渲染 meta —— 避免依赖 React 的 head 提升行为）。深色值取 `#020817`（即既有 `.dark` 的 `--background`）。
- **不额外订阅 `matchMedia`**：`enableSystem` 打开时 `next-themes` 已经把系统偏好解析进 `resolvedTheme`（并自带 media query 监听），因此组件只需依赖 `resolvedTheme`，`system` 模式天然跟随。少一处手写监听、少一类竞态。
- `apple-mobile-web-app-status-bar-style` 修正为 `default`，不随主题变化。
- 不用"两条 media-query meta"的方案：它无法反映用户的手动覆盖。

### 4.5 缓存与 SSR 语义

主题只存在于「`localStorage` + 客户端脚本 + `<html>` 的 class」，不进入任何服务端渲染产物、不读取请求头、不做 UA 分流。因此：

- `app/**` 现有 `revalidate`、`generateStaticParams`、`force-dynamic` 全部不受影响；
- Cloudflare/OpenNext 的缓存键不因主题变化，同一份缓存 HTML 服务所有用户。

## 5. 颜色 token 体系

### 5.1 设计原则

**token 的 light 值去迁就现有硬编码色**，而不是让 54 个文件去迁就 shadcn 的默认值。这样：浅色模式的实际位移被压到最小、并且可以逐条列出来（§5.6）、可以在验证阶段逐条确认。

同时**不动 `--primary`**：现有 `:root` 的 `--primary` 是近黑（`222.2 47.4% 11.2%`），被 `components/ui/button.tsx` 的默认 variant 使用；如果把它改成品牌蓝，全站默认按钮会一起变蓝。品牌色另立 `--brand`。

### 5.2 新增 token（12 个）

| token | 用途 | light | dark |
|---|---|---|---|
| `--surface-subtle` | 区块底（`bg-gray-50` / `bg-slate-50`） | `210 20% 98%` `#F9FAFB` | `222.2 47.4% 9%` `#0C1322` |
| `--surface-strong` | 强底 / 内嵌（`bg-gray-200` / `bg-zinc-200`） | `220 13% 91%` `#E5E7EB` | `217.2 32.6% 24%` `#293851` |
| `--subtle-foreground` | 三级文字（`text-gray-400` / `text-slate-400`） | `218.5 10.6% 64.9%` `#9CA3AF` | `215 20.2% 45%` `#5C6F8A` |
| `--border-subtle` | 细分隔线（`border-slate-100`） | `210 40% 96.1%` `#F1F5F9` | `217.2 32.6% 12%` `#151C29` |
| `--border-strong` | 强分隔线（`border-gray-300`） | `216 12.2% 83.9%` `#D1D5DB` | `217.2 32.6% 28%` `#30425F` |
| `--brand` | 品牌交互色（链接、实心按钮、hover） | `221.2 83.2% 53.3%` `#2563EB` | `213.1 93.9% 67.8%` `#60A5FA` |
| `--brand-strong` | 品牌强调（当前选中导航、按钮 hover） | `224.3 76.3% 48%` `#1D4ED8` | `211.7 96.4% 78.4%` `#93C5FD` |
| `--brand-logo` | **logo 专用** | `220.1 100% 36.1%` `#003DB8` | `0 0% 100%` `#FFFFFF` |
| `--wordmark-from` | 字标渐变起点 | `198.6 88.7% 48.4%` `#0EA5E9` | `198.4 93.2% 59.6%` `#38BDF8` |
| `--wordmark-to` | 字标渐变终点 | `243.4 75.4% 58.6%` `#4F46E5` | `234.5 89.5% 74%` `#818CF8` |
| `--success` | 成功态（Offered 徽章等） | `142.1 76.2% 36.3%` `#16A34A` | `141.9 69.2% 58%` `#4ADE80` |
| `--warning` | 警告态（admin 状态、审批标记） | `26 90.5% 37.1%` `#B45309` | `43.3 96.4% 56.3%` `#FBBF24` |

表内每个 HSL 三元组都已**逐一往返验证**（HSL → HEX → 与原 HEX 逐字节相等，无容差），因此 T1 可以零容差断言。深色值取自与既有 `.dark` 阶梯一致的位置（`--background` `#020817`、`--border` `#1E293B`、`--muted-foreground` `#94A3B8`）。

`--brand-logo` 的两个值分别**逐字等于** iOS 的 `cat-blue.svg`（`#003DB8`）与 `cat-white.svg`（`#FFFFFF`）的 `stroke`，由 §9 T1 的跨仓库断言锁死。

### 5.3 既有 token 的取值调整（3 处）

`.dark` 块**保持现状不重写**，只补 §5.2 的新 token；`:root` 只调这 3 个，让迁移零位移：

| token | 现值 | 新值 | 原因 |
|---|---|---|---|
| `--foreground` | `222.2 84% 4.9%` `#020817` | `220.9 39.3% 11%` `#111827` | 等于 `text-gray-900`，使 `text-gray-900 → text-foreground` 零位移 |
| `--muted` | `210 40% 96.1%` `#F1F5F9` | `220.9 14.3% 95.9%` `#F3F4F6` | 等于 `bg-gray-100`（12 处，最常用），使 `bg-gray-100 → bg-muted` 零位移 |
| `--muted-foreground` | `215.4 16.3% 46.9%` `#64748B` | `220.9 8.9% 46.1%` `#6B7280` | 等于 `text-gray-500`（42 处，最常用） |

`--accent` 保持 `210 40% 96.1%`（shadcn 组件的 hover 底），不与 `--muted` 合并。

### 5.4 Tailwind 配置扩展

```js
colors: {
  foreground: { DEFAULT: "hsl(var(--foreground))", subtle: "hsl(var(--subtle-foreground))" },
  border: { DEFAULT: "hsl(var(--border))", subtle: "hsl(var(--border-subtle))", strong: "hsl(var(--border-strong))" },
  surface: { subtle: "hsl(var(--surface-subtle))", strong: "hsl(var(--surface-strong))" },
  brand: { DEFAULT: "hsl(var(--brand))", strong: "hsl(var(--brand-strong))", logo: "hsl(var(--brand-logo))" },
  wordmark: { from: "hsl(var(--wordmark-from))", to: "hsl(var(--wordmark-to))" },
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
}
```

`colors.foreground` 与 `colors.border` 由字符串改为带 `DEFAULT` 的对象：`text-foreground` / `border-border` 的用法不变，新增 `text-foreground-subtle` / `border-border-subtle` / `border-border-strong`。变量存的是**无 `hsl()` 包裹的 HSL 三元组**（沿用 shadcn 约定），因此 `/10`、`/30` 这类透明度修饰符可用。

### 5.5 映射表

| 现有类 | 处数 | 迁移为 |
|---|---|---|
| `bg-white` | 20 | `bg-background` |
| `text-gray-900` / `text-black` | 12 / 7 | `text-foreground` |
| `text-gray-700` / `text-gray-800` / `text-slate-700` / `text-slate-800` | 4 / 7 / 1 / 1 | `text-foreground` |
| `text-gray-500` / `text-slate-500` | 42 / 17 | `text-muted-foreground` |
| `text-gray-600` / `text-slate-600` | 3 / 3 | `text-muted-foreground` |
| `text-gray-400` / `text-slate-400` | 21 / 4 | `text-foreground-subtle` |
| `bg-gray-50` / `bg-slate-50` | 9 / 5 | `bg-surface-subtle` |
| `bg-gray-100` / `bg-slate-100` | 12 / 6 | `bg-muted` |
| `bg-gray-200` / `bg-zinc-200` | 9 / 4 | `bg-surface-strong` |
| `bg-gray-300/10`（页脚） | 1 | `bg-surface-subtle` |
| `hover:bg-gray-300` | 1 | `hover:bg-surface-strong` |
| `border-slate-200` / `border-gray-200` | 21 / 2 | `border-border` |
| `border-slate-100` | 7 | `border-border-subtle` |
| `border-gray-100`（`navbar-list.tsx:26` 移动菜单外框） | 1 | `border-border-subtle` |
| `border-gray-300` | 4 | `border-border-strong` |
| `text-blue-500` / `text-blue-600` | 15 / 3 | `text-brand` |
| `text-indigo-500`（`course-instructors.tsx:20` 图标） | 1 | `text-brand` |
| `text-blue-700` / `text-blue-800` | 8 / 3 | `text-brand-strong` |
| `bg-blue-600` | 6 | `bg-brand` |
| `bg-blue-50`（admin 选中项） | 1 | `bg-brand/10` |
| `bg-blue-100`（admin「运行中」徽章） | 1 | `bg-brand/10` |
| `bg-sky-100` / `text-sky-600` / `border-sky-600`（`comment-card.tsx:473,508` 折叠标记徽章，各 2 处） | 6 | `bg-brand/10` / `text-brand` / `border-brand` |
| `hover:bg-blue-200`（同上徽章 hover） | 2 | `hover:bg-brand/20` |
| `hover:bg-blue-700`（`floating-planner.tsx:79` 移动端浮动按钮 hover） | 1 | `hover:bg-brand-strong` |
| `bg-slate-50/40`（`ads/ad-slot.tsx:43` 广告位底） | 1 | `bg-surface-subtle/40` |
| `text-red-500` / `text-red-600` / `text-red-700` / `text-red-400` | 1 / 5 / 2 / 1 | `text-destructive` |
| `bg-red-500` | 3 | `bg-destructive` |
| `bg-red-50` / `bg-red-100`（admin） | 1 / 1 | `bg-destructive/10` |
| `border-red-200` / `border-red-300` / `border-red-400` / `border-red-500` | 1 / 1 / 1 / 1 | `border-destructive/30`（前两个）/ `border-destructive`（后两个，冲突描边） |
| `text-green-600` / `text-green-700` / `text-green-800` / `text-green-900` | 1 / 5 / 1 / 1 | `text-success` |
| `bg-green-100`（admin） | 2 | `bg-success/15` |
| `bg-green-50` / `border-green-200`（`compare-client.tsx:92` 共同空闲卡片） | 1 / 1 | `bg-success/10` / `border-success/40` |
| `text-amber-600` / `text-amber-700` / `text-amber-800` | 1 / 1 / 1 | `text-warning` |
| `bg-amber-50` / `bg-amber-100` | 1 / 1 | `bg-warning/10` |
| `border-amber-300` | 1 | `border-warning/30` |
| 字标/品牌文字渐变 `from-sky-500 to-indigo-600`（`navbar-list` / `footer` / `cs-banner`，3 处）与 `from-sky-600 to-indigo-600`（`banner`，2 处） | 10 | `from-wordmark-from to-wordmark-to`（顺带统一两种字标蓝，见 §5.7 S11） |
| `from-green-600 to-green-600`（Offered 徽章，4 处 × 2） | 8 | `from-success to-success` |
| `text-slate-100`（饱和渐变上的按钮文字） | 1 | `text-white` |
| `dark:*` 双写共 19 处（`dark:bg-gray-800` ×6、`dark:hover:bg-gray-800` ×1、`dark:text-gray-300` ×5、`dark:text-white` ×4、`dark:border-gray-700` ×2、`dark:bg-gray-900` ×1） | 19 | **整段删除**，由 token 接管。注意 `dark:text-white` 属放行 token、守卫测试不会强制，但按本表仍须删除 |

### 5.6 明确保持不变（守卫测试放行）

| 项 | 处数 | 理由 |
|---|---|---|
| `text-white`、`text-white/80` | 27+3 | 全在品牌蓝 / 成功绿 / 危险红底色上，两种模式都该是白字 |
| `bg-white/20` / `/25` / `/30` | 16 | 全在 `components/loading-skeletons.tsx`，是**品牌渐变头部上的白色骨架条**，不是白色表面 |
| `bg-black/80`（`components/ui/drawer.tsx`） | 1 | 模态遮罩，两种模式都该是黑 |
| 品牌渐变 `from-blue-600 to-indigo-500` | 24（12 对） | 饱和蓝块配白字在深色下依然成立；如后续需要深色变体，再加 `--brand-from` / `--brand-to` |
| `from-teal-400 via-violet-400 to-blue-500`（`app/not-found.tsx:10`、`app/catalog/[...departments]/page.tsx:62` 的 404 大标题） | 6 | 本身就是高亮装饰，两种模式都成立 |
| `from-neutral-700 to-stone-900`（Not Offered 徽章，`course-card.tsx` / `prof-card.tsx`） | 4 | 深色徽章，两种模式都成立 |
| `from-purple-600 to-blue-600` + `hover:from-purple-500 hover:to-blue-500`（`timetable-schedule-card.tsx:108`） | 4 | 饱和紫蓝底配 `text-white` |
| `from-violet-500 to-fuchsia-500`（`submit-comment-form.tsx:438` 提交按钮） | 2 | 饱和底配白字 |
| `from-blue-400 to-indigo-400`（`comments.tsx:59` 分区标题渐变） | 2 | 深色下本就亮，两种模式都成立 |

### 5.7 收敛带来的浅色位移（完整清单，供验证逐条对照）

| # | 项 | 变化 | 幅度 |
|---|---|---|---|
| S1 | `text-slate-500`（17 处） | `#64748B` → `#6B7280` | 极小 |
| S2 | `bg-slate-100`（6 处） | `#F1F5F9` → `#F3F4F6` | 极小 |
| S3 | `border-gray-200`（2 处） | `#E5E7EB` → `#E2E8F0` | 极小 |
| S4 | `bg-zinc-200`（4 处） | `#E4E4E7` → `#E5E7EB` | 极小 |
| S5 | `bg-slate-50`（5 处） | `#F8FAFC` → `#F9FAFB` | 极小 |
| S6 | `text-blue-500`（15 处，绝大多数是 `hover:`） | `#3B82F6` → `#2563EB` | 有意统一（可见） |
| S7 | `text-gray-700` / `text-gray-800` / `text-slate-700` / `text-slate-800`（13 处） | 统一到 `#111827` | 有意统一（可见） |
| S8 | `text-blue-800`（3 处） | `#1E40AF` → `#1D4ED8` | 极小 |
| S9 | `text-green-700`（5 处） | `#15803D` → `#16A34A` | 小幅提亮 |
| S10 | `text-amber-600/700/800`、`bg-amber-50/100`（admin，共 5 处） | 统一到 `--warning` 及其透明度底 | 小幅 |
| S11 | `from-sky-600`（`components/banner.tsx:18,21`，2 处） | `#0284C7` → `#0EA5E9` | 与 `navbar-list` / `footer` / `cs-banner` 的字标蓝统一（此前全站字标其实有两种蓝） |
| S12 | `text-sky-600` / `border-sky-600` / `bg-sky-100` / `hover:bg-blue-200`（`comment-card.tsx` 折叠标记徽章，8 处） | `#0284C7` → `#2563EB` | 统一到品牌色系（青蓝 → 品牌蓝） |
| S13 | `text-green-800` / `text-green-900`（`compare-client.tsx` 共同空闲卡片，2 处） | → `#16A34A` | 小幅提亮 |

S6–S7 是**有意为之的统一**：这两组在现有代码里本来就是同一语义的多个近似色阶，收敛后品牌色与主文字色全站一致。S12 同属这一类（评论折叠标记原本用青蓝，与全站品牌蓝不一致）。其余各项差值 ≤2 个色阶。

## 6. 品牌区实现

### 6.1 猫图标

```tsx
// components/navbar-list.tsx（原第 20 行）
<Cat size={24} strokeWidth={2} className="me-2 text-brand-logo" />
```

- 删掉 `color='rgb(14 165 233)'` prop。lucide 的 `stroke` 默认就是 `currentColor`，因此不传 `color` 时颜色由 CSS `color` 决定，`text-brand-logo` 在浅色解析为 `#003DB8`、深色解析为 `#FFFFFF`。
- `components/footer.tsx:20` 同样处理（该处 `size={24} strokeWidth={2}` 不变）。
- 尺寸、位置、`me-2` 间距、`<Link>` 包裹关系全部不变。

与 iOS 的对应关系：

| 模式 | web | iOS |
|---|---|---|
| 浅色 | `text-brand-logo` → `--brand-logo` = `#003DB8` | `cat-blue.svg` 的 `stroke="#003DB8"` |
| 深色 | `text-brand-logo` → `--brand-logo` = `#FFFFFF` | `cat-white.svg` 的 `stroke="#FFFFFF"` |

### 6.2 字标渐变

```tsx
// components/navbar-list.tsx 第 21 行、components/footer.tsx 第 22 行
<span className="... bg-gradient-to-r from-wordmark-from to-wordmark-to bg-clip-text text-transparent">
```

浅色值等于原来的 `sky-500 → indigo-600`（零位移）；深色改用 `sky-400 → indigo-400`，因为 `indigo-600` 在 `#020817` 上的对比度只有约 3.5:1，作为文字偏低。字号（`text-lg` / `text-xs` / `text-2xl`）、两行结构、`font-semibold` 全部不变。

### 6.3 顶栏与页脚

- `components/navbar.tsx:11`：`bg-white border-b border-gray-200` → `bg-background border-b border-border`。
- `components/footer.tsx:17`：`bg-gray-300/10` → `bg-surface-subtle`。

## 7. 切换入口

> **本节已按用户实测反馈修订（2026-10-03），以修订为准：** 不再有下拉菜单，也不再有 System 选项。
> `components/theme-toggle.tsx` 现在的形态是：
> - 导出的 `THEME_OPTIONS` 只有 `light` / `dark` 两项，供移动端侧边栏的 `ThemeOptions` 列表使用；
> - `ThemeToggle` 是**单个图标按钮**，单击即在浅色/深色之间切换（`setTheme(resolvedTheme === "dark" ? "light" : "dark")`），
>   图标显示当前 `resolvedTheme`（浅色太阳 / 深色月亮），`aria-label` 随之为 `Switch to light theme` / `Switch to dark theme`；
> - 未显式选择过的访客主题**跟随系统**（`defaultTheme="system"` + `enableSystem`），点击后写入 `localStorage` 并持久化；
> - 按钮样式与相邻的 search 按钮一致（`flex items-center outline-none`，无内边距、无 hover 底色、无聚焦描边）。
> 下面 7.1 起是修订前的原始设计，保留作为背景。

### 7.1 `components/theme-toggle.tsx`（`'use client'`）

- 复用现有 `components/ui/dropdown-menu.tsx`；触发按钮为图标按钮，显示当前**有效**主题：`Sun`（light）/ `Moon`（dark）/ `Monitor`（system，取 `theme === 'system'` 而非 `resolvedTheme`）。
- 下拉三项：`Light` / `Dark` / `System`，当前项带 `Check` 图标与 `aria-checked`。
- **挂载前占位**（必需）：`resolvedTheme` 在挂载前为 `undefined`，若直接渲染图标会造成服务端与客户端输出不一致。实现：

```tsx
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
if (!mounted) return <div className="h-9 w-9" aria-hidden />;
```

- 无障碍：`aria-label="Switch theme"`，图标按钮带 `sr-only` 文本；键盘交互由 DropdownMenu 提供。
- 图标尺寸 20、按钮尺寸与相邻的 `SearchButton` / `AdminEntry` 一致（`text-gray-900` 迁移为 `text-foreground`）。

### 7.2 挂载位置

- `components/navbar.tsx`：右侧按钮组顺序改为 `ThemeToggle` → `SearchButton` → `AdminEntry` → `NavbarAvatar`。
- `components/mobile-sidebar.tsx`：在 `SheetContent` 顶部加一组三选项按钮（`Sun` / `Moon` / `Monitor` + 文案），选中项用 `Button` 的选中态区分；结构对应 iOS `NavigationShell.themeIcon` 的三按钮。

### 7.3 不做

- 不做快捷键、不做右键菜单、不做"跟随系统时禁止手动切换"这类附加策略（N9）。

## 8. 迁移清单

本节是**原始清单**：54 个文件、423 处硬编码颜色类命中（`grep -oE '\b(bg|text|border|from|to|via)-(white|black|gray|slate|zinc|neutral|stone|sky|blue|indigo|green|red|amber)-?[0-9]*(/[0-9]+)?'`），用于评估工作量与拆分批次。

**实际需要迁移的是 48 个文件、335 处**（守卫测试口径：先剥离注释、再剔除 §5.6 的放行 token）。两套口径的差额已逐项核对：

| 口径 | 处数 |
|---|---|
| 原始命中 | 423 |
| 仅存在于注释里（扫描器剥离后不参与匹配） | 11 |
| 落在 §5.6 放行清单内（`text-white` / `text-white/80` / `bg-white/NN` / 品牌与装饰渐变） | 77 |
| **守卫口径需迁移** | **335**（423 − 11 − 77） |

其中 **6 个文件在原始清单里出现、但守卫口径下为 0 处**，不需要任何迁移：`app/layout.tsx`（3 处命中全在注释里）、`components/navbar-avatar.tsx`、`components/search.tsx`、`components/search/search-form.tsx`、`components/comments.tsx`、`app/professor/[...name]/page.tsx`（这 5 个文件的命中全部是放行项）。下表处数为原始命中数，这些文件的实际替换量为 0。

逐文件原始命中数（按路径排序）：

| # | 文件 | 处数 |
|---|---|---|
| 1 | `app/admin/layout.tsx` | 1 |
| 2 | `app/admin/page.tsx` | 6 |
| 3 | `app/admin/update/update-client.tsx` | 25 |
| 4 | `app/catalog/[...departments]/page.tsx` | 3 |
| 5 | `app/catalog/page.tsx` | 4 |
| 6 | `app/layout.tsx` | 3 |
| 7 | `app/not-found.tsx` | 4 |
| 8 | `app/page.tsx` | 28 |
| 9 | `app/professor/[...name]/page.tsx` | 3 |
| 10 | `app/sign-up/[[...sign-up]]/page.tsx` | 2 |
| 11 | `app/timetable/page.tsx` | 8 |
| 12 | `components/admin-entry.tsx` | 3 |
| 13 | `components/admin/admin-admins-client.tsx` | 3 |
| 14 | `components/admin/admin-comments-client.tsx` | 8 |
| 15 | `components/admin/admin-course-notes-client.tsx` | 5 |
| 16 | `components/admin/admin-courses-client.tsx` | 5 |
| 17 | `components/admin/admin-infinite-scroll.tsx` | 1 |
| 18 | `components/admin/admin-nav.tsx` | 5 |
| 19 | `components/admin/admin-reports-client.tsx` | 13 |
| 20 | `components/ads/ad-slot.tsx` | 3 |
| 21 | `components/banner.tsx` | 7 |
| 22 | `components/catalog-navigation.tsx` | 20 |
| 23 | `components/comment-content.tsx` | 3 |
| 24 | `components/comments.tsx` | 2 |
| 25 | `components/course-card.tsx` | 11 |
| 26 | `components/course-filter.tsx` | 1 |
| 27 | `components/course/course-header.tsx` | 5 |
| 28 | `components/course/course-instructors.tsx` | 3 |
| 29 | `components/course/rating-stats-card.tsx` | 6 |
| 30 | `components/cs-banner.tsx` | 4 |
| 31 | `components/faculty-statistics.tsx` | 1 |
| 32 | `components/footer.tsx` | 9 |
| 33 | `components/legal-content.tsx` | 8 |
| 34 | `components/loading-skeletons.tsx` | 23 |
| 35 | `components/mobile-sidebar.tsx` | 4 |
| 36 | `components/navbar-avatar.tsx` | 3 |
| 37 | `components/navbar-list.tsx` | 9 |
| 38 | `components/navbar.tsx` | 2 |
| 39 | `components/popular-courses.tsx` | 1 |
| 40 | `components/prof-card.tsx` | 6 |
| 41 | `components/report-dialog.tsx` | 2 |
| 42 | `components/review/comment-card.tsx` | 50 |
| 43 | `components/review/review-header.tsx` | 12 |
| 44 | `components/search.tsx` | 4 |
| 45 | `components/search/search-form.tsx` | 4 |
| 46 | `components/submit/submit-comment-form.tsx` | 1 |
| 47 | `components/timetable-schedule-card.tsx` | 5 |
| 48 | `components/timetable/compare-client.tsx` | 16 |
| 49 | `components/timetable/floating-planner.tsx` | 20 |
| 50 | `components/timetable/plan-header.tsx` | 9 |
| 51 | `components/timetable/planner-sidebar.tsx` | 24 |
| 52 | `components/timetable/section-list.tsx` | 9 |
| 53 | `components/timetable/share-dialog.tsx` | 1 |
| 54 | `components/timetable/week-grid.tsx` | 5 |

补充说明：

- `app/layout.tsx` 的 3 处命中**全部在注释里**（第 71–87 行引用已删除的 `RotatingText` 的注释块）。按 N8，守卫测试剥离注释后匹配，因此该块不需要改动。
- `components/loading-skeletons.tsx` 的多数命中属 §5.6 放行项（`bg-white/NN`），实际替换很少。
- `components/ui/drawer.tsx` 的 `bg-black/80` 在 `components/ui/**` 排除范围内。

## 9. 测试策略（TDD）

先写红灯测试，再迁移到绿灯。T1–T7 全部为新增测试文件。

| ID | 文件 | 断言 |
|---|---|---|
| T1 | `tests/theme-tokens.test.ts`（node） | 解析 `app/globals.css`：① `:root` 与 `.dark` 的**颜色**变量键集合完全一致 —— 比较时忽略已声明的非颜色例外 `--radius`（它只存在于 `:root`，是圆角尺寸而非颜色），深色漏定义颜色 token 是这类改动最高频的 bug；② §5.2 的 12 个 token 在两个作用域都存在；③ `--brand-logo` 浅色解析值 = `#003DB8`、深色 = `#FFFFFF`（HSL → HEX 零容差往返）；④ **跨仓库交叉校验**：若 `../next-ios/What2REG@UM/Assets.xcassets/CatLogo.imageset/cat-blue.svg` 存在，断言其 `stroke` 值等于 `--brand-logo` 的浅色值，`cat-white.svg` 的 `stroke` 等于深色值（用 `existsSync` 守卫，CI 无该仓库时跳过） |
| T2 | `tests/no-light-only-colors.test.ts`（node） | 守卫：递归扫 `app/**`、`components/**`（排除 `components/ui/**`、`components/timetable-calendar.tsx`，后者附注释说明是死代码），**先剥离 `{/* */}`、`/* */`、`//` 注释**再匹配；用单一 token 正则 `\b(text\|bg\|border\|from\|via\|to\|ring\|divide\|placeholder\|fill\|stroke)-(white\|black\|gray\|slate\|zinc\|neutral\|stone\|sky\|blue\|indigo\|green\|red\|amber\|teal\|violet\|fuchsia\|purple)(-[0-9]+)?(\/[0-9]+)?` 提取**完整**类名 token（含前缀 `hover:` / `md:` 与后缀 `/NN` 透明度），再与 §5.6 的**精确放行清单**逐 token 比对（不是逐行正则匹配 —— 否则 `bg-white/30` 会被 `bg-white` 规则误伤）；失败信息按 `file:line  token` 输出完整违规清单 |
| T3 | `tests/components/theme-provider.test.tsx`（jsdom） | `vi.mock('next-themes')` 捕获 props：断言 `attribute="class"`、`defaultTheme="light"`、`enableSystem`、`disableTransitionOnChange`、`storageKey="umeh-theme"`；另断言 `app/layout.tsx` 源码匹配 `/<html[^>]*suppressHydrationWarning/`（源码契约断言）。**路径必须在 `tests/components/` 下** —— `vitest.config.ts` 只把该目录设为 jsdom 环境 |
| T4 | `tests/components/theme-toggle.test.tsx`（jsdom） | mock `next-themes`（`theme`、`resolvedTheme`、`setTheme`）：① `ThemeOptions` 渲染三项、当前项 `aria-checked="true"`；② 点击 `Dark` 恰好调用一次 `setTheme('dark')`；③ `ThemeToggle` 用 `renderToStaticMarkup`（effect 不执行）断言挂载前渲染等尺寸占位、且不含任何主题图标；④ RTL 渲染后出现 `aria-label="Switch theme"` 的触发按钮 |
| T5 | `tests/components/brand-logo.test.tsx`（jsdom） | mock `next/link`、`next/navigation`、`@/components/timetable/planner-provider`：① `NavbarList` 渲染出的 `svg` class 含 `text-brand-logo` 且 `color` 属性为 `null`（防止回归到 `color='rgb(14 165 233)'`）；② 字标元素 class 含 `from-wordmark-from` 与 `to-wordmark-to`、不含 `from-sky-500`；③ `await Footer()` + `renderToStaticMarkup` 断言页脚同上 |
| T6 | `tests/components/theme-color-meta.test.tsx`（jsdom） | 在 `document.head` 预置 `<meta name="theme-color">`：`resolvedTheme='light'` → `content='#FFFFFF'`；`'dark'` → `content='#020817'`；`theme='system'` 且 `resolvedTheme='dark'` → `'#020817'`（证明 system 由 `resolvedTheme` 天然跟随）；meta 不存在时不抛错 |

| T7 | `tests/theme-mounts.test.ts`（node） | 挂载契约（源码扫描，沿用仓库现有守卫测试写法）：`components/navbar.tsx` 含 `from "@/components/theme-toggle"` 与 `<ThemeToggle />`；`components/mobile-sidebar.tsx` 含 `<ThemeOptions`；`app/layout.tsx` 含 `<ThemeProvider>` 与 `<ThemeColorMeta />`。**理由**：`Navbar` / `MobileSidebar` 直接渲染需要 mock Clerk 与 Radix Portal，成本高且脆弱；而"入口到底挂没挂上"正是最容易在重构中静默失效的一点，用源码契约锁住，真实交互交给 §10 AC6 的浏览器走查 |

**测试基建前置修正（实测发现，必须做）**：`tsconfig.json` 的 `jsx` 是 `preserve`，vitest/esbuild 因此按**经典 runtime** 转译 JSX，而 Next 14 的组件大多不写 `import React`（`components/navbar-list.tsx`、`components/footer.tsx` 都没有）。于是任何"渲染这些组件的测试"都会在渲染期抛 `ReferenceError: React is not defined`。修法是在 `vitest.config.ts` 里让测试转译与 Next 对齐：

```ts
export default defineConfig({
  esbuild: { jsx: "automatic" },
  // …原有 resolve / test 配置不变
});
```

已实测：加上这一行后 **107 个现有测试文件 / 359 个用例全部通过**（未加时 T3/T4/T5 会因 React 未定义而失败；加后只剩预期的断言失败）。备选方案（给被测组件补 `import React`）被否决 —— 那是为测试基建改动生产源码。

回归与构建门（§10 AC1）：`npm test`（现有 **107** 个测试文件 / 359 个用例必须全绿）、`npm run lint`、`npx tsc --noEmit`、`npm run build`。

## 10. 验收标准

- **AC1**：`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 四个门全绿。
- **AC2**：T2 守卫测试通过 —— 即 54 个文件里不再有裸色阶类（放行项除外），且 `components/admin/**`、`app/admin/**` 也在扫描范围内。
- **AC3**：浅色模式的差异**仅限 §5.7 清单内**的项，逐页截图对照确认；清单外无变化。
- **AC4**：深色模式下逐页人工走查通过：正文/次级文字对比度可读、边框可见、Offered 与 Not Offered 徽章可辨、评分卡与骨架屏正常、`report-dialog` / `share-dialog` 弹窗与 toast 正常。
- **AC5**：`--brand-logo` 的浅色值与 iOS `cat-blue.svg` 一致（T1 自动断言，跨仓库存在时执行）。
- **AC6**：主题切换后刷新仍保持；`system` 模式改系统外观即时跟随（无需刷新）；hard reload（关缓存 + CPU 节流）首屏无闪烁。
- **AC7**：admin 页面在深色下也是完整深色，无"深壳 + 白块"混合外观。
- **AC8**：浏览器 console 无 hydration 警告（含主题切换、刷新、客户端路由往返）。

## 11. 风险与缓解

| ID | 风险 | 缓解 |
|---|---|---|
| R1 | 新增 token 只在 `:root` 定义、`.dark` 漏定义 → 深色下该处失效 | T1 的键集合断言直接覆盖这一类 |
| R2 | hydration mismatch（主题相关的服务端/客户端输出不一致） | `mounted` 占位（§7.1）+ `<html suppressHydrationWarning>`（§4.3）+ AC8 |
| R3 | 首屏闪烁（FOUC） | `next-themes` 的阻塞脚本；AC6 用 hard reload + CPU 节流验证 |
| R4 | 浅色位移超出 §5.7 预期（例如某个灰阶收敛后肉眼可见） | §5.7 是完整清单，验证时逐条对照；若超差，就地调整该 token 的 `:root` 值即可（单点修改，不影响组件） |
| R5 | Clerk / AdSense / fancyapps 在深色下不自适应 | 已列 N4–N6 为已知限制；`appearance` 作为后续可选增强 |
| R6 | `next-themes@0.2.1` 在 Next 14.2 + React 18.2 下的边界行为（`resolvedTheme` 首次为 `undefined`） | 已是该版本的标准行为，T4 断言"挂载前渲染占位"锁死用法 |
| R7 | 迁移过程中误改布局/间距（类名替换时连带改动其他 utility） | 迁移只替换颜色 token 类，禁止改动非颜色类；diff 评审聚焦；T2 只关心颜色类 |
| R8 | 品牌渐变（`from-blue-600 to-indigo-500`）在深色下显得过亮 | 已评估为可接受（饱和蓝块配白字）；若验证时认为刺眼，加 `--brand-from` / `--brand-to` 两个 token 即可（局部改动） |

## 12. 交付物

- 新增代码：`components/providers/theme-provider.tsx`、`components/theme-toggle.tsx`、`components/theme-color-meta.tsx`
- 修改代码：`app/layout.tsx`（Provider、`suppressHydrationWarning`、`theme-color` meta、状态栏 meta 修正）、`app/globals.css`（12 个新 token + 3 处值调整）、`tailwind.config.js`（嵌套色板扩展）、`vitest.config.ts`（`esbuild: { jsx: "automatic" }`）、`components/navbar.tsx`、`components/mobile-sidebar.tsx`、§8 清单中的 48 个文件
- 测试：§9 的 T1–T7
- 文档：本 spec、`docs/superpowers/plans/2026-10-02-next-web-dark-mode.md`、`docs/superpowers/verification/2026-10-02-next-web-dark-mode.md`
