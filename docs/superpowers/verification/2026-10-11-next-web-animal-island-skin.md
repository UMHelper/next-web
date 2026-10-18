# 动物岛皮肤验证记录

- 日期：2026-10-11
- 提交：`5c8c81c`（含验收中发现并修复的存储降级缺陷）
- 环境：Node v25.8.1、npm 11.11.0；`npm run build` 后 `next start -p 3002`（生产构建）；浏览器为 Electron webview，桌面 1280×800，移动 390×844

## 自动化

- `npx vitest run --poolOptions.forks.maxForks=2 --poolOptions.forks.minForks=1`：159 个文件 / 881 个用例全部通过（完整 vitest 默认并发会 OOM，需限制 fork 数）
- `npm run lint`（`--max-warnings=0`）：通过
- `npx tsc --noEmit`：通过
- `npm run build`：通过

## 浏览器验收（AC1–AC9）

| # | 结果 | 备注 / 截图 |
|---|---|---|
| AC1 默认皮肤零回归 | 通过 | `<html>` 无 `data-skin`；0 个 `animal-island-ui` 请求；无光标类。未做改动前后的像素级比对，只核对了结构与网络 |
| AC2 切换与持久化 | 通过 | UI 点击后 `data-skin="island"`、`localStorage["umeh-skin"]="island"`；库按需加载；刷新后 `DOMContentLoaded` 时已有属性（无闪烁）；请求 Nunito，0 个 Noto Sans SC |
| AC3 明暗独立 | 通过 | 亮色 body 背景 `rgb(248,248,240)`，暗色 `rgb(43,33,24)`；桌面亮色下库 Background、BackTop、光标元素均存在。截图：`screenshots/island-dark-home.png`（暗色 island 首页） |
| AC4 交互层 | 部分通过 | 光标、BackTop、桌面亮色 Background 通过。**toast 路由未能在浏览器里完整验证**：未登录可达的 toast 都是 `toast(<节点>)`，按设计始终走 sonner（评价页的站点公告在 island 下确为 sonner、无库 Notification 元素）；字符串型 `toast.error/success/info` 需登录才能触发。库 Notification 的路由由 `tests/notify.test.ts` 覆盖（默认→sonner、island 且库已加载→Notification、库未加载→回落 sonner、promise 复用同一 key、`toasterId` 与裸节点调用恒走 sonner） |
| AC5 回退干净 | 通过 | 切回默认后属性、光标类、BackTop 均被移除 |
| AC6 admin 排除 | 仅单元测试 | `/admin` 在未登录时重定向到登录页，浏览器里无法看到 admin 外观。`effectiveSkin`（含 `/adminfoo` 不误判）与内联脚本的 admin 分支由 `tests/skin-store.test.ts`、`tests/skin-init-script.test.ts` 覆盖 |
| AC7 字体 | 通过 | island 下 0 个 `noto-sans-sc-chinese-simplified-*.woff2` 请求，正文 Nunito |
| AC8 移动端（390×844） | 通过 | 无 Background；BackTop `[302,748,366,812]` 与规划按钮 `[171,780,219,828]` 不重叠；侧栏有 Theme 与 Skin 两组 radiogroup，Island 为选中。截图：`screenshots/island-mobile-sidebar.png` |
| AC9 弹窗与按钮 | 通过 | 按下 `translateY(3px)`，阴影变为 `0 1px 0 0` 深度阴影，松开恢复；弹窗 `clip-path` 生效、内边距 40/35/32、圆角 24px、无边框，关闭按钮在右上角内侧（16×16）；焦点环 `0 0 0 2px #F8F8F0, 0 0 0 4px #0B6E65`。截图：`screenshots/island-light-dialog.png` |

## 降级路径

- 库 chunk 被拦截（`page.route` 中止 `chunks/9995.*.js`）：通过。页面仍为 island 自有皮肤（body 背景 `rgb(248,248,240)`、Nunito），无未捕获异常，页面可用
- `localStorage` 不可用（`addInitScript` 让其访问即抛 `SecurityError`）：**发现缺陷并已修复**。
  - 修复前：页面能渲染默认皮肤、不抛错，但在切换器选「Island」后 `data-skin` 仍为空，切换器形同失效（`getSkin` 只读存储，`setSkin` 写失败后无处保存）
  - 修复（`5c8c81c`，先加失败测试再改 `lib/skin.ts`）：写存储失败时在内存里保留本次会话的选择
  - 修复后重跑：选 Island → `data-skin="island"` 且光标类存在；切回 Default → 属性与光标类被移除
  - 控制台里的 `denied` 来自 chunk 7221（不含皮肤代码，推测为 Clerk 读取存储），是注入的异常触发的第三方报错，不是皮肤层

## 已知问题 / 遗留

- 测试环境：webview 不推进 CSS transition，依赖过渡的计算值（`.btn-depth` 的 transform / box-shadow、焦点环）会读到旧值；读取前需设置内联 `transition:none` 或等待。这是环境产物，不是缺陷
- 390px 视口存在横向溢出（scrollWidth 438），默认皮肤与 island 完全一致，属既有问题
- 移动端侧栏 Sheet 缺少 `DialogTitle`，Radix 在控制台报错，属既有问题
- ~~未登录时 `/timetable` 点击「Create timetable」，`/api/timetable/catalog/filters` 返回 401，随后客户端抛 `Cannot read properties of undefined (reading 'map')`~~ 已修复：`/timetable` 未登录显示 Sign in 引导；filters 请求失败不再写入错误 body
- 未做的验收：AC4 的 toast 浏览器端路由（需登录）、AC6 的 admin 外观（需登录）；两项均以单元测试覆盖，见上表

## Follow-up: search, switch, card corners, stars

- Home hero: photo hidden under island, library `Background type="sprinkles"` behind it (dimmed with a CSS filter in dark), hero card has no backdrop blur, a solid card background and a visible border; hero text uses foreground tokens.
- `Switch`: `.skin-switch` / `.skin-switch-thumb` follow the library look (52x28, 2.5px borders, green when on, light and dark variants).
- `CardFooter` gets `.skin-card-footer` so its bottom radii follow `--radius-card`; the square footer background no longer overpaints the card border corners.
- Stars: `SkinRating` renders the library `Rate` under island (after the lazy load) and the original `@smastrom/react-rating` otherwise; used in `comment-card.tsx` and the five ratings in `submit-comment-form.tsx`. The red-to-green colour scale is not carried over to the island skin.
- Gate: tsc, lint, vitest (160 files / 884 tests) and build green. Checked in browser on light and dark home, search results, and the reviews page.

## Follow-up: icons, hero buttons, skin names

- New client `components/skin-icon.tsx`: a name-keyed registry (server components cannot pass component refs) mapping each home-page icon to a lucide icon (default skin) and a naive-icons icon (island skin). Unknown names fall back to the generic faculty icon. Used by the home feedback/community cards, faculty statistics, trending courses, and the review header.
- naive-icons hardcode `#2A2A2A` strokes on some icons (e.g. the globe stand); `html[data-skin="island"].dark svg [stroke="#2A2A2A"]` maps them to `currentColor` so they stay visible on the dark palette. The chevron icon is kept as lucide because its ink stroke is baked in and disappears on the teal header.
- Review header Submit/Timetable buttons get `.hero-action` (cream pill, 2.5px border, sand depth shadow, pressed state).
- Switcher labels renamed: 預設 Default -> 紙本 Paper, 動物島 Island -> 卡通 Cartoon (internal values `default` / `island` unchanged).
- Gate: tsc, lint, vitest (161 files / 887 tests) and build green. Checked in browser (light and dark): home cards, faculty grid, trending list, review header buttons.
