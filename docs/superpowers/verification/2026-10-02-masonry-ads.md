# Masonry Ads Verification — 2026-10-02

## Status

Spec、实施计划与全部 7 个 task 已实现，并通过 `--ff-only` 合并回 `main`（工作分支 `feat/masonry-ads` 已删除）。`main` 因此领先 `origin/main` 10 个 commit：**未 push、未部署**。

合并后在 `main` 上复跑：`npm run test` 105 files / 337 tests passed、`npm run lint` 无告警、`npx tsc --noEmit` 通过。

## Commits

- `813e0ae docs: spec for masonry ad slots (server salt + deterministic 10% pick)`
- `6307136 feat(ads): read AdSense configuration from env`
- `513387c feat(ads): deterministic 10% ad slot picker`
- `7aec40c feat(ads): server-side ad salt`
- `2eaf0d3 feat(ads): AdSense ad slot unit with single-push guard`
- `80a71f4 feat(ads): withAdSlots list decorator with SSR coverage`
- `1ead000 feat(ads): load AdSense only when GTM is absent`
- `95c2913 feat(ads): place 10% ad slots in all masonry lists`
- `89aef03 test: update buildReviewPath expectation to the path suffix format`

## Commands run

- [x] `npx vitest run tests/ads tests/components/ad-slot.test.tsx tests/components/masonry-ads.test.tsx` — 8 files / 42 tests passed
- [x] `npm run test` — **105 files / 337 tests passed**（含 `89aef03` 修好的旧期望）
- [x] `npm run lint` — `✔ No ESLint warnings or errors`
- [x] `npx tsc --noEmit` — passed (exit 0)
- [x] `npm run build` — passed；First Load JS shared 仍为 87.6 kB

## Behavior verification

- [x] 广告位进入**服务端 HTML**：`tests/components/masonry-ads.test.tsx` 用 `renderToStaticMarkup` 断言 `<ins class="adsbygoogle">` 在 `grid items-start gap-4` 容器内、且排在被选中的卡片之后
- [x] 每张卡独立 10%：`tests/ads/ad-slots.test.ts`（1000 key 语料命中率带宽 7%~13%，实测 108/1000）；`rate=0` → 0 个，`rate=1` → 每张卡后 1 个
- [x] 确定性：同一 `(key, salt)` 恒定；同一 salt 两次渲染 HTML 完全一致（SSR/hydration 一致性前提）
- [x] AdSense 未配置 → 不插入广告位（`salt=null` 路径），不留空洞
- [x] 单次 push 守卫：`tests/ads/request-ad.test.ts`（新元素 push 1 次、同元素不重复、`data-adsbygoogle-status` 已存在时跳过、缺元素跳过、拦截器抛错被吞掉）
- [x] React StrictMode 双执行下只请求一次广告：`tests/components/ad-slot.test.tsx`
- [x] loader 分支：有 `GTM_ID` 时不自注入（纯函数决策表 + 源码断言 `pagead2…adsbygoogle.js?client=${client}`、`strategy="afterInteractive"`、`crossOrigin="anonymous"`）
- [x] 守卫测试（`tests/ads/ad-wiring.test.ts`）：5 处 `Masonry` 全部走 `withAdSlots`；2 个页面给 `CourseFilter` 传 `adSalt`；客户端组件不得 import `lib/ads/ad-salt`；广告渲染路径不得出现 `Math.random`；`components/masonry.tsx` 未被污染

## End-to-end evidence (local production build, no deploy)

`npm run build` 之后直接查构建产物与本地 `next start`（端口 3999，验证后已关闭）：

| 检查 | 结果 |
|---|---|
| SSG `/catalog/FAH.html` 内 `<ins class="adsbygoogle">` | 69 个，`data-ad-client="ca-pub-6229219222351733"` |
| 真实密度 `FAH` / `FED` / `FHS` | 69/707 = **9.8%**、26/338 = 7.7%、10/112 = 8.9% |
| 动态 `/search/course/CISC` 两次请求的 slot 数 | **8** 与 **14**（每请求重新随机，且均在 SSR HTML 中） |
| `next start` 服务页里的 loader | 0 个 `pagead2` script（本地 `.env.local` 有 `GTM_ID`，按设计不自注入） |
| 客户端 chunk 内联的 client id | 命中（`.next/static/chunks/app/{course,professor,search/instructor}/…js`） |

## 部署后事故与修复（2026-10-02，同一分支追加）

### 症状

用户报告：线上瀑布流"只看到一个卡片下边距很大，但没看到广告"。

### 分层取证（systematic-debugging Phase 1）

| 层 | 观察 | 判定 |
|---|---|---|
| 服务端渲染 | `curl https://umeh.top/search/course/CISC` → 8 个 `<ins class="adsbygoogle">` + 8 个 `Advertisement` + `data-ad-slot="7484871258"`；`/catalog/FBA` → 47 个 | ✅ 有广告位 |
| GTM loader | headless Chrome 的 DOM 里有 `adsbygoogle.js?client=ca-pub-6229219222351733` | ✅ loader 已加载 |
| 备选原因排除 | loader URL 200；无 CSP；`ads.txt` 200 `text/plain` 内容正确 | ✅ 排除 |
| 客户端 bundle | 线上 25 个 chunk **0 个**含 client/slot id；chunk 里保留运行时查询 `i(s.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID)` | ❌ 客户端取不到值 |
| hydration | 控制台 `Minified React error #418` + `#422`；hydration 后我们的 `Advertisement`=0、`min-h-[120px]`=0、`border-dashed` 包装 div=0（SSR 里本来有 8 个） | ❌ 服务端渲染 → 客户端 `null` → React 把广告位整块删除 |
| 结果 | 客户端 `AdSlot` 返回 `null` ⇒ `useEffect` 直接 return ⇒ `adsbygoogle.push` **从未执行** ⇒ AdSense 永不填充；用户看到的 250px 空盒子是 hydration 之前的 SSR 产物 | 无广告 |

### 根因

同一个"是否渲染广告位"的判断在两侧各做一次，来源不同：

- **服务端**（Worker 运行时）读 `process.env.NEXT_PUBLIC_GOOGLE_ADS_*` → 有值 → 渲染广告位；
- **客户端** bundle 在**构建期**固化 public env，Cloudflare 构建环境没有这两个变量 → `undefined` → `AdSlot` 返回 `null`。

即 spec §11 的 **R2** 风险真实发生。**这不是"补个环境变量"就完事的问题**：只要构建环境与运行环境可能不一致（preview 构建、构建机换代、新 route），同类 bug 就会复现，而且表现是 hydration 报错 + 广告位消失。

### 修复（根因，不是症状）

让**服务端成为唯一决策源**，广告 id 随 RSC payload 下发：

- `lib/ads/ad-config-server.ts`：新增 `createAdConfig()` → `{ salt, client, slot } | null`（替代 `createAdSalt`，`lib/ads/ad-salt.ts` 已删除）
- `components/ads/ad-slot.tsx`：改为 `AdSlot({ client, slot, className })`，**不再读任何 env**
- `lib/ads/ad-slots.tsx`：新增 `type AdConfig`；`withAdSlots(items, { getKey, renderItem, ads })`
- 7 个接入点：`createAdConfig()` + `ads` prop
- 守卫测试（`tests/ads/ad-wiring.test.ts` 新增两条）：**客户端源文件不得出现 `NEXT_PUBLIC_GOOGLE_ADS_`、不得 import `lib/ads/ad-config` / `lib/ads/ad-config-server`**
- 回归测试：`AdSlot` 在 env 为空时仍渲染（`tests/components/ad-slot.test.tsx`）、`withAdSlots` 在 env 为空时仍渲染广告位（`tests/components/masonry-ads.test.tsx`）

### 复现与验证（本地按生产形态构建）

生产形态 = **构建时没有**这两个变量、**运行时**有。做法：临时把 `.env.local` 里那两行注释掉构建，构建后字节级还原（`cmp` 校验 YES），再用 `next start` 带上这两个变量启动：

| 检查 | 修复前（线上） | 修复后（本地同姿态） |
|---|---|---|
| 客户端 chunk 含 id 数 | 0 | 0（同姿态） |
| 服务端 bundle 保留运行时读取 | 是 | 是（同姿态） |
| 动态页 SSR 广告位数 | 8 | 12（salt 每请求随机，数量本就浮动） |
| hydration 后我们的广告位存活 | **0** | **11/11 全部存活** |
| `React #418` / `#422` | 有 | **0** |
| 我们渲染的 `<ins>` 被 AdSense 处理（`data-adsbygoogle-status="done"`） | 无（push 从未执行） | **11/11**，且 AdSense 已回填尺寸（`style="height: 280px"`，localhost 不投放属预期） |
| SSG 页（构建环境无变量） | — | 无广告位，**页面正常**（优雅降级，不再破坏 hydration） |

正常构建（`.env.local` 在）下 `/catalog/FBA` 的 SSG HTML 仍有 45 个广告位，说明**预渲染路由需要构建环境也有这两个变量**才会投放。

## Known issues

- ~~`tests/site-urls.test.ts > encodes professor path and review page suffix` 在 `main` 上就是红的~~ → 已在 `89aef03` 修好（把期望改成路径后缀格式 `/reviews/CODE/PROF/3`）。根因是 `b987a9d` 改了 `buildReviewPath` 的实现（`lib/review-route.ts:29-37` 的 `parseReviewRoute` 确实支持尾段数字、`components/review-pagination.tsx:17` 也走同一个 builder），但测试仍期待旧的 `/page/3`。当前 `main` 上全量测试已全绿。

## Deployment requirements (not yet done)

- [ ] Cloudflare **构建环境**也要有 `NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID`：修复后客户端不再读它们（因此不会再出现 hydration 不一致），但**预渲染/ISR 路由**（`catalog`、`professor`、`course`、`reviews`）的广告位是在构建期烘焙进 HTML 的，构建环境没有就是"这些路由不投广告"（页面仍正常）
- [ ] `NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID` / `_SLOT_ID` 也必须在 **worker 运行时**存在：动态路由（`search/*`）与 GTM 兜底都靠它
- [ ] GTM 容器 `GTM-KGF3BFS` 里那个注入 `adsbygoogle.js` 的 Custom HTML tag 保持启用（否则生产没有 loader；代码里的兜底只在**没有** `GTM_ID` 时生效）
- [ ] 部署后执行 AC6：`curl -s https://umeh.top/search/course/CISC | grep -c 'class="adsbygoogle'` ≥ 1

## Manual smoke checklist (pending browser + deployed verification)

- [ ] 生产域名下广告位显示 `Advertisement` 标签 + 广告（或未填充时保持 `120px/250px` 占位），不遮挡卡片、不产生跳动
- [ ] 瀑布流里改筛选条件（`CourseFilter`）时广告不会乱跳，且控制台无 hydration 警告
- [ ] 打开广告拦截器时页面正常、无报错
- [ ] 移动端断点（<768px）占位高度 120px，桌面 250px
