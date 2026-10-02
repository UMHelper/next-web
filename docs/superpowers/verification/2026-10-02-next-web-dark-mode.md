# Dark Mode + Brand Logo Verification — 2026-10-02

## Status

- **被测 commit**：`e1f656d6e8a0d6d805e46b26ae24991c778f1d45`（`e1f656d test(theme): empty PENDING now that all 48 files are migrated`）
- **worktree**：`/Users/box/UMHelper/next-web/.worktrees/wt-t17`（分支 `task/wt-t17`），`node_modules` 为指向主仓库的 symlink，`.env.local` 存在
- **验证日期**：2026-10-02（UTC 15:37–15:55 / CST 23:37–23:55）
- **环境**：Node v25.8.1、Next.js 14.2.35、Tailwind 3.3.3、vitest 2.1.9、lucide-react 0.276.0、next-themes 0.2.1；数据库为远端 Supabase（`.env.local` 内，可达）
- **执行者**：自动化 agent。**没有浏览器，没有截图，没有"看过一眼"** —— 见下节。

### 机器验证了什么（本文件的全部内容）

1. 四道质量门在本 worktree 独立复跑（§1）。
2. 9 条真实路由的服务端渲染输出逐项断言：HTTP 状态、猫标 SVG 属性、退役色阶类名、`theme-color` meta、预水合主题脚本、`<html lang>`（§2）。
3. 编译产物 CSS 里 `.dark` 与 `:root` 的 token 取值，与 spec §5.5 / §5.7 声称的目标 hex 逐一对照（§2.6）。
4. 三条由机器算出的、需要人裁决的风险（§3）。

### 机器**没有**验证、必须人眼确认的部分

- **深色模式下的任何实际观感**。`<html class="dark">` 是客户端才写入的（`localStorage` → `next-themes` 注入脚本），**服务端 HTML 永远是浅色**。因此"深色下对比度可读 / 边框可见 / 徽章可辨 / 无白块"这类结论在本文件中**完全没有任何证据支撑**，不许被当作已通过。
- 浅色模式与改动前的**逐页视觉对照**（§4.1 给出逐条对照清单）。
- 首屏**无闪烁**、**无 hydration 告警**（需要真实浏览器 Console 与 hard reload）。
- 已知限制项的实际观感（Clerk 白卡、AdSense 白块等）。

> **本文件不得被引用为"深色模式已通过验收"。** 它证明的是：迁移后的代码在服务端不再吐出任何退役色阶类名、品牌猫标的颜色来源已由内联 `rgb()` 改为 CSS token、token 取值与设计稿一致、主题切换器已挂载、四道质量门是绿的。深色模式的视觉验收仍是一项**未完成**的人工任务（§4）。

## 0. 控制器裁定 R2 的落地方式

原计划要求"人工视觉走查"（浅色对照、深色检查、无闪烁）。执行者与控制器都无法真正**看**页面，写下"visual inspection passed"就是伪造证据。本文件因此把产出物拆成两块，边界清晰：

| 块 | 内容 | 状态 |
|---|---|---|
| 机器可核验证据 | 本文件 §1–§3，全部是**实际跑出来的输出**，可复现 | ✅ 已完成 |
| 人工清单 | §4，写成"在哪一页看什么"的具体问题，**未执行** | ⬜ 待人工 |

§4 里没有任何一条是凭空的：每条都锚定到真实路由、真实文件:行、真实 token 取值。

## 1. 四道质量门（本 worktree 独立复跑）

作为对另一任务那次运行的交叉核对，以下四条在 `wt-t17` 上**自己跑过**。

### 1.1 `npm test`

```
$ npm test 2>&1 | tail -8

 Test Files  114 passed (114)
      Tests  383 passed (383)
   Start at  23:40:05
   Duration  6.09s (transform 2.27s, setup 0ms, collect 9.44s, tests 3.03s, environment 15.01s, prepare 6.35s)
```

（exit 0）

### 1.2 `npm run lint`

```
$ npm run lint

> next-web@0.1.0 lint
> next lint

✔ No ESLint warnings or errors
```

（exit 0）

### 1.3 `npx tsc --noEmit`

```
$ npx tsc --noEmit
```

无输出，exit 0。

### 1.4 `npm run build`

```
$ npm run build 2>&1 | tail -12

├ ○ /terms-of-service                                      194 B          96.4 kB
├ ○ /terms-of-service/zh                                   194 B          96.4 kB
└ ○ /timetable                                             7.01 kB         168 kB
+ First Load JS shared by all                              87.5 kB
  ├ chunks/1528-9e8b1ad2f29fc8bd.js                        31.9 kB
  ├ chunks/1dd3208c-ce8e918af95ff0ec.js                    53.6 kB
  └ other shared chunks (total)                            2.01 kB

ƒ Middleware                                               48.4 kB

○  (Static)   prerendered as static content
●  (SSG)      prerendered as static HTML (uses getStaticProps)
ƒ  (Dynamic)  server-rendered on demand
```

exit 0。`next.config.js` 里**没有** `typescript.ignoreBuildErrors` 或 `eslint.ignoreDuringBuilds`，因此 exit 0 同时意味着构建期的类型检查与 lint 都通过了。路由清单完整（33 条路由 + middleware），`First Load JS shared` 87.5 kB。

**四道门全绿。**

## 2. 服务端渲染证据

### 2.1 起服务器

```bash
$ npx next dev -p 3050          # webpack，不是 npm run dev（Turbopack 解析不了 worktree 里 symlink 的 node_modules）

  ▲ Next.js 14.2.35
  - Local:        http://localhost:3050
  - Environments: .env.local

 ✓ Starting...
 ✓ Ready in 6.7s
```

dev log 里 **0 条 error / warning**；只有一条与本改动无关的 caniuse-lite 数据陈旧提示。

> 环境注记：本机 `http_proxy=http://localhost:7897` 是设着的，curl 默认会走它（这会把"连接被拒"伪装成 HTTP 502）。因此所有证据采集脚本一律带 `--noproxy '*'`，并且 dev server 自身的访问日志独立记录了相同的路由与状态码。

### 2.2 覆盖的路由（9 条，全部可达、全部 200）

| 路由 | 选择理由 | HTTP |
|---|---|---|
| `/` | 首页：4 个 `Card`、搜索区、统计骨架 | 200 |
| `/timetable` | 课表主界面（client component 为主） | 200 |
| `/catalog` | 学院卡片列表（`bg-card` + `border-border`） | 200 |
| `/terms-of-service` | 法务页 | 200 |
| `/privacy-policy` | 法务页 | 200 |
| `/search/course/CISC` | 课程搜索结果（300 KB 级 HTML，大量卡片） | 200 |
| `/course/CISC1001` | 单课程页（course code 取自搜索结果里的真实链接 `/course/CISC1001`） | 200 |
| `/reviews/CISC1001/LAM%20TENG` | 评论页（含评论卡、星标、骨架屏） —— 取自 `/course/CISC1001` 页内的真实 `/reviews/CISC1001/LAM TENG` 链接 | 200 |
| `/professor/LAM%20TENG` | 教授页（`ProfCourseCard` + `RatingStatsCard`，token 密度最高） | 200 |

`/admin` 与 `/compare/[token]` **没有机器证据**：前者需要登录（Clerk），后者需要一个由课表「分享」生成的 token。两者都留在人工清单里（§4.2、§4.3）。这一点如实列出，不用"应该没问题"顶替。

### 2.3 逐项断言结果

| 断言 | 结果 |
|---|---|
| HTTP 200 | ✅ 9/9 |
| 猫标 SVG 带 `stroke="currentColor"` | ✅ 每页 2 个渲染实例（navbar + footer），见下方原文 |
| 猫标 SVG 带 `text-brand-logo` class | ✅ `class="me-2 text-brand-logo"` |
| 无 `color="rgb(...)"` 属性 | ✅ **0 处**（9 页合计）—— 旧的 `color='rgb(14 165 233)'` 确已消失 |
| 无退役色阶类名 | ✅ **0 处**（6 个抽查类名 × 9 页全为 0），详见 §2.5 |
| `<meta name="theme-color" content="#FFFFFF">` 在 SSR 输出中 | ✅ 9/9 |
| 预水合主题脚本存在 | ✅ 9/9（每页恰好 1 次），见 §2.4 |
| `<html lang="zh-Hant">` 完整 | ✅ 9/9 |

猫标 SVG 的服务端原文（9 页完全一致）：

```html
<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
     class="me-2 text-brand-logo">
```

`stroke="currentColor"` + `text-brand-logo` 二者同时成立，正是"颜色改由 CSS token 决定"的机器可核验形式：lucide 0.276 的 `defaultAttributes` 里 `stroke: "currentColor"`、`color = "currentColor"`（`node_modules/lucide-react/dist/cjs/lucide-react.js:15,24`），所以颜色落到 CSS `color` 上，而 `text-brand-logo` → `--brand-logo` 在 `:root` 为 `#003DB8`、在 `.dark` 为 `#FFFFFF`。

`theme-color` meta 与 `color-scheme`：SSR 只能给出静态的 `#FFFFFF`（`app/layout.tsx:45`），深色下由 `components/theme-color-meta.tsx` 的 `useEffect` 改写为 `#020817` —— 这一步是客户端行为，**不在本文证据范围内**。

### 2.4 预水合主题脚本（防闪烁的那段）

`next-themes` 注入的是 `<body>` 的第一个子元素，一段**阻塞式内联脚本**，位于全部页面内容之前：

```html
<body class="__className_f367f3"><script>!function(){try{var d=document.documentElement,c=d.classList;c.remove('light','dark');var e=localStorage.getItem('umeh-theme');if('system'===e||(!e&&false)){var t='(prefers-color-scheme: dark)',m=window.matchMedia(t);if(m.media!==t||m.matches){d.style.colorScheme = 'dark';c.add('dark')}else{d.style.colorScheme = 'light';c.add('light')}}else if(e){c.add(e|| '')}else{c.add('light')}if(e==='light'||e==='dark'||!e)d.style.colorScheme=e||'light'}catch(e){}}()</script>
```

逐项对应设计：

| 片段 | 含义 |
|---|---|
| `c.remove('light','dark')` | 先清掉两种 class，避免残留 |
| `localStorage.getItem('umeh-theme')` | `storageKey="umeh-theme"` 生效 |
| `'system'===e \|\| (!e&&false)` | `enableSystem` 已开；`&&false` 是因为 `defaultTheme="light"` 而非 `"system"` |
| `matchMedia('(prefers-color-scheme: dark)')` | System 模式下**在首次绘制前**就解析系统偏好 |
| `else{c.add('light')}` | 无存储值时落回 `defaultTheme="light"` |
| `d.style.colorScheme = ...` | 同步 `color-scheme`，让滚动条/表单控件也跟着切换 |

脚本在 `<body>` 内、页面内容之前同步执行，这是"首屏不先白后黑"的机制。**但机制存在不等于不闪烁** —— 实际是否闪屏取决于脚本执行到首绘的时序，只有真实浏览器的 hard reload + CPU 节流能判定（§4.6）。

### 2.5 退役色阶类名 grep（含放行判断）

对 9 份 SSR HTML 抓取：

```bash
$ curl -s --noproxy '*' http://localhost:3050<ROUTE> -o /tmp/t17-ssrN/<name>.html
$ # 再对每份 HTML 做精确分类（见下）
```

**抽查处数的退役类名（正则 `TOKEN(?![\w/-])`，即 `bg-white/30` **不会**被算作 `bg-white`）：**

| 类名 | `/` | `/timetable` | `/catalog` | `/terms` | `/privacy` | `/search/course/CISC` | `/course/CISC1001` | `/reviews/...` | `/professor/...` |
|---|---|---|---|---|---|---|---|---|---|
| `bg-white` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `text-gray-500` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `bg-gray-100` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `border-slate-200` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `bg-sky-100` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| `text-blue-700` | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

**合计 0 处。** 但更彻底的做法是不只抽查这 6 个 —— 我改为枚举**所有**颜色刻度工具类（与守卫测试 `tests/no-light-only-colors.test.ts:34-35` 的 `TOKEN_PATTERN` 同口径），逐一判定：

> 行号说明：本文对守卫测试的行号引用（`:5` `ROOTS`、`:12-32` `ALLOWED_TOKENS`、`:34-35` `TOKEN_PATTERN`）指向**被测 commit `e1f656d`** 的那一版（161 行）。Task 16 在集成 worktree 里把该文件收严到约 91 行，行号会后移，请按符号名查找。

```
route | token | count | verdict
catalog.html               text-white      x1    ALLOWLISTED
course_CISC1001.html       bg-white/20     x4    ALLOWLISTED
course_CISC1001.html       bg-white/25     x6    ALLOWLISTED
course_CISC1001.html       bg-white/30     x4    ALLOWLISTED
course_CISC1001.html       from-amber-500  x6    OUTSIDE-ALLOWLIST   ← §3.1
course_CISC1001.html       from-blue-600   x4    ALLOWLISTED
course_CISC1001.html       from-green-400  x2    OUTSIDE-ALLOWLIST   ← §3.1
course_CISC1001.html       text-white      x7    ALLOWLISTED
course_CISC1001.html       to-fuchsia-800  x8    OUTSIDE-ALLOWLIST   ← §3.1
course_CISC1001.html       to-indigo-500   x4    ALLOWLISTED
privacy-policy.html        text-white      x1    ALLOWLISTED
root.html                  from-blue-600   x1    ALLOWLISTED
root.html                  text-white      x6    ALLOWLISTED
root.html                  text-white/80   x5    ALLOWLISTED
root.html                  to-indigo-500   x1    ALLOWLISTED
search_course_CISC.html    from-blue-600   x1    ALLOWLISTED
search_course_CISC.html    text-white      x22   ALLOWLISTED
search_course_CISC.html    to-indigo-500   x1    ALLOWLISTED
terms-of-service.html      text-white      x1    ALLOWLISTED
timetable.html             text-white      x1    ALLOWLISTED
professor_LAM TENG.html    bg-white/30     x1    ALLOWLISTED
professor_LAM TENG.html    from-amber-500  x34   OUTSIDE-ALLOWLIST   ← §3.1
professor_LAM TENG.html    from-blue-600   x3    ALLOWLISTED
professor_LAM TENG.html    from-gray-400   x8    OUTSIDE-ALLOWLIST   ← §3.1
professor_LAM TENG.html    from-green-400  x8    OUTSIDE-ALLOWLIST   ← §3.1
professor_LAM TENG.html    from-neutral-700 x12 ALLOWLISTED
professor_LAM TENG.html    text-white      x19   ALLOWLISTED
professor_LAM TENG.html    to-fuchsia-800  x14   OUTSIDE-ALLOWLIST   ← §3.1
professor_LAM TENG.html    to-gray-500     x8    OUTSIDE-ALLOWLIST   ← §3.1
professor_LAM TENG.html    to-indigo-500   x3    ALLOWLISTED
professor_LAM TENG.html    to-stone-900    x12   ALLOWLISTED
reviews_CISC1001_LAM TENG.html  bg-white/20 x8   ALLOWLISTED
reviews_CISC1001_LAM TENG.html  bg-white/25 x12  ALLOWLISTED
reviews_CISC1001_LAM TENG.html  bg-white/30 x12  ALLOWLISTED
reviews_CISC1001_LAM TENG.html  from-blue-600 x10 ALLOWLISTED
reviews_CISC1001_LAM TENG.html  text-white   x3  ALLOWLISTED
reviews_CISC1001_LAM TENG.html  to-indigo-500 x10 ALLOWLISTED
```

计数说明：这些是**响应字符串里的出现次数**，不是 DOM 元素数 —— RSC flight payload 会把同一段 `className` 在多个 `<script>self.__next_f.push(...)>` 里重复序列化（例如评论页的 `bg-white/30` ×12 实际是 4 个骨架条 ×3 份序列化）。因此计数只用来看"有没有残留"，不能用来推断页面元素个数。另外 `/` 与 `/search/course/CISC` 两次采集的 `text-white/80` 计数差 1（4 vs 5），是流式渲染时 flight 分片边界不同所致，属预期抖动。

**被我有意放行、不计为失败的匹配（逐条给理由）：**

| 匹配 | 归属 | 放行理由 |
|---|---|---|
| `text-white` ×61、`text-white/80` ×5（9 页合计） | 全站 | spec §5.6 明列：这些白字全部落在**品牌蓝渐变 / 成功绿 / 危险红**底色上（Offered 徽章、`from-blue-600 to-indigo-500` 头部、提交按钮），两种模式都该是白字。与 `tests/no-light-only-colors.test.ts:12-32` 的 `ALLOWED_TOKENS` 一致 |
| `bg-white/20` ×12、`bg-white/25` ×18、`bg-white/30` ×17 | `components/loading-skeletons.tsx:69-120` | §5.6 明列：这些是**品牌渐变头部上的白色骨架条**，不是白色表面。本次实测它们**只出现在流式渲染的 Suspense fallback 里**：`/` 与 `/search/course/CISC` 的 HTML 里 0 处（数据在 shell flush 前就解析完了），`/course/CISC1001`、`/reviews/...` 里出现（它们确实先流了骨架屏）。行为与设计一致 |
| `from-blue-600` / `to-indigo-500` | 全站 | §5.6 品牌渐变，饱和蓝块配白字在深色下依然成立 |
| `from-neutral-700` / `to-stone-900` | `components/prof-card.tsx:52` | §5.6 Not Offered 深色徽章，两种模式都成立 |
| `from-amber-500` / `to-orange-500` / `from-green-400` / `to-emerald-500` / `from-gray-400` / `to-gray-500` / `from-rose-900` / `to-fuchsia-800` | `lib/utils.ts:8-23` `get_bg()` | **这些不应当被"放行"—— 它们是守卫的盲区**，见 §3.1 |

对照脚本（同口径的源码侧扫描）也说明源码里没有别的东西漏网：对 `app/` + `components/`（排除 `components/ui/`）做同样的枚举，**唯一**的颜色刻度工具类就是上表里的放行项 —— 0 个未放行项。

### 2.6 编译产物 CSS 里的 token（S1–S13 目标值核对 + R17 的机器证据）

取 dev server 实际返回的样式表（`<link rel="stylesheet" href="/_next/static/css/app/layout.css">`，本次 `?v=1790955853770`，80 816 字节），其中 `.dark` 块原文：

```css
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;

    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;

    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    ...
    --border: 217.2 32.6% 17.5%;
    --surface-subtle: 222.2 47.4% 9%;
    --surface-strong: 217.2 32.6% 24%;
    --subtle-foreground: 215 20.2% 45%;
    --border-strong: 217.2 32.6% 28%;
    --brand: 213.1 93.9% 67.8%;
    --brand-strong: 211.7 96.4% 78.4%;
    --brand-logo: 0 0% 100%;
  }
```

**浅色 token 与 spec §5.5/§5.7 声称的目标 hex 逐一核对 —— 全部吻合**（HSL 三元组按 CSS 规则换算成 hex）：

| token | `:root` 取值 | 换算 hex | spec 声称 | 对应 S 项 |
|---|---|---|---|---|
| `--foreground` | `220.9 39.3% 11%` | `#111827` | `#111827`（gray-900） | S7 目标 |
| `--muted-foreground` | `220.9 8.9% 46.1%` | `#6B7280` | `#6B7280`（gray-500） | S1 目标 |
| `--muted` | `220.9 14.3% 95.9%` | `#F3F4F6` | `#F3F4F6`（gray-100） | S2 目标 |
| `--border` | `214.3 31.8% 91.4%` | `#E2E8F0` | `#E2E8F0`（slate-200） | S3 目标 |
| `--surface-strong` | `220 13% 91%` | `#E5E7EB` | `#E5E7EB`（gray-200） | S4 目标 |
| `--surface-subtle` | `210 20% 98%` | `#F9FAFB` | `#F9FAFB`（gray-50） | S5 目标 |
| `--brand` | `221.2 83.2% 53.3%` | `#2563EB` | `#2563EB`（blue-600） | S6 目标 |
| `--brand-strong` | `224.3 76.3% 48%` | `#1D4ED8` | `#1D4ED8`（blue-700） | S8 目标 |
| `--success` | `142.1 76.2% 36.3%` | `#16A34A` | `#16A34A`（green-600） | S9 / S13 目标 |
| `--warning` | `26 90.5% 37.1%` | `#B45309` | `amber-700` | S10 目标 |
| `--subtle-foreground` | `218.5 10.6% 64.9%` | `#9CA3AF` | `gray-400` | §5.5 映射 |
| `--border-subtle` | `210 40% 96.1%` | `#F1F5F9` | `slate-100` | §5.5 映射 |
| `--border-strong` | `216 12.2% 83.9%` | `#D1D5DB` | `gray-300` | §5.5 映射 |
| `--brand-logo` | `220.1 100% 36.1%` | `#003DB8` | `#003DB8` | §6.1 猫标浅色 |
| `--wordmark-from` | `198.6 88.7% 48.4%` | `#0EA5E9` | `sky-500` | S11 目标 |
| `--wordmark-to` | `243.4 75.4% 58.6%` | `#4F46E5` | `indigo-600` | S11 语境 |

即：**S1–S13 的"目标值"是机器可核验的、且已核对通过**；S1–S13 的"改动后的观感"仍然只能人眼判断（§4.1）。

深色 token 的换算值（后续几节要用）：

| token | `.dark` 取值 | hex | 相对 `#020817` 的对比度 |
|---|---|---|---|
| `--background` / `--card` / `--popover` | `222.2 84% 4.9%` | `#020817` | 1.00:1 |
| `--surface-subtle` | `222.2 47.4% 9%` | `#0C1322` | 1.08:1 |
| `--surface-strong` | `217.2 32.6% 24%` | `#293851` | 1.69:1 |
| `--border` | `217.2 32.6% 17.5%` | `#1E293B` | 1.37:1 |
| `--muted-foreground` | `215 20.2% 65.1%` | `#94A3B8` | 7.80:1 |
| `--subtle-foreground` | `215 20.2% 45%` | `#5C6F8A` | **3.90:1** ← §3.3 |
| `--foreground` | `210 40% 98%` | `#F8FAFC` | 19.12:1 |
| `--brand` | `213.1 93.9% 67.8%` | `#60A5FA` | 7.87:1 |

以上都是 token 的**数值**。深色下的实际观感（对比度是否"可读"、边框是否"看得见"）是人的判断，不是本文件的结论。并且如上所述：服务端 HTML 永远是 `<html lang="zh-Hant">` + 浅色 token，**深色类渲染在服务端无法产生**，我没有尝试伪造它。

一处顺带发现的小偏差（不影响 S1–S13，仅记录）：`:root` 的 `--destructive` 是 `0 84.2% 60.2%` = `#EF4444`，即 `red-500`。spec §5.5 把 `text-red-500` 与 `text-red-600`（`#DC2626`）**都**映射到 `text-destructive`，所以原 `text-red-600`（5 处）在浅色下有约一个色阶的提亮。这一项不在 §5.7 的 S 清单里，故未列入 §4.1；是否需要补一条由控制器决定。

## 3. 机器发现、需要人裁决的三处风险

这三条都是这次采集**意外发现**的，不是复述任务书。

### 3.1 `lib/utils.ts` 的 `get_bg()` —— 守卫扫描宇宙之外（最重要的一条）

`lib/utils.ts:8-23`：

```ts
export const get_bg = (n: number) => {
    let result_bg = "bg-gradient-to-r from-gray-400 to-gray-500"
    if (n > 0)        { result_bg = 'bg-gradient-to-r from-rose-900 to-fuchsia-800' }   // 1 - 2.3
    if (n >= 2.3)     { result_bg = 'bg-gradient-to-r from-amber-500 to-orange-500' }   // 2.3 - 3.6
    if (n >= 3.6)     { result_bg = 'bg-gradient-to-r from-green-400 to-emerald-500' }  // 3.6 - 5.0
    return result_bg
}
```

它返回的是**颜色刻度类名**，被用在 `className={cn(get_bg(x), "bg-clip-text text-transparent")}` 上 —— 也就是**这个分数/等级数字的颜色本身就是那段渐变**：

- `components/course/rating-stats-card.tsx:44,52,58,64`（`/professor/[name]`、课程页的评分卡）
- `components/review/comment-card.tsx:576,579,582,585,588`（`/reviews/[code]/[prof]` 的每条评论）

实测：`/professor/LAM%20TENG` 的 SSR HTML 里 `from-amber-500` ×34、`to-fuchsia-800` ×14、`from-green-400` ×8、`from-gray-400` ×8、`to-gray-500` ×8；`/course/CISC1001` 里也有。**这些既不在 `ALLOWED_TOKENS` 里，也不是退役清单里的类 —— 它们根本没有被守卫看到**，因为守卫的扫描范围是 `ROOTS = ["app", "components"]`（`tests/no-light-only-colors.test.ts:5`），**`lib/` 不在其中**。spec §5.5 的映射表里也没有 `get_bg`。

深色下的对比度（机器算的，`#020817` 底）：

| 渐变端点 | hex | 深色对比度 | 浅色对比度 |
|---|---|---|---|
| `from-gray-400` | `#9CA3AF` | 7.88:1 | 2.54:1 |
| `to-gray-500` | `#6B7280` | 4.14:1 | 4.83:1 |
| `from-rose-900` | `#881337` | **2.09:1** | 9.57:1 |
| `to-fuchsia-800` | `#86198F` | **2.43:1** | 8.24:1 |
| `from-amber-500` | `#F59E0B` | 9.32:1 | 2.15:1 |
| `to-orange-500` | `#F97316` | 7.14:1 | 2.80:1 |
| `from-green-400` | `#4ADE80` | 11.48:1 | 1.74:1 |
| `to-emerald-500` | `#10B981` | 7.89:1 | 2.54:1 |

`from-rose-900 → to-fuchsia-800` 是**低分段**（0 < GPA < 2.3）那一档，深色下 2.09:1 / 2.43:1 —— 远低于 WCAG AA 正文的 4.5:1。也就是说："深色模式下**低绩点/差评等级的字母数字几乎看不见**"是一个可预测的具体缺陷，但它既没有守卫测试也没有迁移任务覆盖。**请人眼在 §4.2 专门确认这一条**；是否本轮修由控制器决定。

### 3.2 `components/review/comment-card.tsx` 星标的内联色（任务书已点名，但范围比任务书更大）

`components/review/comment-card.tsx:543-548`：

```tsx
itemStyles={{                                                            // :543
    itemShapes: ThinStar,                                                 // :544
    activeBoxColor: ['#e7040f', '#ff6300', '#ffde37', '#61bb00', '#19a974'],  // :545
    inactiveBoxColor: '#C7C7C7',                                          // :546
    inactiveFillColor: 'white',                                           // :547
    activeFillColor: 'white',                                             // :548
}}
```

这些是**内联传给 `@smastrom/react-rating` 的值**，不是 Tailwind 类 —— 守卫（按类名扫描）与迁移（按类名替换）都覆盖不到。任务书点到了 `inactiveBoxColor: '#C7C7C7'`，**实测同一处还有 `inactiveFillColor: 'white'` 与 `activeFillColor: 'white'`**：`inactiveBoxColor` 是未选中星的方框底色，`*FillColor` 是星形本身的填充色。深色下未选中的星会是 **`#C7C7C7` 方框 + 白色星形**（对比度约 1.00:1 量级，即星形几乎融进方框），而选中星是"品牌色方框 + 白色星形"。这条必须人眼看（§4.4），我无法从 SSR 判定（该组件在评论卡里，`Rating` 是可交互的 client 组件，且深色也渲染不出来）。

### 3.3 `--subtle-foreground` 深色 3.90:1

`--subtle-foreground` 深色 `215 20.2% 45%` = `#5C6F8A`，在 `#020817` 上 **3.90:1** —— 低于 WCAG AA 正文 4.5:1。它落在 `text-foreground-subtle` 上，用于 12 个文件，例如：

- `components/course/rating-stats-card.tsx`（评分卡的「Grade」「Easy」等小标签）
- `components/review/comment-card.tsx`、`components/report-dialog.tsx`（举报按钮：`text-foreground-subtle hover:text-destructive`）
- `components/timetable/section-list.tsx`、`planner-sidebar.tsx`、`app/timetable/page.tsx`
- `components/admin/admin-courses-client.tsx`、`admin-infinite-scroll.tsx`
- `components/ads/ad-slot.tsx`（广告位占位文案）

对照：`--muted-foreground`（`text-muted-foreground`，用得最多的次级文字）是 7.80:1，没问题。所以问题只集中在"最浅的一档次级文字"。**这是 token 数值层面的风险提示，是否可接受由人眼看（§4.2）**；本轮不改。

## 4. 人工检查清单（浏览器，**本次未执行**）

执行方式：`cd <worktree> && npx next dev -p 3050`，浏览器开 `http://localhost:3050`。浅色对照的基线是**主仓库 `/Users/box/UMHelper/next-web`（`main`，`e8a5bc6`）那一版改动前的原站**，可以另起一个端口同时开两份逐页对比。
移动端断点用 ≤768px（`components/mobile-sidebar.tsx` 是 `md:hidden`）。

### 4.1 浅色模式逐页对照 §5.7（S1–S13）

**先说清方法**：下表每一行的"文件:行"是**在基线 `main`（`e8a5bc6`）上 grep 原始类名得到的真实位置**，所以能直接告诉你"去哪一页的哪个元素上看"。幅度列的措辞沿用 spec §5.7。

| # | 变化 | 基线位置（`main@e8a5bc6`） | 去哪一页看什么 | 幅度 |
|---|---|---|---|---|
| S1 | `text-slate-500` `#64748B` → `text-muted-foreground` `#6B7280`（17 处） | `app/timetable/page.tsx:36,71`、`components/timetable/compare-client.tsx:47,54,87`、`floating-planner.tsx:48,56,64,98`、`plan-header.tsx:57`、`planner-sidebar.tsx:191,201,210`、`section-list.tsx:19,38,39`、`week-grid.tsx:35` | `/timetable`：空态提示、周网格表头（`week-grid.tsx:35`）、左侧 plan 列表里每门课的英文名与「N courses」、每节课的教授名与时间。**这是最普遍的一条**，重点看有没有"灰变了、变得不像同一套灰" | 极小 |
| S2 | `bg-slate-100` `#F1F5F9` → `bg-muted` `#F3F4F6`（6 处，其中 1 处在注释里） | `components/banner.tsx:7`、`cs-banner.tsx:25`、`timetable-schedule-card.tsx:89`、`floating-planner.tsx:56`、`section-list.tsx:51`（+ `app/layout.tsx:71` 注释块） | 首页顶部那条**免责声明横幅**（`banner.tsx` 与 `cs-banner.tsx` 两条）；`/timetable` 里课表卡片的圆角小块与悬停底色 | 极小 |
| S3 | `border-gray-200` `#E5E7EB` → `border-border` `#E2E8F0`（2 处） | `app/catalog/page.tsx:27`、`components/navbar.tsx:11` | `/catalog` 每个学院卡的**边框**；**导航栏底边那条细线**（`navbar.tsx:11`，全站每页都在） | 极小 |
| S4 | `bg-zinc-200` `#E4E4E7` → `bg-surface-strong` `#E5E7EB`（4 处） | `app/page.tsx:34,50,85,102` | `/` 首页**四个 Card 里那四个按钮的底色**（Report Form / Community / Dev Group …） | 极小 |
| S5 | `bg-slate-50` `#F8FAFC` → `bg-surface-subtle` `#F9FAFB`（5 处；另 1 处 `bg-slate-50/40` 在 spec §5.5 单独列出，合计命中 6 处） | `planner-sidebar.tsx:188,198,217,237`、`share-dialog.tsx:97` | `/timetable` 左侧每个 plan 条的悬停底色、每个 plan 展开后的两行小按钮悬停底色；**分享弹窗里那个装 URL 的浅灰块** | 极小 |
| S6 | `text-blue-500` `#3B82F6` → `text-brand` `#2563EB`（15 处，绝大多数是 `hover:`） | `app/not-found.tsx:17`、`admin-entry.tsx:40`、`catalog-navigation.tsx:19,29,57,82`、`mobile-sidebar.tsx:37`、`navbar-list.tsx:32`、`comment-card.tsx:116,217-218,228-229,265` | **可见的有意统一**：(a) 桌面**导航栏每个菜单项 hover 时的蓝色**；(b) `/catalog` 里的学院/系导航项 hover 蓝；(c) 评论卡里**用户名**（`comment-card.tsx:116` 是常显的蓝）、**Reply / 展开按钮 hover 与激活态**；(d) 404 页的「back home」链接；(e) `/admin` 右上角入口 hover | **有意统一（可见）** |
| S7 | `text-gray-700/800`、`text-slate-700/800` → `text-foreground` `#111827`（13 处，另 1 处在注释里） | `app/admin/update/update-client.tsx:235`、`admin-comments-client.tsx:187`、`admin-course-notes-client.tsx:166`、`legal-content.tsx:23`、`app/catalog/[...departments]/page.tsx:66`、`app/not-found.tsx:14`、`comment-card.tsx:218,229,474,493,509`、`floating-planner.tsx:32` | **可见的有意统一**：(a) `/admin/update` 里的 task id、`/admin/comments` 与 `/admin/courses` 表格里的截断文本（原来是 gray-700）——**会明显变深**；(b) 法务页那条「中文/English」切换胶囊的文字；(c) 404 页里的页码路径；**(d) 评论卡里的 Reply 按钮未激活态、以及折叠徽章未选中态（原 gray-800）；(e) `/timetable` 右侧那个贴着屏幕边缘的浮动把手文字（原 slate-700）**。这一组在 spec 里就是"有意统一"，但要确认"变深"没有过头 | **有意统一（可见）** |
| S8 | `text-blue-800` `#1E40AF` → `text-brand-strong` `#1D4ED8`（3 处） | `components/legal-content.tsx:53`（`hover:text-blue-800`）、`review-header.tsx:64,73` | 法务页正文里链接的 **hover 色**；**`/reviews/...` 页面右上那两个 Button（如「写评论」）的文字色** | 极小 |
| S9 | `text-green-700` `#15803D` → `text-success` `#16A34A`（5 处） | `app/admin/update/update-client.tsx:26,211,267`、`admin-reports-client.tsx:171`、`compare-client.tsx:95` | `/admin/update`（「完成」徽章、「已完成 ✓」）、`/admin/reports` 的状态徽章、**`/compare/<token>` 页「No common free slot found.」文案** | 小幅提亮 |
| S10 | `text-amber-600/700/800` + `bg-amber-50/100`（admin 共 5 处）→ `--warning` 系 | `app/admin/update/update-client.tsx:211`、`admin-reports-client.tsx:169`、`comment-content.tsx:17` | `/admin/update` 的「待运行」提示、`/admin/reports` 的 pending 徽章、**评论正文里那个琥珀色小徽章**（`comment-content.tsx`，`/reviews/...` 可见） | 小幅 |
| S11 | `from-sky-600` → `from-wordmark-from`（`components/banner.tsx:18,21`，2 处） | `components/banner.tsx:18,21` | 首页顶部**免责声明横幅里「選咩課」三个字的渐变**与「我們的郵箱」链接的渐变。**可见的有意统一**：此前这处字标是 `sky-600` 起，而 navbar / footer / cs-banner 是 `sky-500` 起 —— 修完全站字标蓝一致 | 有意统一（可见） |
| S12 | `text-sky-600` / `border-sky-600` / `bg-sky-100` / `hover:bg-blue-200`（8 处）→ 品牌蓝系 | `components/review/comment-card.tsx:473,508` | `/reviews/<code>/<prof>` 的评论卡里**「折叠/展开」标记徽章**：浅色下由青蓝 `#0284C7` 变成品牌蓝 `#2563EB`，底色由 `sky-100` 变成 `bg-brand/10`。**可见的有意统一** | 有意统一（可见） |
| S13 | `text-green-800` / `text-green-900` → `text-success` `#16A34A`（2 处） | `components/timetable/compare-client.tsx:93,97` | `/compare/<token>` 页那张**「共同空闲（≥30 分钟）」绿卡的标题与格子里每个时段** | 小幅提亮 |

**逐条判定要回答的问题**：这 13 条落点是否都落在上表声明的幅度内？特别是 S6 / S7 / S11 / S12 这四条"有意统一（可见）"的，观感是否可接受？（这两组在现有代码里本就是同一语义的多个近似色阶。）**另外必须回答 R4 的兜底问题：上表之外，有没有任何肉眼可见的变化？** 若有，记下页面 + 元素 —— spec §5.7 声称它是完整清单，超出即为 spec 不准。

### 4.2 深色模式逐页走查

在导航栏下拉里点 `Dark`，重走：`/`、`/catalog`、`/catalog/FBA`、`/search/course/CISC`、`/course/CISC1001`、`/professor/LAM%20TENG`、`/reviews/CISC1001/LAM%20TENG`、`/timetable`、`/terms-of-service`、`/privacy-policy`、`/submit/<code>/<prof>`、`/admin`。

逐项回答（每条都锚定到具体文件和机器算出的数值，**不要凭"看着还行"就过**）：

1. **正文与次级文字对比度**：正文（`--foreground` `#F8FAFC`，19.12:1）应无问题。**重点看两档次级文字**：`text-muted-foreground`（`#94A3B8`，7.80:1，OK）与 `text-foreground-subtle`（`#5C6F8A`，**3.90:1** —— 见 §3.3）。具体看：评分卡上的「Grade / Easy / Outcome」小标签（`components/course/rating-stats-card.tsx`）、课表左侧课程列表的教授名与时间（`components/timetable/section-list.tsx:19,38,39`）、评论卡里最小的那行（`components/review/comment-card.tsx`）、举报按钮（`components/report-dialog.tsx:79`）、广告位占位文案（`components/ads/ad-slot.tsx:43`）、`/admin` 表格的次级文本。**问题：这些最浅的一档在深色下还算"可读"吗？**
2. **边框可见性**：`--border` `#1E293B` 在 `#020817` 上只有 **1.37:1**；`--border-subtle`（`217.2 32.6% 12%`）更弱。看 `/catalog` 学院卡边框（`app/catalog/page.tsx:27`）、导航栏底边（`components/navbar.tsx:12`，迁移后行号；基线为 `:11`）、`/timetable` 周网格竖线与横线（`week-grid.tsx:35` 的 `border-border` 与 `:44` 的 `border-border-subtle`）、课表卡片边框（`section-list.tsx`）、compare 页两张表的边框（`compare-client.tsx:78,82`）。**问题：1.37:1 的描边在深色下"看得见"吗？尤其 `--border-subtle` 那些。**
3. **Offered / Not Offered 徽章**：两处实现已核对 —— `from-success to-success`（`components/prof-card.tsx:10`、`components/course-card.tsx:18`）与 `from-neutral-700 to-stone-900`（**只在 `components/prof-card.tsx:52` 存活；`components/course-card.tsx:20` 那个 Not Offered 分支是被注释掉的，课程卡在未开设时根本不显示徽章 —— 这是既有行为，不是本次改动引入**）。去哪里看：`/professor/LAM%20TENG` 的 `ProfCourseCard`（同时有 Offered 与 Not Offered 两种），以及 `/course/<code>` 课程卡的 Offered 徽章。**问题：深色下 `from-success to-success`（`#16A34A`→`#16A34A`）绿徽章配白字是否够清楚？Not Offered 的深灰渐变与页面底色是否还能分辨？**
4. **评分卡**：`components/course/rating-stats-card.tsx`（`/professor/LAM%20TENG`、`/course/<code>` 的教授卡内）。**这里就是 §3.1 的高危点 —— 请专门看低分段（GPA < 2.3）的分数/等级数字**（`get_bg` 会给出 `from-rose-900 to-fuchsia-800`，深色对比度 2.09:1 / 2.43:1）。另外看正常分段的绿/琥珀字是否正常。
5. **骨架屏**：`components/loading-skeletons.tsx`。它有两处不同的东西：(a) **品牌渐变头部上的白色骨架条**（`bg-white/20|25|30`，第 69-81、97-120 行）—— 两种模式都成立，但深色下 `from-blue-600 to-indigo-500` 的头部本身没变，确认不刺眼；(b) `CatalogGridSkeleton` / `HomeStatisticsSkeleton` 里的 `Skeleton` 组件（`bg-muted` 系）。怎么看：开 Throttling / 关缓存后 hard reload `/catalog/FBA`、`/search/course/CISC`、`/reviews/CISC1001/LAM%20TENG`，或直接慢网。**问题：骨架条在深色下是否可见（不是白块、也不是黑到看不见）？**
6. **`report-dialog` / `share-dialog` 弹窗**：`components/report-dialog.tsx`（评论卡上的举报入口）与 `components/timetable/share-dialog.tsx`（课表页 header 的分享按钮）。两者都是 `components/ui/dialog.tsx:41` 的 `border bg-background` —— **在深色下等于页面底色**（见 §4.3）。`share-dialog.tsx:97` 的 URL 块是 `bg-surface-subtle`（`#0C1322`，对底色 1.08:1）。**问题：弹窗与页面、以及弹窗内部各块之间，是否靠边框/阴影分得开？模态遮罩（`bg-background/80 backdrop-blur`）在深色下是否还看得出"后面被压暗了"？**
7. **sonner toast**：`components/ui/sonner.tsx:15` 是 `bg-background text-foreground border-border shadow-lg`（同样是底色）。触发方式：`/timetable` 里把一门课加进 plan / 触发一条错误，或 `/admin` 任意写操作（`app/layout.tsx:97-107` 挂了两个 `Toaster`，第二个 id 是 `admin_notice`，`visibleToasts={1}`，且 `icons.error: null`）。**问题：toast 与它浮在下面的内容分得开吗？**
8. **admin 控制台无「深壳 + 白块」**：`/admin`、`/admin/courses`、`/admin/comments`、`/admin/notes`、`/admin/reports`、`/admin/admins`、`/admin/update`（需要登录）。这些页有表格（`bg-surface-subtle` 表头）、状态徽章（`bg-success/15` / `bg-warning/10` / `bg-destructive/10` / `bg-brand/10`）、以及 `bg-surface-strong` 的进度条槽（`app/admin/update/update-client.tsx:282`）。**问题：有没有哪一块还是浅色的（深壳白块）？**
9. **评论星标**：见 §4.4（单列）。

### 4.3 R17：卡片与浮层能否与页面底色区分（**必须明确回答**）

**机器已确认的事实**：编译产物 CSS 里 `.dark` 的 `--background`、`--card`、`--popover` **三者取值完全相同**（都是 `222.2 84% 4.9%` = `#020817`）。所以下列所有表面在深色下与页面底色**在数值上完全一致**，只能靠 `border`（1.37:1）和 `shadow` 区分：

| 表面 | 文件:行 | 用的 token |
|---|---|---|
| `app/page.tsx` 的四个 Card | `components/ui/card.tsx:20`（`bg-card ... shadow-sm`） | `--card` |
| 课程卡 / 教授卡 / 评论卡 | 同上（都走 `Card` 原语） | `--card` |
| `/catalog` 学院卡 | `app/catalog/page.tsx:27` | `--card`（+ `border-border`） |
| 课表右侧浮动面板（把手 + 面板） | `components/timetable/floating-planner.tsx:32,44` | `--background` + `border-border` + `shadow-2xl` |
| 移动端侧边栏 Sheet | `components/ui/sheet.tsx:34` | `--background` |
| 课表页移动端底部 Sheet | `components/timetable/floating-planner.tsx:90`（`bg-background`） | `--background` |
| compare 页两张表 | `components/timetable/compare-client.tsx:78,82` | `--background` + `border-border` |
| 主题切换下拉菜单 / popover / hover-card | `components/ui/dropdown-menu.tsx:50,68`、`popover.tsx:22`、`hover-card.tsx:21` | `--popover` |
| dialog（report / share） | `components/ui/dialog.tsx:41,65` | `--background` |
| sonner toast | `components/ui/sonner.tsx:15` | `--background` |

**请注意：范围比任务书描述的更宽。** 任务书说的是"卡片与浮层"，实测**整个浮层家族**（dropdown / popover / hover-card / dialog / sheet / toast）在深色下都与页面底色同值，不只是卡片。极端情况下"打开主题下拉菜单"这件事本身就看不出菜单边界。

**要回答的问题**：深色下，把鼠标移开（没有阴影交互时）——
1. 首页四个 Card 的边界清楚吗？
2. `/catalog` 每个学院卡的边界清楚吗？
3. `/timetable` 点右边那个浮动把手展开的面板，与它覆盖的内容分得开吗？（它 `right-4` 悬浮在内容上，且有 `shadow-2xl`）
4. compare 页两张表、`/reviews/...` 评论卡是否"糊成一片"？
5. 主题下拉菜单展开时，菜单区域是否可辨？
6. 移动端侧边栏（`md:hidden`，≤768px）拉出来时，那条 Sheet 与页面是否分得开？课表页在窄屏下的底部 Sheet（`components/timetable/floating-planner.tsx:90`）呢？

**若结论是"不可区分"，需要一次后续设计改动。** 关于改法，我提供一个机器算出的**数值提醒**（这是测量，不是结论）：任务书建议把这些表面改到 `--surface-subtle`，而 `.dark` 的 `--surface-subtle` = `222.2 47.4% 9%` = `#0C1322`，相对 `#020817` 只有 **1.08:1** 的亮度对比 —— 比现在的 1.00:1 几乎不更分得开。同一色系里分离度更大的是 `--surface-strong`（`#293851`，**1.69:1**）。因此"后续设计改动"若要真正解决可辨性，**要么给 `.dark` 的 `--card` / `--popover` 单独取一个有足够分离度的值，要么用 `--surface-strong` 量级的取值 —— 单纯指向 `--surface-subtle` 大概达不到目的**。最终取哪个值应由设计决定，我不替它定。

### 4.4 `components/review/comment-card.tsx` 星标内联色

见 §3.2 的原文与解释（`comment-card.tsx:543-548`，含 `inactiveFillColor: 'white'` / `activeFillColor: 'white'` / `inactiveBoxColor: '#C7C7C7'`）。

去哪看：`/reviews/CISC1001/LAM%20TENG`（或任意 `/reviews/<code>/<prof>`），每条评论卡左上角那颗 5 星（`Rating`，`style={{ width: 100 }}`，`halfFillMode="box"`，`readOnly`）。也顺带看 `/submit/<code>/<prof>` 里有没有同款（提交表单的评分输入）。

要回答的问题：**深色下未选中的星，`#C7C7C7` 方框 + 白色星形，观感是否可接受？** 是否会"未选中的星比选中的星还显眼"（因为 `#C7C7C7` 灰比品牌色 `#19a974` 等更亮）？如果不可接受，这需要一次后续改动（把内联色换成从 CSS 变量读的 `hsl(var(--...))`，或给 `itemStyles` 加深色分支）—— 但这已超出本轮范围。

### 4.5 移动端侧边栏的 `px-4 pt-6`

`components/mobile-sidebar.tsx:31` 是 `<div className="px-4 pt-6">`，嵌在 `SheetContent` 里，而 `SheetContent` 自带 `p-6`（`components/ui/sheet.tsx:34`）。合计内缩：水平 24+16 = **40px**，顶部 24+24 = **48px**。

一个需要说清的细节：紧跟着的菜单块 `className="font-bold flex flex-col p-4 mt-4 ..."` 也嵌在同一个 `SheetContent` 里，它的水平内缩同样是 24+16 = 40px —— **所以 Theme 区和菜单区在水平方向是对齐的**，`px-4` 只是让它们一致地"多缩了一层"，并不是"两块没对齐"。真正会显得怪的是：整块内容的水平内缩是 40px 而不是 SheetContent 名义上的 24px，顶部是 48px。

要回答的问题：≤768px 宽下把侧边栏拉出来，**顶部 Theme 三选项（Light / Dark / System，「Theme」大写小标题）这一块是否显得过于内缩 / 与 Sheet 的关闭按钮（`absolute right-4 top-4`）挤在一起？** 如果觉得过头，就是把 `px-4 pt-6` 收掉或改小。

### 4.6 切换与持久化行为 / 无闪烁 / 无 hydration 告警

1. **持久化**：点 `Dark` → 刷新（普通 reload）→ 仍是深色。同时看 DevTools → Application → Local Storage：key 应为 **`umeh-theme`**，值为 `dark`（`components/providers/theme-provider.tsx:13`）。再切 `Light` → 刷新 → 浅色；`localStorage` 值为 `light`。
2. **System 跟随**：点 `System` → 改操作系统外观（macOS 外观切换，或 DevTools → Rendering → Emulate CSS `prefers-color-scheme`）→ **应立即跟随，无需刷新**。`localStorage` 值应为 `system`。
3. **首次访问默认**：清掉 `localStorage` 后刷新 → 应为**浅色**（`defaultTheme="light"`）。注入脚本的 `else{c.add('light')}` 分支就是这条路径（§2.4 已见）。
4. **首屏无闪烁**：DevTools → Network 勾 `Disable cache` + Performance 面板把 **CPU throttling 调到 6×** → 在深色模式下 hard reload（Cmd+Shift+R）。`<html class="dark">` 必须在**首次绘制前**就位：不得出现"先白一下再变黑"。用 Performance 录制看首帧，或截图逐帧看。**切到 System + 系统为深色时也应同样不闪。**
5. **无 hydration 告警**：Console 全程开着，覆盖这几种操作 —— 切 Dark/Light/System、普通刷新、hard reload、客户端路由往返（`/` → `/course/CISC1001` → 浏览器返回）。**不得出现 "Hydration failed" / "Text content does not match" / "Prop `className` did not match" / Minified React error #418 / #422 之类。**（注意：本项目历史上出过 `Minified React error #418 / #422`，见本目录 `2026-10-02-masonry-ads.md` 的"部署后事故与修复"一节，所以这条要认真看；`components/theme-toggle.tsx` 的挂载守卫正是为了避免同类问题。）
6. **移动端宽度（≤768px）**：打开侧边栏，顶部三个选项可用、点得动、选中态正确（`aria-checked`）。
7. **`theme-color`**：切到深色后检查 `<head>` 里那枚 `<meta name="theme-color">` 是否被改成 `#020817`（SSR 输出的是静态 `#FFFFFF`，见 §2.3；`components/theme-color-meta.tsx` 负责改写）。iOS Safari / Android Chrome 加到主屏后状态栏颜色是否跟着变。

### 4.7 已知限制（本轮不修，看到属预期）

以下在深色下仍是浅色的，**看到不要报为回归**：

- **Clerk 组件**（`/sign-in`、`/sign-up`、导航栏头像下拉、`SignInButton` 的 modal）在深色下是白色卡片 —— `@clerk/nextjs` 用自己的主题。
- **AdSense 广告位**是白块（`components/ads/ad-slot.tsx`；本地 `.env.local` 有 GTM，按设计不自注入 loader，所以本地可能看不到实际广告，只看到占位）。
- **fancybox 灯箱**（`@fancyapps/ui`）保持它自己的深色/浅色外观。
- **PWA 安装外壳色仍是浅色**：`app/manifest.ts` 未改 —— 里面写死 `background_color: '#fff'` 与 `theme_color: '#fff'`，没有深色变体。
- **图片未重新出图**：favicon（`/favicon.png`）、`public/icon/*.jpg`（`app/manifest.ts` 里 8 个尺寸全部引用）、`banner.jpg`、home 的 hero 图都还是浅色底那一版。
- `/catalog/<不存在>` 与任意 404 页用 `from-teal-400 via-violet-400 to-blue-500` 的大标题（`app/not-found.tsx:10`、`app/catalog/[...departments]/page.tsx:62`），这是刻意的高亮装饰，两种模式都成立（spec §5.6 放行）。

## 5. 本文件**不**证明什么

明确列出，防止被误引用：

1. **不证明深色模式下任何东西的观感。** 服务端 HTML 永远是浅色（`<html lang="zh-Hant">`，无 `class="dark"`），深色类渲染在服务端无法产生，我没有尝试伪造它。§2 的全部证据都是**浅色**服务端输出的属性级断言。
2. **不证明浅色模式与改动前"视觉上一致"。** 我核对的是 token 取值等于 spec 声称的目标 hex（§2.6），不是像素。S1–S13 的实际观感、以及"清单外有没有可见位移"（R4 兜底）都没有被验证。
3. **不证明"不闪屏"。** §2.4 只证明那段防闪脚本**存在于响应中且位于 `<body>` 第一个位置**；它到首绘之间的实际时序、以及 CPU 节流下的表现，需要真实浏览器。
4. **不证明"无 hydration 告警"。** 需要真实浏览器 Console。防 hydration mismatch 的挂载守卫（`components/theme-toggle.tsx:36-38,73-77`）只被单元测试覆盖，运行期未验证。
5. **不证明弹窗、toast、下拉菜单、Sheet 深色下正常。** 这些表面由 Radix / vaul / sonner 在客户端 portal 渲染，**根本不出现在 SSR HTML 里**，所以 §2 的 grep 对它们零覆盖。
6. **不证明 `/admin` 与 `/compare/<token>` 两条路由的任何事。** 前者需要 Clerk 登录，后者需要一个真实分享 token；我在机器证据里没有覆盖它们（§2.2 已如实标注）。
7. **不证明 §3 那三条风险已被修复。** 它们是**新发现**（守卫盲区 `get_bg`、星标内联色、`--subtle-foreground` 3.90:1），本轮只报告不修改。
8. **不证明可访问性合规（WCAG）。** 本文出现的对比度数字都是按相对亮度公式算的**亮度比**，用于指出具体位置；没有做完整的无障碍审计（焦点环、语义、键盘操作、屏幕阅读器）。

## 6. 后续待办

- [ ] **§4 的人工清单全部未执行** —— 需要一位能用浏览器的人跑完，尤其 §4.3（R17）与 §4.1 的 S6/S7/S11/S12。
- [ ] **决定 §3.1（`lib/utils.ts` 的 `get_bg`）怎么处理**：把 `lib/` 纳入守卫扫描范围（`tests/no-light-only-colors.test.ts:5` 的 `ROOTS`）→ 再决定是迁移还是显式放行；深色下低分段等级色 2.09:1 是可预测的缺陷。
- [ ] **决定 §3.2（星标内联色）与 §3.3（`--subtle-foreground` 3.90:1）是否本轮修**。
- [ ] **R17 的结论出来后再定表面色改法**（注意 §4.3 里关于 `--surface-subtle` 只有 1.08:1 的数值提醒）。
- [ ] 部署时的 `manifest.ts` 外壳色与图片资源（favicon / icon / banner / hero）另开一轮。

## 附：本次采集用的命令与临时产物

```bash
# 四道门
npm test 2>&1 | tail -8
npm run lint
npx tsc --noEmit
npm run build 2>&1 | tail -12

# 服务端渲染证据（webpack，非 Turbopack；带 --noproxy 绕开本机 http_proxy）
npx next dev -p 3050 > /tmp/t17-dev3.log 2>&1 &
curl -s --noproxy '*' -o /tmp/t17-ssr3/<name>.html -w '%{http_code}' http://localhost:3050<ROUTE>

# 编译产物 CSS
curl -s --noproxy '*' -o /tmp/t17-ssr/layout.css \
  "http://localhost:3050/_next/static/css/app/layout.css?v=1790955853770"

# 收尾
pkill -f "next dev"
```

**dev server 已在采集结束后关闭，并确认过**：

```
$ pkill -f "next dev"
$ pgrep -fl "next dev"
(无输出)
$ lsof -nP -iTCP:3050 -sTCP:LISTEN
(无输出)
$ curl -s -m 3 --noproxy '*' -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3050/
000        # curl exit 7 = connection refused
```

抓取到的 HTML 与 CSS 落在 `/tmp/t17-ssr*/`（临时目录，非仓库产物），`npm run build` 的输出写在 `wt-t17/.next/`。
