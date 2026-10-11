# next-web「动物岛」皮肤适配设计

> 状态：Draft，等待人工 review
> 日期：2026-10-11
> 前置：`animal-island-ui@2.2.1`（39 个组件、`--animal-*` 令牌、无深色模式）与 `naive-icons`（163 枚手绘图标，`animal-island-ui` 的硬规则要求图标走它）；next-web 现有的深色模式（`docs/superpowers/specs/2026-10-02-next-web-dark-mode-design.md`：语义 token + `next-themes` class 模式，`storageKey="umeh-theme"`）
> 后续计划：review 通过后，用 `writing-plans` 生成实施计划

---

## 1. 背景

### 1.1 现状

- 颜色已收敛为 shadcn 风格的 HSL 语义 token（`app/globals.css` 的 `:root` / `.dark`，共 44 个颜色变量，另有 `--radius`），组件只写语义类名。**这是本方案能做成"皮肤"的前提**：换一套 token 值就能整站换色，不需要改页面。
- 圆角由单一变量 `--radius: 0.5rem` 派生（`tailwind.config.js` 的 `rounded-lg/md/sm`）。`components/ui/*` 里按钮、输入框、卡片、弹层、菜单项共用这三档，**无法分别控制**"按钮要胶囊、卡片要 18px"。
- 通知用 `sonner`：14 个文件 import `toast`，其中 7 个是公开页，6 个是 admin，另有 `components/ui/sonner.tsx` 的 `<Toaster>`。用到的 API 只有 `toast.success / error / info / promise`（共 33 + 18 + 3 + 2 次）。
- 页面经 ISR（课程页 `revalidate = 3600`）与 Cloudflare/OpenNext 缓存，**服务端产物对所有用户必须一致**。

### 1.2 animal-island-ui 的特点（影响设计的部分）

| 事实 | 影响 |
|---|---|
| 39 个组件、CSS 126 KB（gzip 约 23.8 KB），类名是 hash 的 CSS Module | 不能"覆盖类名"来改它；也不应进首屏 |
| 样式表里只有 `*`、`:root` 两类全局选择器，其余全是 `.animal-*` | 懒加载后对站内现有页面无副作用 |
| 没有深色模式 | 深色版必须自己设计（§5） |
| 自带 Noto Sans SC，简体中文字体文件每个约 1.1 MB（共 3 档） | 必须覆盖 `--animal-font-family`，保证站内不会触发下载（§8） |
| `Cursor` 的实现只是在容器上加 class：`animal-cursor` / `animal-cursor--force`（这两个是**未 hash 的全局 class**） | 不必包一层组件，给 `<body>` 加 class 即可 |
| `Notification` 是命令式 API，支持 `key` 原地更新 | 可以承接 `toast.promise` |
| `Modal` 用 SVG `clipPath`（`objectBoundingBox`）裁出"水滴"外形，内层 padding `40px 35px 25px` | 我们的 Radix `Dialog` 可以复用同一条 path（§6.3） |
| 自身调色板有多处对比度不达标（薄荷 `#19c8b9` 上放白字、`#9f927d` 次要文字等） | 重新设计了无障碍的 token 值（§5） |

## 2. 目标与非目标

### 2.1 目标

- **G1**：用户可在页面上切换「默认」与「动物岛」两套皮肤，选择持久化（`localStorage`，key `umeh-skin`），跨标签页同步。
- **G2**：皮肤与深色模式**正交**：`light/dark × default/island` 四种组合都可用且都过对比度检查。动物岛自带可可色深色版。
- **G3**：**默认皮肤零视觉变化**：不选动物岛的用户，所有 token、圆角、阴影与改动前逐值相同（由测试断言，§10 T6）。
- **G4**：公开页全覆盖：首页、课程页、搜索、提交、课表、登录页壳、导航、页脚。admin 不适配（§3 D3）。
- **G5**：不改 SSR 产物，不影响 ISR / Cloudflare 缓存（§4.4）。
- **G6**：不使用动物岛的用户不为它付出成本：库 CSS、库组件、Nunito 字体文件都不在默认皮肤的网络请求里（§4.3、§8）。
- **G7**：无首屏闪烁（FOUC）：已选动物岛的用户，首次绘制前 `data-skin` 已就位（§4.2）。
- **G8**：Radix 原语的行为与无障碍不变（焦点管理、键盘、ARIA 全部沿用），只换外观。
- **G9**：WCAG 对比度：正文 ≥ 4.5:1；大字/次要层与焦点环 ≥ 3:1，由测试逐对断言。
- **G10**：`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 四个门全绿。
- **G11**：产出 spec / plan / verification 三份文档。

### 2.2 非目标

- **N1**：不换掉站内的 Radix `Dialog / Select / Popover / DropdownMenu / Tooltip / Sheet`（不用库的同名组件替代）。原因：8 处 `Dialog` 调用点是组合式 API，换成库的属性式 `Modal` 会丢失 Radix 的焦点陷阱、`aria-*` 与 portal 行为。
- **N2**：不适配 `/admin/**`：该区域**始终**用默认皮肤（§4.5）。
- **N3**：不做动物岛的背景图/场景插画铺满页面；只做一层淡的装饰背景（§7.4），且仅浅色。
- **N4**：不改品牌 logo（猫图标颜色仍由 `--brand-logo` 驱动，对齐 iOS 的约定不动）。
- **N5**：不改 Clerk 组件外观、AdSense、fancyapps 灯箱（沿用深色模式 spec 的已知限制）。
- **N6**：不引入第二个 `next-themes` Provider，不改 `ThemeProvider` 的配置。
- **N7**：不改任何 API、数据库、iOS 端。
- **N8**：不做第三套及更多皮肤；皮肤注册表只有两项，不预留"插件式皮肤"抽象。
- **N9**：不替换页面里现有的 lucide 图标（除 §7.5 列出的两处）。

## 3. 决策记录（人工已确认）

| # | 决策点 | 结论 | 理由 |
|---|---|---|---|
| D1 | 实现机制 | **CSS 皮肤 + 交互层换真组件**（三层，见 §4.1） | 内容区靠 token 换肤，不改 SSR；只有"通知 / 光标 / 回到顶部 / 背景"这类本来就是客户端行为的东西才用库的真组件 |
| D2 | 与深色模式的关系 | **独立双轴**，动物岛自带深色版 | 两个开关互不干扰，用户已有的主题选择保持有效 |
| D3 | 范围 | **全站公开页 + 装饰，admin 不适配** | admin 是低频的内部工具，且数据密集，不适合手绘风 |
| D4 | 加载策略 | **自有皮肤层常驻（约 4 KB），库 CSS / 组件按需加载** | 皮肤的 token 与圆角必须在 SSR 内容出现时就生效，避免闪烁；库本身 126 KB 不该进首屏 |
| D5 | 默认皮肤 | `default`（现状）；不跟随系统、不做自动切换 | 对已上线站点与 SEO 零风险 |
| D6 | 皮肤状态 | 自建 `lib/skin.ts` 外部 store，用 `useSyncExternalStore` | 比再套一个 `next-themes` 更轻；`next-themes` 的 class 机制只有一个轴 |
| D7 | Dialog | 保留 Radix，用 CSS 的 `clip-path: url(#island-modal-clip)` 复刻水滴外形 | 保留行为，外形与库的 `Modal` 一致 |
| D8 | 图标 | 切换入口用 `naive-icons` 的 `TreeIcon`（两种皮肤下都用）；主题切换按钮在动物岛下换成 `SunIcon / MoonIcon` | 库硬规则要求图标走 `naive-icons`；其余 lucide 不动（N9） |

## 4. 架构

### 4.1 三层

```text
层 1：token 皮肤（CSS，SSR 内容用）
  app/skins/island.css   常驻，约 4 KB
    html[data-skin="island"]          { 浅色 token + 圆角/阴影/字体 token }
    html[data-skin="island"].dark     { 深色 token }
    Radix 原语的外观覆盖（选择器作用域都在 html[data-skin="island"] 下）

层 2：Radix 原语换外观（仍是 CSS，行为不变）
  components/ui/* 用新增的语义圆角类（rounded-control/float/card/item）和 .btn-depth / .skin-modal
  → 默认皮肤下这些类解析成与原来逐值相同的值；动物岛下解析成胶囊 / 18px / 水滴

层 3：库的真组件（仅客户端，仅动物岛，按需加载）
  <IslandLayer />   components/island-layer.tsx
    - 动态 import('animal-island-ui/style') 与 'animal-island-ui'
    - <Cursor> 的效果：给 <body> 加 animal-cursor animal-cursor--force
    - <BackTop />、浅色下的 <Background type="default" />
    - Notification 由 lib/notify.ts 门面调用
```

### 4.2 数据流

```text
lib/skin.ts（外部 store）
  ├─ 读：localStorage['umeh-skin'] ∈ {'default','island'}，非法值/异常 → 'default'
  ├─ 写：setSkin(s) → 写 localStorage + 通知订阅者；写失败（存储不可用）时把选择留在内存，本次会话内仍生效，刷新后回到 'default'
  ├─ 同步：监听 window 'storage' 事件（跨标签页）
  └─ 服务端快照恒为 'default'

app/layout.tsx 的 <head> 内联阻塞脚本（在首次绘制前执行）：
  try { if (localStorage.getItem('umeh-skin') === 'island' && !location.pathname.startsWith('/admin'))
          document.documentElement.setAttribute('data-skin', 'island') } catch (e) {}

<SkinController />（'use client'，挂在 ThemeProvider 内）：
  const effective = useEffectiveSkin()   // = effectiveSkin(usePathname(), useSkin())
  useEffect → <html data-skin> 设为 effective（'default' 时移除属性）
  同一个 hook 由 ThemeColorMeta 与 IslandLayer 复用
  → 客户端软导航进出 /admin 时同步切换；首次加载由内联脚本负责

主题（next-themes）不变：仍然只管 <html class="dark">。
```

`<html>` 已有 `suppressHydrationWarning`，内联脚本改它的属性不会触发 hydration 警告。

### 4.3 库的按需加载

`IslandLayer` 只在 `effective === 'island'` 时才发起 import：

```tsx
useEffect(() => {
  if (effective !== 'island') return
  let cancelled = false
  Promise.all([import('animal-island-ui/style'), import('animal-island-ui')]).then(([, lib]) => {
    if (!cancelled) setLib(lib)
  })
  return () => { cancelled = true }
}, [effective])
```

- **库 CSS 在首次绘制之后才到**。这是有意的取舍（D4）：已选动物岛的用户首屏用的是我们自己的 token 层（已完整），库 CSS 只影响层 3 的那几个组件（它们本来就是挂载后才出现的）。
- 库 CSS 一旦加载就留在页面里（样式表不能卸载）；它只有 `.animal-*` 选择器与 `*`、`:root` 两类全局规则，切回默认皮肤后不产生副作用（`*{box-sizing:border-box}` 与 Tailwind preflight 一致；`:root` 里只有 `--animal-*`）。
- 切回默认皮肤时：`IslandLayer` 卸载 `BackTop` / `Background`，移除 `<body>` 上的 cursor class，调用 `Notification.destroy()`。

### 4.4 缓存与 SSR 语义

- 皮肤不进入服务端渲染产物：SSR 永远输出默认皮肤；`data-skin` 只由客户端脚本写入。HTML 对所有用户一致，ISR 与 Cloudflare 缓存不变。
- 皮肤相关的客户端组件，首次渲染一律用服务端快照（`'default'`），挂载后再用真实值（`useSyncExternalStore` 的 `getServerSnapshot` 保证这一点），避免 hydration mismatch。
- `app/skins/island.css` 在 `app/layout.tsx` 里 `import`，进入常驻 CSS。

### 4.5 admin 排除

`effectiveSkin(pathname, chosen)` 是纯函数：`pathname` 以 `/admin` 开头恒为 `'default'`。内联脚本与 `SkinController` 使用同一规则（脚本里是同一个前缀判断）。admin 页因此得不到 `data-skin`，所有皮肤 CSS 都不命中。

## 5. Token 值

选择器约定：浅色 `html[data-skin="island"]`（特异性 0,1,1，高于 `:root`）；深色 `html[data-skin="island"].dark`（0,2,1，高于前者与 `.dark`）。两者都不依赖加载顺序。

所有值都是 HSL 三元组（与 `globals.css` 同格式），括号内是对应的 hex，仅供对照。

### 5.1 浅色（暖羊皮纸 + 薄荷）

| token | 值 | hex |
|---|---|---|
| `--background` | `60 36.4% 95.7%` | `#f8f8f0` |
| `--foreground` / `--card-foreground` / `--popover-foreground` | `29.3 51.2% 31.4%` | `#794f27` |
| `--card` / `--popover` | `45 100% 98.4%` | `#fffdf7` |
| `--primary` | `174.9 77.8% 44.1%` | `#19c8b9` |
| `--primary-foreground` | `30.9 42.2% 16.3%` | `#3b2a18` |
| `--secondary` / `--muted` | `40 44.4% 89.4%` | `#f0e8d8` |
| `--secondary-foreground` / `--accent-foreground` | `29.3 51.2% 31.4%` | `#794f27` |
| `--muted-foreground` | `33.2 21.6% 34.5%` | `#6b5a45` |
| `--accent` | `40 28.1% 87.5%` | `#e8e2d6` |
| `--destructive` | `0 55.2% 52.7%` | `#c94444` |
| `--destructive-foreground` | `45 100% 98.4%` | `#fffdf7` |
| `--destructive-strong` | `3.2 71.3% 41%` | `#b3261e` |
| `--border` / `--input` | `38.2 13.6% 84.1%` | `#dcd8d1` |
| `--ring` | `174.5 81.8% 23.7%` | `#0b6e65` |
| `--surface-subtle` | `45 42.1% 92.5%` | `#f4f0e4` |
| `--surface-strong` | `42.9 34.1% 83.9%` | `#e4dcc8` |
| `--subtle-foreground` | `36.6 16.7% 48%` | `#8f7f66` |
| `--border-subtle` | `40 28.1% 87.5%` | `#e8e2d6` |
| `--border-strong` | `29 18% 68.4%` | `#bdaea0` |
| `--brand` / `--brand-logo` | `174.5 81.8% 23.7%` | `#0b6e65` |
| `--brand-strong` | `175.3 82.6% 18%` | `#08544e` |
| `--brand-foreground` / `--success-foreground` | `45 100% 98.4%` | `#fffdf7` |
| `--brand-from` / `--brand-to` | `174.7 81.8% 21.6%` / `174.2 79.2% 28.2%` | `#0a645c` / `#0f8176` |
| `--wordmark-from` / `--wordmark-to` | `174.5 81.8% 23.7%` / `29.3 51.2% 31.4%` | `#0b6e65` / `#794f27` |
| `--success` | `88.1 78.3% 23.5%` | `#3f6b0d` |
| `--warning` | `39.1 100% 27.1%` | `#8a5a00` |
| `--grade-none-from` / `-to` | `36.6 16.7% 48%` / `33.2 21.6% 34.5%` | `#8f7f66` / `#6b5a45` |
| `--grade-low-from` / `-to` | `3.2 71.3% 41%` / `320.4 49.2% 36.3%` | `#b3261e` / `#8a2f6b` |
| `--grade-mid-from` / `-to` | `39.7 100% 29%` / `21.3 81.4% 38%` | `#946200` / `#b04a12` |
| `--grade-high-from` / `-to` | `88.1 78.3% 23.5%` / `174.5 81.8% 23.7%` | `#3f6b0d` / `#0b6e65` |

### 5.2 深色（可可色 + 亮薄荷）

| token | 值 | hex |
|---|---|---|
| `--background` | `28.4 28.4% 13.1%` | `#2b2118` |
| `--foreground` / `--card-foreground` / `--popover-foreground` / `--secondary-foreground` / `--accent-foreground` | `41.8 57.9% 88.8%` | `#f3e9d2` |
| `--card` / `--popover` | `30 26.2% 16.5%` | `#352a1f` |
| `--primary` / `--ring` / `--brand` / `--brand-logo` / `--wordmark-from` / `--grade-high-to` | `174.4 63.7% 53.5%` | `#3dd4c6` |
| `--primary-foreground` / `--brand-foreground` / `--success-foreground` | `28.4 28.4% 13.1%` | `#2b2118` |
| `--secondary` / `--muted` | `31.2 22.9% 21.4%` | `#43372a` |
| `--muted-foreground` / `--grade-none-from` | `38.2 23.7% 63.5%` | `#b8a88c` |
| `--accent` / `--surface-strong` | `32.1 23.3% 23.5%` | `#4a3d2e` |
| `--destructive` | `0 55.2% 52.7%` | `#c94444` |
| `--destructive-foreground` | `45 100% 98.4%` | `#fffdf7` |
| `--destructive-strong` / `--grade-low-from` | `4.8 81.2% 72.9%` | `#f28b82` |
| `--border` / `--input` | `34 23.4% 25.1%` | `#4f4231` |
| `--surface-subtle` | `28.6 27.3% 15.1%` | `#31261c` |
| `--subtle-foreground` / `--grade-none-to` | `37.1 17.2% 52.2%` | `#9a8a70` |
| `--border-subtle` | `31.3 24.7% 18.2%` | `#3a2f23` |
| `--border-strong` | `36.9 23.6% 32.4%` | `#66573f` |
| `--brand-strong` | `173.6 67.3% 70%` | `#7fe6db` |
| `--brand-from` / `--brand-to` | `174 80% 19.6%` / `175.3 77.4% 26.1%` | `#0a5a52` / `#0f766e` |
| `--wordmark-to` | `39.2 83.4% 71.6%` | `#f3c97a` |
| `--success` / `--grade-high-from` | `93.9 58.7% 59.2%` | `#8fd45a` |
| `--warning` / `--grade-mid-from` | `46.2 91.6% 53.5%` | `#f5c31c` |
| `--grade-low-to` | `322.3 58.1% 71%` | `#e08ac0` |
| `--grade-mid-to` | `31.8 90.2% 59.8%` | `#f59e3c` |

> 5.1 与 5.2 合起来覆盖 `:root` 的全部 44 个颜色变量（`--radius` 除外，见 §6.1），T1 断言这一点。

### 5.3 对比度策略与已知取舍

- 文字 ≥ 4.5:1；`--subtle-foreground`、`--grade-*`、`--ring`、`--brand-logo` ≥ 3:1。
- **薄荷 `#19c8b9` 只作填充**，上面放深棕 `#3b2a18`（>6:1）。文字级的品牌色用深青 `#0b6e65`（在 `#f8f8f0` 上 5.4:1）。库自带的"薄荷 + 白字"不用。
- 危险色填充用 `#c94444`（库的 `error-active`）配奶油白 `#fffdf7`，4.7:1。最初的 `#e05a5a` 只有 3.78:1，已弃。
- 3D 按钮的"深度阴影"色（§6.2）属于装饰边缘，按钮的可辨识度由里面的文字承担，不在对比度断言范围；但 T1 仍记录其值。
- 阴影：浅色 `#50b9ab`（`172 42.9% 52%`），深色 `#1f8f84`（`174.1 64.4% 34.1%`），存为 `--button-depth`。

## 6. 层 1 / 层 2 的细节

### 6.1 新增的结构 token

默认值写在 `globals.css` 的 `:root`（与现状逐值相同）；动物岛的值与 `--shadow-button`、`--button-depth` 只写在 `island.css`。

| 变量 | 默认值 | 等价于 | 动物岛值 |
|---|---|---|---|
| `--radius-control` | `calc(var(--radius) - 2px)` | 原 `rounded-md` = 6px | `50px`（胶囊） |
| `--radius-float` | `calc(var(--radius) - 2px)` | 原 `rounded-md` = 6px | `16px` |
| `--radius-card` | `var(--radius)` | 原 `rounded-lg` = 8px | `18px` |
| `--radius-item` | `calc(var(--radius) - 4px)` | 原 `rounded-sm` = 4px | `12px` |
| `--shadow-button` | `0 0 #0000` | 无阴影（不能写 `none`：Tailwind 的 `shadow-*` 把 `ringOffset, ring, var(--tw-shadow)` 合成一条 `box-shadow`，`none` 会让整条声明失效，焦点环随之消失） | `0 4px 0 0 hsl(var(--button-depth))` |
| `--button-depth` | 不定义（仅 `island.css`） | — | §5.3 |

`tailwind.config.js`：

- `borderRadius.control / float / card / item` → `var(--radius-…)`；
- `boxShadow.button` → `var(--shadow-button)`。

### 6.2 `components/ui/*` 的类名替换（逐值保持）

| 文件 | 现在 | 改成 |
|---|---|---|
| `button.tsx` | `rounded-md` | `rounded-control`；`default` 与 `destructive` 两个 variant 追加 `shadow-button btn-depth` |
| `input.tsx`、`select.tsx` 的触发器 | `rounded-md` | `rounded-control` |
| `textarea.tsx` | `rounded-md` | `rounded-float`（textarea 不做胶囊） |
| `popover.tsx`、`hover-card.tsx`、`tooltip.tsx`、`dropdown-menu.tsx` 与 `select.tsx` 的内容面板 | `rounded-md` | `rounded-float` |
| `card.tsx` | `rounded-lg` | `rounded-card` |
| `dialog.tsx` 的内容 | `rounded-lg` | `rounded-card skin-modal` |
| `dialog.tsx` / `sheet.tsx` 的关闭按钮、菜单项、选项 | `rounded-sm` | `rounded-item` |
| `badge.tsx`、`switch.tsx` | `rounded-full` | 不变 |

`.btn-depth`（动物岛下才有定义）：按下时 `transform: translateY(3px)` 且 `box-shadow` 缩成 `0 1px 0 0 …`，`transition` 用 `var(--animal-motion-duration-fast)`。`secondary / outline / ghost / link` 变体没有深度阴影（对应库的规则"3D 阴影只属于 primary / danger 按钮"）。

### 6.3 Dialog 水滴

- `components/skin-defs.tsx`：服务端组件，渲染一个 `width=0 height=0 aria-hidden` 的 `<svg>`，内含 `<clipPath id="island-modal-clip" clipPathUnits="objectBoundingBox">`，path 与库 `Modal` 的 `animal-modal-clip` 完全相同（0.501,0.005 起笔的那条）。放在 `app/layout.tsx` 的 `<body>` 里。默认皮肤下它只是一个不可见的 SVG（约 1.5 KB），属于已接受的开销。
- `html[data-skin="island"] .skin-modal`：`clip-path: url(#island-modal-clip)`；`padding: 40px 35px 32px`；`border: 0`；`border-radius: 24px`（兜底——clip-path 引用失效时仍是圆角矩形）；背景用 `--card`。
- `clip-path` 会连带裁掉 `box-shadow`，所以水滴弹窗 `box-shadow: none`；层次由现有遮罩 `bg-background/80 backdrop-blur-sm` 承担（它随 token 自动变暖，不引入依赖库 CSS 的 `--animal-mask-bg`）。
- 关闭按钮在动物岛下移到 `right: 28px; top: 24px`，避开水滴的右上角收窄区；钩子类名为 `skin-close`（不叫 `skin-modal-close`，以免与 `skin-modal` 的计数断言冲突）。

### 6.4 其他外观覆盖（全部限定在 `html[data-skin="island"]` 下）

- **字体**：`body { font-family: var(--font-nunito), "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif }`（特异性 0,1,2，高于 `next/font` 的 class），详见 §8。
- **焦点环**：沿用 `focus-visible:ring-ring`，颜色是深青（浅色）/ 亮薄荷（深色），对比度 ≥ 3:1。**不使用冷蓝**（库的硬规则）。输入框聚焦时 `ring` 保留，不另加黄色以免两种皮肤的无障碍语义分叉。
- **选中态 / 悬停**：`accent` 已是暖米色，无需额外规则。
- **滚动条与 `color-scheme`**：沿用 `:root` / `.dark` 的 `color-scheme`。
- **动效**：`transition-timing-function: var(--animal-motion-ease)` 只用在上面列出的新增规则上，不覆盖全站过渡。

## 7. 层 3 与切换入口

### 7.1 切换入口

- `components/skin-switcher.tsx`（`'use client'`）：
  - `SkinSwitcher`：桌面端放在导航栏 `ThemeToggle` 旁边，复用现有 `DropdownMenu`；触发器图标是 `naive-icons` 的 `TreeIcon`（24px，`color="currentColor"`），`aria-label="Skin"`；菜单是 `DropdownMenuRadioGroup`，两项：「預設 Default」「動物島 Island」。
  - `SkinOptions`：移动端侧边栏 `components/mobile-sidebar.tsx` 里，放在 `<ThemeOptions />` 旁边，结构与 `ThemeOptions` 一致（`role="radiogroup"`、挂载守卫）。
- 两者都做**挂载守卫**：挂载前一律渲染成"未选中"，与 `ThemeOptions` 的做法一致，避免 hydration mismatch。

### 7.2 通知门面 `lib/notify.ts`

```ts
export const toast: {
  success(msg: string): void
  error(msg: string): void
  info(msg: string): void
  promise<T>(p: Promise<T>, o: { loading: string; success: string | ((v: T) => string); error: string | ((e: unknown) => string) }): void
}
```

- 这个签名恰好是仓库里实际用到的子集（`success / error / info / promise` 加裸调用 `toast(node, opts)`），不是 sonner 的完整 API。第二参数为 `{ description?, duration?(毫秒), toasterId? }`。
- 默认路径用 rest 参数把入参**原样**透传给 sonner，这样 `share-dialog` / `review-notice` / `add-to-timetable` 里既有的 sonner mock 断言不用改。
- 路由规则：有效皮肤（`effectiveSkin(location.pathname, getSkin())`）为 `'island'` 且库已加载 → `Notification.success / error / info`（只转发 `description` 与换算成秒的 `duration`，不传值为 `undefined` 的键，避免覆盖库的 4.5s 默认）；否则 → `sonner` 的 `toast`。
- **永远走 sonner 的两种调用**：带 `toasterId` 的（`review-notice` 的 `admin_notice` 专用 Toaster）；裸调用 `toast(node, opts)`（`comment-card` 里带 Clerk `SignInButton` 的「请先登录」提示——库的 Notification 挂在独立的 React root，拿不到 Clerk context）。
- `promise`：以固定 `key` 先 `Notification.info({ message: loading, key, duration: 0 })`；完成后用同一个 `key` 原地更新为 `success` / `error`（带 `duration`）。
- 库尚未加载完成时（切换后的短暂间隙），落回 sonner，保证不丢提示。
- **只替换 7 个公开页文件**的 import：`components/report-dialog.tsx`、`components/review-notice.tsx`、`components/timetable-schedule-card.tsx`、`components/submit/submit-comment-form.tsx`、`components/review/comment-card.tsx`、`components/timetable/share-dialog.tsx`、`components/timetable/planner-sidebar.tsx`。
- admin 的 6 个文件（`app/admin/update/update-client.tsx` 与 5 个 `components/admin/admin-*-client.tsx`）**继续直接用 sonner**，`app/layout.tsx` 里的两个 `<Toaster>` 保持原样（第二个 `id="admin_notice"` 也不动）。

### 7.3 光标与 BackTop

- Cursor：`IslandLayer` 在 `<body>` 上加 / 去掉 `animal-cursor animal-cursor--force`，只在动物岛下生效。
- `BackTop`：直接渲染库的 `<BackTop />`（右下角，默认 `window` 目标）。它自带 `role="button"`、`aria-label="返回顶部"`。站内的 `FloatingPlanner` 也在右下角，实施时需核对不重叠（§12 R5）。

### 7.4 背景

- `<Background type="default" />`（奶油底 + 米色圆点，纯 CSS，没有图片资源），`position: fixed; inset: 0; z-index: -1; pointer-events: none; opacity: .5; aria-hidden`。
- 只在 `effective === 'island'` **且**主题为浅色**且**视口 ≥ 768px 时渲染。深色没有对应的库资源，N3 已声明不做。

### 7.5 图标（遵循 naive-icons skill）

| 位置 | 做法 | 为什么 |
|---|---|---|
| 皮肤切换入口 | `TreeIcon`，两种皮肤都用 | 库规则：图标走 `naive-icons`；一个固定的入口比随皮肤变化的入口好找 |
| `ThemeToggle`（桌面）与 `ThemeOptions`（移动端） | 默认皮肤仍是 lucide `Sun / Moon`；动物岛下换 `naive-icons` 的 `SunIcon / MoonIcon` | 与整体风格一致；这是库硬规则要求，换的范围就这两处 |

- 一律传 `color="currentColor"`：库默认墨色 `#2A2A2A` 在深色底上会糊。`color` 只改墨色描边，图标里的彩色填充**不会**跟着变，这是设计意图，不额外处理。
- 尺寸 24px（导航、按钮的基准）；移动端菜单项用 20px。16px 是图标"剪影可辨"的底线，本方案不在 16px 以下使用它们。
- 图标检索与代码生成都用 skill 自带的 `scripts/search.py` / `emit.py` 核对过；`TreeIcon`、`SunIcon`、`MoonIcon` 均在库内，无需新增图标。
- SSR 输出的永远是默认皮肤，所以 `ThemeToggle` 在动物岛下的图标替换发生在挂载后（沿用 `mounted` 守卫），24px 同尺寸，无布局位移。
- `naive-icons` 作为**显式依赖**写入 `package.json`（不依赖 `animal-island-ui` 的传递依赖）；三个图标按需具名导入，tree-shaking 后约 3 KB，随主包。

### 7.6 `theme-color`

`components/theme-color-meta.tsx` 扩展为同时订阅 `useEffectiveSkin()`（`lib/use-skin.ts` 导出，带 `'use client'`）：

| | 浅色 | 深色 |
|---|---|---|
| 默认 | `#FFFFFF` | `#020817` |
| 动物岛 | `#F8F8F0` | `#2B2118` |

## 8. 字体策略

- 在 `app/layout.tsx` 用 `next/font/google` 引入 `Nunito`：`subsets: ['latin']`、`display: 'swap'`、`preload: false`、`variable: '--font-nunito'`；`nunito.variable` 挂在 `<html className>` 上（挂在 `<body>` 会让 `html[data-skin] { --animal-font-family: var(--font-nunito) }` 解析为空）。`preload: false` 的含义：不会给每个页面注入 `<link rel=preload>`，字体文件只在 `font-family` 实际引用它时才被浏览器取用，即**只有动物岛用户会下载**（约十几 KB）。
- 中文走系统繁体字体栈（见 §6.4），不使用库的 Noto Sans SC。
- 在 `html[data-skin="island"]` 上声明 `--animal-font-family: var(--font-nunito), "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", system-ui, sans-serif !important`（库自己的声明带 `!important`，所以我们也必须带；同为 important 时特异性决定胜负，`html[data-skin]` 大于 `:root`）。
- 验收：在 Network 面板里，选择动物岛并浏览若干页面，**不得**出现 `noto-sans-sc-chinese-simplified-*.woff2`。

## 9. 文件清单

**新增**

| 文件 | 作用 |
|---|---|
| `app/skins/island.css` | §5 的 token、§6.2 的 `.btn-depth`/`.skin-modal`、§6.4 的覆盖 |
| `lib/skin.ts` | 纯逻辑（服务端布局会 import，**不得**引入 react / next 客户端 hook）：`Skin` 类型、`getSkin/setSkin/subscribe`、`effectiveSkin(pathname, chosen)`、`SKIN_INIT_SCRIPT` |
| `lib/use-skin.ts` | `'use client'`：`useSkin()`、`useEffectiveSkin()` |
| `lib/island-loader.ts` | 记忆化的 `loadIsland()`（库 CSS + 库本体的动态 import，失败时清缓存） |
| `types/animal-island-ui-style.d.ts` | `declare module "animal-island-ui/style"` |
| `tests/helpers/fake-storage.ts` | Node 25 下 jsdom 的 localStorage 不可用，测试用 `vi.stubGlobal` 注入的假存储 |
| `lib/notify.ts` | §7.2 门面 |
| `components/skin-switcher.tsx` | `SkinSwitcher`、`SkinOptions` |
| `components/skin-controller.tsx` | 把 effective skin 写到 `<html data-skin>` |
| `components/island-layer.tsx` | §4.3、§7.3、§7.4 |
| `components/skin-defs.tsx` | §6.3 的 SVG `clipPath` |
| `tests/skin-*.test.ts(x)` 等 | §10 |

**修改**

| 文件 | 改动 |
|---|---|
| `app/globals.css` | `:root` 增加 §6.1 的结构 token |
| `tailwind.config.js` | `borderRadius` 与 `boxShadow` 扩展 |
| `app/layout.tsx` | 引入 `island.css`、Nunito、`SKIN_INIT_SCRIPT`、`SkinDefs`、`SkinController`、`IslandLayer` |
| `components/ui/{button,input,textarea,card,dialog,sheet,select,popover,tooltip,hover-card,dropdown-menu}.tsx` | §6.2 的类名替换 |
| `components/navbar.tsx` | 放入 `SkinSwitcher` |
| `components/mobile-sidebar.tsx` | 放入 `SkinOptions` |
| `components/theme-toggle.tsx` | 动物岛下换 naive 图标 |
| `components/theme-color-meta.tsx` | §7.6 |
| 7 个公开页文件 | `toast` 的 import 改为 `@/lib/notify`（§7.2） |
| `components/ui/dialog.tsx` | 关闭按钮追加 `skin-close` 钩子类（§6.3） |
| `package.json` | 依赖 `animal-island-ui@2.2.1`、`naive-icons`、`classnames`（库的 peer dependency） |

## 10. 测试策略（TDD，先红后绿）

| # | 测试 | 断言 |
|---|---|---|
| T1 | `tests/skin-tokens.test.ts` | 解析 `island.css`：浅色块与深色块的变量集合 ⊇ `globals.css` `:root` 的 44 个颜色变量；§5.3 里列出的每一对前景/背景对比度达标；记录 `--button-depth` 的两个值 |
| T2 | `tests/skin-store.test.ts` | `lib/skin.ts`（纯逻辑）：默认 `'default'`；写入后读取一致；`localStorage` 抛异常 / 非法值 → `'default'`；订阅者收到通知；`storage` 事件触发更新；`effectiveSkin('/admin/x','island') === 'default'`，`'/adminfoo'` 也不被误判（只判 `/admin` 或 `/admin/`） |
| T3 | `tests/skin-init-script.test.ts` | 在 jsdom 里 `eval` 内联脚本：`island` → 写属性；`default` / 空 / 非法 → 不写；`/admin` 路径 → 不写；`localStorage` 抛异常 → 不抛、不写 |
| T4 | `tests/components/skin-switcher.test.tsx` | 挂载前无选中项；点选后 `setSkin` 被调用且持久化；`role="radiogroup"` 结构；`TreeIcon` 以 `currentColor` 渲染 |
| T5 | `tests/components/island-layer.test.tsx` | 默认皮肤下不发起任何 import；选动物岛后加载并给 `<body>` 加 cursor class；切回默认后移除 class、调用 `Notification.destroy`；浅色且 ≥768px 才渲染 Background；深色不渲染 |
| T6 | `tests/skin-default-parity.test.ts` | `globals.css` 里 §6.1 五个默认值逐项等于改动前的数值（6/6/8/4px，`0 0 #0000`）；`components/ui/*` 里被替换的类名集合与 §6.2 表一致，且不再残留未经审批的 `rounded-md/lg/sm` |
| T7 | `tests/notify.test.ts` | 默认皮肤 → 调 sonner；动物岛且库已加载 → 调 `Notification`；库未加载 → 回落 sonner；`promise` 用同一 `key` 更新为成功 / 失败；`success` 回调为函数时取返回值 |
| T8 | `tests/no-sonner-in-public.test.ts` | 7 个公开页文件不再 import `"sonner"`；admin 的 6 个文件仍 import `"sonner"`（防止回归） |
| T9 | `tests/components/theme-color-meta.test.tsx`（扩展） | 四种组合对应 §7.6 的 meta 值 |
| T10 | `tests/components/theme-toggle-skin.test.tsx`（新增，与既有 `theme-toggle.test.tsx` 分开，避免改动其 mock） | 动物岛下渲染 naive 图标；默认皮肤下仍是 lucide；两种下都带 `aria-label` |

现有的 `theme-tokens` / `no-light-only-colors` / `theme-css-generation` / `theme-mounts` 测试必须保持全绿（G3 的另一层保证）。

## 11. 验收标准

- **AC1**：`npm test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全绿。
- **AC2**：未选动物岛时，Network 里没有 `animal-island-ui` 的 CSS/JS，也没有 Nunito 字体请求；`app/globals.css` 之外的默认样式与改动前一致（T6）。
- **AC3**：选动物岛后刷新，首次绘制就是动物岛配色（无默认皮肤的闪烁）；四种 `light/dark × default/island` 组合手动浏览首页、课程页、搜索、提交、课表，无不可读文字。
- **AC4**：选动物岛后 Network 里没有 `noto-sans-sc-chinese-simplified-*.woff2`。
- **AC5**：`/admin/**` 在任何皮肤选择下都是默认外观；从公开页软导航进入 admin 再回来，皮肤随之切换。
- **AC6**：Dialog 在动物岛下是水滴外形，内容不被裁；键盘 Tab 的焦点陷阱、`Esc` 关闭、`aria-*` 与默认皮肤一致。
- **AC7**：动物岛下触发成功 / 失败 / `promise` 三类通知，样式为库的 Notification；admin 页的通知仍是 sonner。
- **AC8**：切换器在桌面端与移动端侧边栏都可用，选择在刷新与跨标签页后保持。
- **AC9**：产出本 spec、`docs/superpowers/plans/2026-10-11-next-web-animal-island-skin.md` 与 `docs/superpowers/verification/` 下的验证文档（含四种组合的截图与对比度表）。

## 12. 风险与缓解

| # | 风险 | 缓解 |
|---|---|---|
| R1 | Dialog 的 `clip-path` 裁到内容或关闭按钮（水滴的圆角收窄量约为宽 / 高的 3–5%） | 用库同款的内边距（上 40 / 左右 35 / 下 32）；关闭按钮内移（§6.3）；`border-radius: 24px` 兜底；AC6 逐个 Dialog 目视核验（8 处调用点） |
| R2 | 库 CSS 在首次绘制之后才到，层 3 的组件首次出现时可能无样式闪一下 | 层 3 组件本来就在 `useEffect` 之后才挂载，且只在库加载完成后才渲染（`lib` 不为空才渲染） |
| R3 | 动态 `import('animal-island-ui/style')` 在 Next 15 / OpenNext 的构建下的行为 | 计划的第一个任务就是做这件事的最小验证；若不能按需拆出 CSS chunk，回退方案是把库 CSS 放进 `app/skins/island-lib.css` 里经 `<link>` 手动按需插入（不改变任何公开行为，只改变加载方式） |
| R4 | `notify` 门面与 sonner 的行为差异（堆叠、关闭、可访问性） | 门面是子集（§7.2）；Notification 自带 `role`；sonner 的 `Toaster` 与 `admin_notice` 保持原样，作为回落 |
| R5 | `BackTop` 与右下角的 `FloatingPlanner` 重叠 | 实施阶段在 `IslandLayer` 里给 BackTop 加 `style={{ bottom: … }}` 避让；验证文档里截图确认 |
| R6 | `Background` 的 `fixed` 层被不透明的页面容器遮住，装饰几乎看不见 | 纯装饰、非必需；验证时若效果不佳就去掉这一层，不影响其他部分（N3） |
| R7 | `naive-icons` 的彩色填充在深色底上突兀 | 只有 `SunIcon / MoonIcon / TreeIcon` 三处使用，导航栏尺寸（24px）下以墨色描边为主；验证文档对四种组合各截一次导航栏 |
| R8 | 浅色下的 token 会让个别硬编码色的组件看上去"没换"（如 `text-white` / `bg-white/NN` 有意保留的那批） | 沿用深色模式 spec §5.6 的豁免清单；验证时列出动物岛下仍保持原色的位置 |
| R9 | `html[data-skin]` 的选择器特异性高于 `.dark`，与未来新增 token 冲突 | T1 要求浅 / 深两块都覆盖全部变量，新增变量漏写会让测试失败 |

## 13. 交付物

1. 本 spec：`docs/superpowers/specs/2026-10-11-next-web-animal-island-skin-design.md`
2. 实施计划：`docs/superpowers/plans/2026-10-11-next-web-animal-island-skin.md`（`writing-plans` 产出）
3. 验证文档：`docs/superpowers/verification/2026-10-11-next-web-animal-island-skin.md`（含四种组合截图、对比度表、Network 检查结果）
4. 代码：§9 的新增与修改文件
