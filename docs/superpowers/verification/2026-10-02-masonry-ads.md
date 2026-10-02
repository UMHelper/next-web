# Masonry Ads Verification — 2026-10-02

## Status

Spec、实施计划与全部 7 个 task 已实现并提交在本地分支 `feat/masonry-ads`（基于 `main` 的 `b987a9d`）。未 push、未部署。

## Commits

- `813e0ae docs: spec for masonry ad slots (server salt + deterministic 10% pick)`
- `6307136 feat(ads): read AdSense configuration from env`
- `513387c feat(ads): deterministic 10% ad slot picker`
- `7aec40c feat(ads): server-side ad salt`
- `2eaf0d3 feat(ads): AdSense ad slot unit with single-push guard`
- `80a71f4 feat(ads): withAdSlots list decorator with SSR coverage`
- `1ead000 feat(ads): load AdSense only when GTM is absent`
- `95c2913 feat(ads): place 10% ad slots in all masonry lists`

## Commands run

- [x] `npx vitest run tests/ads tests/components/ad-slot.test.tsx tests/components/masonry-ads.test.tsx` — 8 files / 42 tests passed
- [x] `npm run test` — 104 files / 336 tests passed, **1 pre-existing failure**（见下方 Known issues，与本次改动无关）
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

## Known issues

- `tests/site-urls.test.ts > encodes professor path and review page suffix` **在 `main` 上就是红的**，与本次改动无关：`git diff main --name-only -- lib/site.ts tests/site-urls.test.ts` 为空。根因是 `b987a9d` 把 `buildReviewPath` 改成 `/reviews/CODE/PROF/3`（`lib/review-route.ts:29-37` 的 `parseReviewRoute` 确实支持尾段数字），但测试仍期待旧的 `/reviews/CODE/PROF/page/3`。修法是改这一行测试期望（1 行），未纳入本次范围。

## Deployment requirements (not yet done)

- [ ] Cloudflare 上 `NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID` 必须在**构建环境**（`NEXT_PUBLIC_*` 会被内联进客户端 bundle）与 **worker 运行时**都存在，否则会出现"服务端渲染了广告位、客户端 `AdSlot` 返回 null"的不一致
- [ ] GTM 容器 `GTM-KGF3BFS` 里那个注入 `adsbygoogle.js` 的 Custom HTML tag 保持启用（否则生产没有 loader；代码里的兜底只在**没有** `GTM_ID` 时生效）
- [ ] 部署后执行 AC6：`curl -s https://umeh.top/search/course/CISC | grep -c 'class="adsbygoogle'` ≥ 1

## Manual smoke checklist (pending browser + deployed verification)

- [ ] 生产域名下广告位显示 `Advertisement` 标签 + 广告（或未填充时保持 `120px/250px` 占位），不遮挡卡片、不产生跳动
- [ ] 瀑布流里改筛选条件（`CourseFilter`）时广告不会乱跳，且控制台无 hydration 警告
- [ ] 打开广告拦截器时页面正常、无报错
- [ ] 移动端断点（<768px）占位高度 120px，桌面 250px
