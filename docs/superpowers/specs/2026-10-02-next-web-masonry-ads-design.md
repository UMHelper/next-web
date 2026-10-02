# next-web 瀑布流广告投放设计

> 状态：Draft，等待人工 review
> 日期：2026-10-02
> 前置：`2026-09-19-next-web-ssr-bundle-design.md`（Phase 2A 删除了 `Math.random()` 广告插入与 `components/ad.jsx`）
> 后续计划：review 通过后，用 `writing-plans` 生成实施计划

---

## 1. 背景

Phase 2A 把 `components/masonry.tsx` 从客户端分栏组件重写为纯服务端渲染的 CSS grid 组件，并按设计文档要求删除了排版组件内部的随机广告插入（`2026-09-19-next-web-ssr-bundle-design.md:100`：**"若仍需广告，广告 slot 由调用方显式传入，不由排版组件随机插入"**）。随后 `43a1ed6` 删除了 `components/ad.jsx`（AdSense `<ins>` 组件）。

清理后现状：

- 全站源码不再出现 `adsbygoogle` / `pagead2` / `googlesyndication`，瀑布流里没有任何广告位；
- `NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID`、`NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID` 仅存在于 `.env.local`、`.env.example`、`cloudflare-env.d.ts` 的声明中，没有任何代码消费；
- `public/ads.txt` 仍然存在（`google.com, pub-6229219222351733, DIRECT, f08c47fec0942fa0`）；
- 生产 `umeh.top` 的 GTM 容器 `GTM-KGF3BFS` 内已有一个 Custom HTML tag 注入 AdSense loader：
  `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6229219222351733" crossorigin="anonymous">`，
  但容器内**没有任何广告单元 markup**，站点自身也不再渲染广告单元 → 线上一个 `<ins class="adsbygoogle">` 都没有；
- 线上实测（`https://umeh.top/search/course/CISC`）：HTTP 200，存在 `grid items-start gap-4`（瀑布流正常），`adsbygoogle` 出现 0 次。

本设计把广告重新接回瀑布流，但不再回到"客户端随机插入"的旧实现：**用服务端生成的 salt + 确定性选择函数在列表层插入广告位**。

## 2. 目标与非目标

### 2.1 目标

- **G1**：`Masonry` 保持纯净（不改 `components/masonry.tsx`），广告位由调用方通过 `withAdSlots()` 显式插入。
- **G2**：广告频率为**每张卡独立 10% 概率**（`AD_RATE = 0.1`），语义与旧实现一致。
- **G3**：广告位的选择必须是**纯函数**：`isAdSlot(key, salt, rate)`，同一 `(salt, key)` 结果恒定，不含 `Math.random()`、不含 `Date.now()`。
- **G4**：广告位出现在**服务端 HTML** 中（SSR 占位），hydration 不产生 mismatch、不产生布局跳动（CLS）。
- **G5**：`salt` 只在服务端组件生成（`createAdSalt()`）；客户端组件通过 prop 接收，绝不在客户端渲染路径生成随机值。
- **G6**：AdSense loader 不由 next-web 重复注入 —— 生产依赖 GTM 已有的 tag；仅在**未配置 `GTM_ID`** 的环境（本地 / preview）且 `NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID` 存在时才由 `next/script` 注入。
- **G7**：AdSense 未配置时（`CLIENT_ID` 或 `SLOT_ID` 缺失），广告位**完全不插入**（不留空洞），页面与现在完全一致。
- **G8**：广告单元组件对重复 push 免疫（`reactStrictMode: true` 下的 dev 双执行、二次挂载、客户端路由往返都不会重复 push 同一个 `<ins>`）。
- **G9**：提供纯函数测试、组件测试、SSR 输出测试与"禁止回归"守卫测试。
- **G10**：提供 spec / plan / verification 三份文档。

### 2.2 非目标

- **N1**：不做 per-位置 slot id（5 处 `Masonry` 复用同一个 `NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID`）；后续需要时通过 `AdSlot` 的 `slot` prop 扩展。
- **N2**：不做 IntersectionObserver 懒加载、不做视口内才 push 的优化。
- **N3**：不启用 AdSense Auto Ads（页面级广告），不在 GTM 侧做任何改动。
- **N4**：不做频次上限、不做"最小间隔"、不做首屏保护、不做广告屏蔽/付费去广告。
- **N5**：不改 `Masonry`、不改 `public/ads.txt`、不改 `app/layout.tsx` 的 GTM 逻辑。
- **N6**：不新增 consent / CMP 流程（EEA/UK 用户的同意管理另开设计）。
- **N7**：不改 iOS 端与任何 API。
- **N8**：不在首页、目录导航、时间表等非 `Masonry` 列表里放广告。

## 3. 决策记录（人工已确认）

| # | 决策 | 选项 | 理由 |
|---|---|---|---|
| D1 | 随机语义 | **服务端按次随机 + 确定性选择函数** | SSR 里就有广告占位（无 CLS、可测试、无 hydration 警告），位置随服务端渲染变化 |
| D2 | 频率语义 | **每张卡独立 10%**（`rate = 0.1`） | 与旧行为一致；接受"可能连续两张"和"长列表也可能 0 个广告" |
| D3 | 覆盖面 | **全部 5 处 Masonry（共 6 个接入文件）** | 复原旧覆盖面 |
| D4 | loader | **靠 GTM，仅在无 `GTM_ID` 时自己注入** | 避免同一 client 的 loader 双份加载 |

## 4. 架构与数据流

```text
server page / server component（请求期或构建期）
  salt = createAdSalt()                      // AdSense 未配置 → null
  │
  ├─ <CourseFilter data={...} adSalt={salt} />          // 'use client'：salt 只能靠 prop 传
  └─ 其他 server component（自己调用 createAdSalt()）
        │
        └─ withAdSlots(items, { getKey, renderItem, salt })
              ├─ salt === null → 原样映射，不插广告
              └─ 命中 isAdSlot(key, salt) 的卡片后面插入 <AdSlot />
                    │
                    └─ <Masonry>（不改动）→ grid 多一个格子
                          │
                          └─ <AdSlot />（'use client'）
                                ├─ SSR：输出 <ins class="adsbygoogle" ...>
                                └─ hydration 后：useEffect push({}) 一次
```

要点：

1. `salt` 由服务端组件生成，作为 **prop / 参数**向下传递；客户端组件不生成随机值。
2. `withAdSlots()` 是纯函数（相同入参 → 相同输出），因此服务端渲染与客户端 hydration 会对同一份 children 得出相同结果。
3. `AdSlot` 是唯一的客户端边界；`Masonry` 与其调用方大多仍是 Server Component。
4. 广告位是 grid 的一个普通格子，排在命中卡片**之后**。

### 4.1 缓存语义（已知并被接受）

`salt` 的生命周期 = 渲染该页面的那次服务端渲染：

| 路由 | 渲染模式 | salt 生命周期 |
|---|---|---|
| `app/search/course/[code]` | 动态（无 `generateStaticParams`、无 `revalidate`） | 每次请求 |
| `app/search/instructor/[...name]` | 动态 | 每次请求 |
| `app/reviews/[code]/[...prof]` | `revalidate = 300` | 300s 缓存窗口 |
| `app/course/[code]` | `revalidate = 3600` | 3600s 缓存窗口 |
| `app/professor/[...name]` | `revalidate = 3600` | 3600s 缓存窗口 |
| `app/catalog/[...departments]` | `generateStaticParams`（构建期静态） | 每次部署 |

即：缓存窗口内所有用户看到的广告位置相同，窗口过后重新随机。这是 D1 的已知代价，不影响 AdSense 计费（曝光按客户端渲染计）。

## 5. 选择算法

`lib/ads/ad-slots.tsx`：

```ts
export const AD_RATE = 0.1;

export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function isAdSlot(key: string, salt: string, rate: number = AD_RATE): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  return fnv1a32(`${salt}:${key}`) % 1000 < Math.round(rate * 1000);
}
```

- **只依赖 `(salt, key)`，不含 index**：同一张卡在同一个 salt 下结果恒定 → 用户在 `CourseFilter` 里改筛选条件时，广告不会在列表里乱跳；也让测试可以完全断言。
- `rate >= 1` 提前返回 true，`rate <= 0` 提前返回 false，避免 `1000 < 1000` 这类边界歧义。
- FNV-1a 32 位对短字符串分布均匀，`% 1000 < 100` 即 10%（容差在测试里用 1000 个 key 的 7%~13% 带宽断言）。

## 6. 组件设计

### 6.1 `lib/ads/ad-config.ts`

```ts
export function getAdsenseClientId(): string | null;  // process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID
export function getAdsenseSlotId(): string | null;    // process.env.NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID
export function isAdsenseConfigured(): boolean;       // 两者都非空
```

- 每次调用时读 `process.env`（不在模块顶层快照），便于测试用 `vi.stubEnv` 覆盖，也避免 Worker 运行时环境变量被构建期值固化。
- `NEXT_PUBLIC_*` 在客户端 bundle 里是**构建期内联**的，因此"未配置"这个判断在服务端与客户端必须读同一份值（见 §11 风险 R2）。

### 6.2 `lib/ads/ad-salt.ts`

```ts
export function createAdSalt(): string | null;
```

- AdSense 未配置 → 返回 `null`（调用方因此不插广告，**不留空洞**）。
- 已配置 → `crypto.randomUUID().slice(0, 8)`。
- **只允许服务端组件 import**：`crypto.randomUUID()` 在客户端与服务端会得到不同的值，一旦被客户端渲染路径调用就是 hydration mismatch。用守卫测试锁死（§9 T2）。

### 6.3 `lib/ads/ad-slots.tsx`

```tsx
export type WithAdSlotsOptions<T> = {
  getKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  salt: string | null;
  rate?: number;
};

export function withAdSlots<T>(items: T[], options: WithAdSlotsOptions<T>): ReactNode[];
```

行为：

- `salt === null` 或 `items.length === 0` → 返回 `items.map(renderItem)`，不含任何广告。
- 命中 `isAdSlot(getKey(item, index), salt, rate)` 的卡片**之后**插入 `<AdSlot key={"ad-" + getKey(item, index)} />`。
- 不修改入参数组；调用方到 `renderItem` 里自己给卡片加 key（保持现有 key 语义）。

### 6.4 `components/ads/ad-slot.tsx`（`'use client'`）

- 渲染外框 + `Advertisement` 小标签 + `<ins>`：

```tsx
<div className="flex flex-col rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-1">
  <span className="px-1 pb-1 text-[10px] uppercase tracking-wider text-slate-400">Advertisement</span>
  <ins
    ref={insRef}
    className="adsbygoogle block min-h-[120px] w-full overflow-hidden md:min-h-[250px]"
    data-ad-client={client}
    data-ad-slot={slot}
    data-ad-format="auto"
    data-full-width-responsive="true"
  />
</div>
```

- `useEffect` 中 push，三重防重：`data-adsbygoogle-status` 属性已存在 → 跳过；WeakSet 已记录该 DOM 节点 → 跳过；push 抛错 → `catch` 吞掉（广告拦截器会让 `adsbygoogle` 缺失或抛错，不能影响页面）。
- `client` 或 `slot` 缺失 → `return null`（防御性；正常路径下调用方已经不会插入）。
- 只保留一个可选 `className` prop；不做"按位置换 slot"等额外能力（N1）。

### 6.5 `components/ads/adsense-script.tsx`（Server Component）

```tsx
const client = getAdsenseClientId();
if (!client) return null;
if (process.env.GTM_ID) return null;   // 生产由 GTM 容器注入 loader
return <Script id="adsense-loader" async strategy="afterInteractive" crossOrigin="anonymous"
  src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`} />;
```

挂载点：`app/layout.tsx` 的 `<head>` 内（与现有 GTM `<Script>` 并列）。

## 7. 接入点（5 处 `Masonry`，共 7 个文件）

| # | 文件 | 列表 | `getKey` |
|---|---|---|---|
| 1 | `components/course-filter.tsx` | `currentCourseList`（客户端筛选后） | `course.New_code ?? course.courseCode` |
| 2 | `components/comments.tsx` | `nonReplyComments` | `comment.id` |
| 3 | `components/course/course-instructors.tsx` | `profList` | `data.prof_id ?? index` |
| 4 | `app/professor/[...name]/page.tsx` | `data`（教授的课程） | `course.course_id ?? index` |
| 5 | `app/search/instructor/[...name]/page.tsx` | 每个 AccordionItem 的 `course_list` | `course.courseCode ?? course.New_code ?? index` |
| 6 | `app/catalog/[...departments]/page.tsx` | 给 `CourseFilter` 传 `adSalt` | — |
| 7 | `app/search/course/[code]/page.tsx` | 给 `CourseFilter` 传 `adSalt` | — |

`CourseFilter` 新增 prop：`adSalt: string | null`（必填，避免漏传时静默无广告）。其现有调用方共 2 处（第 6、7 行），都要传。

## 8. 视觉与 CLS

- 广告位与课程卡/评论卡同宽同列，排在命中卡片之后，不改变原有卡片顺序。
- `<ins>` 预留 `min-h-[120px]`（移动）/ `md:min-h-[250px]`（桌面）；AdSense 未填充时保留占位高度、不塌陷（避免广告后出现内容跳动）。
- `Advertisement` 标签用于合规与视觉分隔（旧实现没有标签）。
- 广告位不参与任何筛选/排序逻辑，`CourseFilter` 的筛选结果与广告位置互不影响（选择只依赖 card key）。

## 9. 测试策略（TDD）

| ID | 文件 | 断言 |
|---|---|---|
| T1 | `tests/ads/ad-config.test.ts` | `isAdsenseConfigured()` 在两者都有值时为 true；任一缺失/空串为 false；`getAdsenseClientId()` 返回 null 而不是 `""` |
| T2 | `tests/ads/no-client-salt.test.ts` | 守卫：任何 `'use client'` 源文件不得 import `lib/ads/ad-salt`；`lib/ads/ad-slots.tsx`、`components/ads/**` 不得出现 `Math.random` |
| T3 | `tests/ads/ad-slots.test.ts` | `isAdSlot` 确定性（同参恒等）；1000 个 key 的命中率在 7%~13%；换 salt 后命中集合变化；`rate=0` 恒 false、`rate=1` 恒 true；`withAdSlots`：`salt=null` → 0 个广告、`rate=0` → 0 个、`rate=1` → 每个卡片后都有 1 个（总数 = 卡片数）、同一入参两次调用输出相同 |
| T4 | `tests/components/ad-slot.test.tsx`（jsdom） | 未配置 → 渲染 `null`；已配置 → 渲染 `<ins class="adsbygoogle">` 且 `data-ad-client` / `data-ad-slot` / `data-ad-format` 正确，且含 `Advertisement` 文案；mount 时 `window.adsbygoogle.push` 恰好一次；`data-adsbygoogle-status` 已存在时不 push；push 抛错不影响渲染 |
| T5 | `tests/components/adsense-script.test.tsx` | `CLIENT_ID` 缺失 → 不渲染 script；有 `CLIENT_ID` 且无 `GTM_ID` → 渲染指向 `pagead2.googlesyndication.com` 且带 `client=` 的 script；有 `GTM_ID` → 不渲染 |
| T6 | `tests/components/masonry-ads.test.tsx` | `renderToStaticMarkup` 断言：固定 salt 下列表 HTML 里出现预期数量的 `<ins class="adsbygoogle"` 且位于 `grid` 容器内（证明**广告位进了服务端 HTML**）；`salt=null` 时不出现 |

## 10. 验收标准

- **AC1**：`npm run test`、`npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。
- **AC2**：`components/masonry.tsx` 未被修改（`git diff --stat` 不含该文件）。
- **AC3**：`withAdSlots` / `isAdSlot` 均为纯函数，源码无 `Math.random`。
- **AC4**：第 7 节的 7 个文件全部接入；`CourseFilter` 的两个调用方都传 `adSalt`。
- **AC5**：未配置 AdSense 的环境（CI）下构建产物与现在的行为一致（无广告位、无空洞）。
- **AC6**：线上验证（部署后）：`curl -s https://umeh.top/search/course/CISC | grep -c 'class="adsbygoogle'` ≥ 1，且 `data-ad-client="ca-pub-6229219222351733"`。
- **AC7**：浏览器（生产域名）里广告位显示 `Advertisement` 标签 + 广告或空白占位，不遮挡、不跳动。

## 11. 风险与缓解

| ID | 风险 | 缓解 |
|---|---|---|
| R1 | ISR/静态页面的 salt 被缓存固定（§4.1） | 已接受（D1）；动态搜索页仍是每次请求随机 |
| R2 | `NEXT_PUBLIC_*` 构建期内联 vs Worker 运行时 env 不一致 → 服务端渲染了广告位、客户端 `AdSlot` 返回 null（hydration 警告 + 空洞） | 部署要求：Cloudflare 的 **build 环境与 worker 运行时都配置** `NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_ADS_SLOT_ID`；验证步骤 AC6 通过 curl 断言线上 HTML |
| R3 | 广告拦截器 / AdSense 加载失败 | push 包 `try/catch`；占位高度固定，失败时只留一块 `Advertisement` 占位，不报错、不塌陷 |
| R4 | React StrictMode dev 下 effect 双执行导致重复 push | T4 覆盖；WeakSet + `data-adsbygoogle-status` 双守卫 |
| R5 | 广告位出现在 `CourseFilter` 筛选后的列表里，可能集中在某列 | 属预期（grid 自动流）；不做人工平衡（N4） |
| R6 | GTM 里那个 Custom HTML tag 若被删除，生产广告全失效 | `AdsenseScript` 已内置"无 `GTM_ID` 时自己注入"的兜底；验证 AC6 会暴露 |

## 12. 交付物

- 代码：`lib/ads/ad-config.ts`、`lib/ads/ad-salt.ts`、`lib/ads/ad-slots.tsx`、`components/ads/ad-slot.tsx`、`components/ads/adsense-script.tsx`
- 修改：`app/layout.tsx` + §7 的 7 个文件
- 测试：§9 的 T1–T6
- 文档：本 spec、`docs/superpowers/plans/2026-10-02-next-web-masonry-ads.md`、`docs/superpowers/verification/2026-10-02-masonry-ads.md`
