# next-web GA 埋点设计

> 状态：Draft，等待人工 review
> 日期：2026-10-03
> 前置：`2026-10-02-next-web-masonry-ads-design.md`（生产 GTM 容器现状的取证结论）
> 后续计划：review 通过后，用 `writing-plans` 生成实施计划（Phase 1 → Phase 2，分阶段任务）

---

## 1. 背景

### 1.1 现状取证（不是推测）

拉取生产容器脚本 `https://www.googletagmanager.com/gtm.js?id=GTM-KGF3BFS` 后解析，容器 `GTM-KGF3BFS` 内目前只有 4 个 tag、2 条 rule：

| tag | 类型 | 关键配置 | 触发 |
|---|---|---|---|
| 6 | `__googtag`（Google 标签） | `vtp_tagId = G-V1KZT6Q50E` | `gtm.js`（即 All Pages） |
| 11 | `__gaawe`（GA4 事件） | `vtp_eventName = "UA Report"`，`measurementIdOverride = G-V1KZT6Q50E` | `gtm.init_consent` |
| 8 | Custom HTML | AdSense loader（`ca-pub-6229219222351733`） | `gtm.js` |
| 9 | Custom HTML | Microsoft Clarity（`5cvsgl2c80`） | `gtm.js` |

同一份取证还确认了三件事：

- 容器内**没有任何 `History Change` 触发器**（源码里既无该触发器定义，也无 history 补丁），因此软导航的 `page_view` 不来自容器自建逻辑；
- 容器内**没有 dataLayer 自定义事件通道**（没有任何 Custom Event 触发器）；
- `app/layout.tsx` 只在 `process.env.GTM_ID` 存在时注入 GTM 引导脚本；`NEXT_PUBLIC_MEASUREMENT_ID` 在 `.env.example`、`cloudflare-env.d.ts` 里声明，**没有任何代码消费**。

### 1.2 两个决定设计形态的官方事实

1. **GA4 的增强衡量默认包含"基于浏览器历史事件的页面变化"**，由 `gtag.js` 自动处理 SPA 软导航；而容器的 Google 标签正是加载 `gtag.js`。但官方同时明确警告：**用 GTM 配置标签时不要让 GA 自动追踪历史变化，否则 `page_view` 会双计**，推荐改由 GTM 的 `History Change` 触发器 + Google 标签（`update: true`）负责。
   来源：[衡量单页应用](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications?hl=en)、[使用 GTM 衡量单页应用](https://developers.google.com/analytics/devguides/collection/ga4/measure-spa-gtm?hl=en)
2. **GA4 的每个事件都自动携带 `page_location` / `page_title`**。因此"这个动作发生在哪个课程页/教授页"不需要塞进自定义参数——URL 里已经有了。

第 2 条砍掉了整片复杂度：Phase 2 的所有转化事件都**不需要把 `course_code` / `professor_id` 透传进组件树**。

### 1.3 待解决的问题

站点目前能看到的只有"页面加载"层面的数据：业务事件（搜索了什么、筛选选了什么、从列表点了哪张卡、提交/投票/分享有没有成功）**一条都没有**；而软导航的 `page_view` 归属在 §1.2-1 的两个开关之间尚无定论。本设计同时解决这两件事，并把埋点层做成可测试、可审阅的代码资产，而不是散落各处的 `gtag()` 调用。

---

## 2. 目标与非目标

### 2.1 目标

- **G1** 所有业务事件经**唯一出口** `emit()` → `window.dataLayer.push({ event: "um_event", um_name: "<事件名>", ...params })`；不新增任何 npm 依赖、不注入第二个脚本、代码里不出现 `gtag()` 调用。
- **G2** 事件字典是代码里的**单一事实来源**（`lib/analytics/registry.ts`）；GTM 手工配置清单由脚本从注册表生成，并有测试防止"代码改了、清单没改"的漂移。
- **G3** SSR 安全：服务端渲染路径下不 push、不抛错（`typeof window === "undefined"` 直接 return）。
- **G4** 事件名优先使用 GA4 推荐事件名；事件名与参数名满足 GA4 约束（≤40 字符、`^[a-z][a-z0-9_]*$`、不以 `ga_` / `google_` / `firebase_` 开头），由注册表与测试强制。
- **G5** 不传 PII：禁止 email、Clerk userId / 姓名、评论正文、举报详情、分享链接、任何 URL query 中的个人信息。
- **G6** `page_view` 归 GTM 负责（`History Change` 触发器 + Google 标签 `update: true`），并关闭 GA4 增强衡量的历史页面浏览，保证**只有一方在发** `page_view`。
- **G7** 三层测试：payload / 校验单测、组件行为测试、源码守卫与防漂移测试。
- **G8** Phase 2 的转化事件复用同一套机制，不引入任何新概念（不新增依赖、不新增通道、不新增组件类型）。
- **G9** 交付 spec / plan / verification 三份文档，以及一份可照抄的 GTM+GA4 手工配置清单。

### 2.2 非目标

- **N1** 不改 GTM 容器本体：仓库只交付"生成脚本 + 清单 + 验收步骤"，容器改动由人在 GTM 后台手工完成。
- **N2** 不加 cookie 同意 banner、不改动 Consent Mode（维持现状；隐私政策第 4、5 条已披露 Cookies 与 Google Analytics）。
- **N3** 不做服务端上报（不使用 GA4 Measurement Protocol），不改动任何 API 路由契约。
- **N4** 代码不接管 `page_view`、不写 SPA 路由上报代码。
- **N5** 不引入 GA4 / GTM 客户端库或任何 analytics npm 包；不改 iOS 端与任何公开 API。
- **N6** 不做"排序"埋点——**本应用没有排序功能**（`sort(` 仅出现在服务端数据层 `lib/database/*`、`lib/timetable/common-free.ts`）。
- **N7** 不做 User-ID（不调用 `gtag("set", "user_id", …)`）、不做跨设备识别、不做事件采样、不做离线队列与重试。
- **N8** 不做 AdSense 曝光 / 点击埋点：那属于 AdSense 后台与 GA4「发布商广告」报告的范围，代码侧零工作量。
- **N9** 不改动既有组件的可观测行为（除必要的 client 包装与新增可选 prop）。
- **N10** 不清理 `NEXT_PUBLIC_MEASUREMENT_ID`（保持现状；本设计不使用它，删除它属于无关改动）。

---

## 3. 决策记录（人工已确认）

| # | 决策 | 结论 | 理由 |
|---|---|---|---|
| D1 | 上报通道 | **dataLayer 中转**：代码 push，GA4 标签在 GTM 里配 | 与既有 GTM / Clarity 共存；不用注入第二套 SDK；改参数不发版 |
| D2 | 代码侧 API | **语义化函数层 + 唯一 emit** | 调用点读起来是产品语义；事件名与参数只在一处定义；TS 编译期拦截拼写错误 |
| D3 | `page_view` 归属 | **GTM**（`History Change` + Google 标签 `update: true`） | 官方推荐路径；代码零改动 |
| D4 | 页面浏览类指标 | **不单独埋事件**，用 GA4 内置 `page_location` / `page_path` 报表 | 课程号、教授名、搜索词本就在 URL 路径里，GA4 原生可按页面维度看；再埋一遍是重复数据 |
| D5 | 事件命名 | 优先 **GA4 推荐事件名**（`search` / `view_search_results` / `select_item` / `login`），自造事件用 snake_case | 推荐事件能拿到 GA4 的内置维度与现成报告 |
| D6 | 参数治理 | **注册表 + 脚本生成 GTM 清单 + 防漂移测试** | 桥 A 唯一的真陷阱是"未在容器声明的参数会静默丢失"，用生成脚本把它降级成抄写工作 |
| D7 | 隐私 | 无 banner、无 Consent Mode 改动、payload 无 PII | 与隐私政策现状一致，改动面最小、不损失数据量 |
| D8 | 分期 | Phase 1 浏览类 → Phase 2 转化类，同一份 spec 与 plan | 首个 PR 的可验证面收窄；Phase 2 复用同一机制 |

---

## 4. 架构与数据流

```text
client component（交互点）
  │
  ├─ trackSearch({ term, scope, entryPoint })        lib/analytics/events.ts   ← 语义层（唯一对外 API）
  │        │
  │        └─ emit(name, params)                     lib/analytics/data-layer.ts ← 唯一出口
  │              ├─ typeof window === "undefined" → return          （SSR 安全）
  │              ├─ window.dataLayer ??= []                          （R8 兜底初始化）
  │              ├─ 注册表校验：事件名已知？参数名已注册？值类型/长度合规？
  │              │     ├─ dev（NODE_ENV !== "production"）：不合规 → throw（测试可抓）
  │              │     └─ prod：丢弃该次上报 + console.warn 一次
  │              ├─ 归一：布尔 → 0/1；数字保持数字；字符串截断到 100 字符
  │              ├─ dev：console.debug 一行可读日志
  │              └─ window.dataLayer.push({ event: "um_event", um_name: name, ...params })
  │
  └─ <TrackedLink> / <TrackOnMount>                  components/analytics/*    ← 声明式接线叶子
         （'use client'，内部同样只调 events.ts）

        ▼  dataLayer
   GTM 容器（一次性手工配置，清单由 scripts/print-analytics-manifest.mjs 生成）
        │
        ├─ 触发器 A：自定义事件，事件名精确等于 "um_event"
        │     └─ 标签：Google Analytics: GA4 事件
        │           Measurement ID = G-V1KZT6Q50E
        │           Event Name     = {{DL - um_name}}
        │           事件参数表      = 每个注册参数 → {{DL - <param>}}
        │
        └─ 触发器 B：History Change（带上游过滤，见 R3 缓解）
              └─ 标签：Google 标签（G-V1KZT6Q50E）+ page_location={{Page URL}}
                       + page_title={{Page Title}} + update=true
                       → 软导航的 page_view（唯一来源）
                            │
                            ▼
                   GA4（G-V1KZT6Q50E）→ DebugView / 实时报告 / 自定义维度
```

**一次点击的完整链路（示例）**：用户点课程卡 → `TrackedLink` 的 onClick → `trackSelectItem({...})` → `emit("select_item", {...})` → `dataLayer.push` → GTM 触发器 A 命中 → GA4 事件标签用 `{{DL - um_name}}` 取名 `select_item`、逐参数取值 → GA4 DebugView 出现 `select_item` 且参数齐全；同时 `next/link` 的默认导航照常发生。

---

## 5. 数据层契约

### 5.1 payload 形状（恒定）

```ts
type AnalyticsPayload = {
  event: "um_event";       // 常量：GTM 触发器的唯一锚点，永不改变
  um_name: EventName;      // 真实 GA4 事件名（如 "select_item"）
} & Record<string, string | number>;
```

- **扁平结构**：参数直接挂在根上，GTM 里一个参数对应一个数据层变量（`{{DL - <param>}}`），不需要点路径，手工配置最难出错。
- **包装事件名的理由**：容器里的触发器永远只需要匹配 `um_event` 一个常量，新增事件**零容器改动**；同时 GA4 里的事件名保持干净（`select_item` 而不是 `um_select_item`）。
- **代价（明确接受）**：GTM 的 Preview 里所有事件都显示为 `um_event`，要看真实名字得展开 dataLayer 的 `um_name`；换来的是"上线新事件不需要进容器"。若日后需要为某事件单独挂别的目的地，仍可用 `{{DL - um_name}}` 作为触发器条件。
- **键冲突守卫**：`event`、`um_name`、`um_` 前缀、任何 `gtm.` / `gtm_` 开头的键都不得作为参数名（注册表校验）。

### 5.2 `emit()` 行为

| 场景 | 行为 |
|---|---|
| 服务端渲染 / 无 `window` | 直接 return，不 push、不抛错、不影响 SSR 输出 |
| `window.dataLayer` 不存在 | 初始化为 `[]` 后再 push（GTM 标准做法） |
| 事件名不在注册表 | dev：throw（测试与本地立刻暴露）；prod：丢弃 + `console.warn` 一次 |
| 参数名不在该事件的注册表条目里 | 同上（这是"参数静默丢失"最可能的成因，必须在代码侧就挡住） |
| 缺少必需参数 | dev：throw；prod：丢弃 + warn |
| 布尔值 | 归一为 `1` / `0`（GA4 参数对布尔支持不一致，数字在报表里还能直接求和） |
| 数字 | 保持 number（`result_count`、`position` 等） |
| 字符串超长 | 截断到 100 字符（GA4 字符串参数上限）并 warn |
| `NODE_ENV !== "production"` | 额外 `console.debug("[analytics]", name, params)` 一行 |
| `NODE_ENV === "production"` | 静默（不打印任何日志） |

### 5.3 注册表结构

```ts
type ParamSpec = {
  type: "string" | "number";
  required: boolean;
  maxLength?: number;   // string 专用，默认 100
  note: string;         // 人读说明，会出现在生成的 GTM 清单里
};

type EventSpec = {
  ga4: "recommended" | "custom";
  purpose: string;      // 这个事件回答什么问题
  params: Record<string, ParamSpec>;
  wiring: string;       // 接线文件路径，会出现在生成的清单里
};

export const ANALYTICS_EVENTS: Record<EventName, EventSpec> = { … };
export const FORBIDDEN_PARAM_NAMES: readonly string[] = [ … ];  // 见 5.4
```

注册表同时是**文档**（`note` / `purpose` 进入生成的清单）与**校验源**（`emit()` 与测试都读它）。

### 5.4 参数类型与禁止项

- 事件名 ≤40 字符、参数名 ≤40 字符、单事件参数 ≤25 个（GA4 硬限制，注册表测试断言）。
- **禁止参数名清单**（注册表测试断言它们不出现在任何事件的参数表里）：
  `email`、`user_id`、`userid`、`full_name`、`name`、`clerk_user_id`、`content`、`details`、`comment`、`reply_text`、`url`、`token`、`share_url`、`ip`。
- **禁止值**：任何登录态标识、任何自由文本正文、任何分享/回调 URL。`search_term` 只承载课程/教授关键词（表单已有 4–30 字符校验），且是用户主动输入、用于报告"大家找什么课"的必需信息。
- 事件名不得使用 GA4 保留前缀（`ga_` / `google_` / `firebase_` / `_` 开头）。

---

## 6. 事件字典

### 6.1 命名规范

- 优先 GA4 **推荐事件名**：`search`、`view_search_results`、`select_item`、`login`。好处是 GA4 侧自带内置维度（如 `search_term` 对应的"搜索字词"）与现成报告。
- 自造事件一律 `snake_case`、动词开头的 `对象_动作` 形式：`filter_apply`、`review_submit`、`timetable_share`。
- 参数名同样 `snake_case`，且**不复述 URL 里已有的上下文**（见 D4/§1.2-2）。

### 6.2 Phase 1（浏览类，本次实现）

| 事件 | GA4 类型 | 参数 | 接线点 | 为什么 URL 表达不了 |
|---|---|---|---|---|
| `search` | 推荐 | `search_term`(string,必需)、`search_scope`(string,必需,`course`/`instructor`)、`entry_point`(string,必需,`hero`/`header`/`dialog`) | `components/search/search-form.tsx` `onSubmit` | 提交意图（同一搜索页也可由外链直接到达）；入口来源（首屏大搜索框 / 搜索页顶栏 / 弹窗） |
| `view_search_results` | 推荐 | `search_term`(string,必需)、`search_scope`(string,必需)、`result_count`(number,必需)、`has_results`(number 0/1,必需) | 课程结果：`components/course-filter.tsx`（`trackResults` 存在时 `TrackOnMount`）；讲师结果：`app/search/instructor/[...name]/page.tsx` | 结果数——尤其 `result_count = 0`，这是"教务库缺这门课/这位老师"的唯一信号 |
| `filter_apply` | 自定义 | `filter_name`(string,必需)、`filter_value`(string,必需)、`result_count`(number,必需) | `components/course-filter.tsx` `onValueChange` | 用户真正用了哪个筛选维度（9 个下拉；query 串里的值是 URL 编码的系统字段名，报表里几乎无法聚合） |
| `select_item` | 推荐 | `item_id`(string,必需)、`item_list_name`(string,必需)、`position`(number,必需)、`faculty`(string,可选) | `components/course-card.tsx`、`components/prof-card.tsx` 的链接换为 `TrackedLink` | 点击位置（算列表 CTR / 首屏价值）与来源列表；`faculty` 用于跨列表按学院聚合 |

**参数口径（必须在实现时严格按此，避免"同名不同义"）**

- `result_count`（`view_search_results`）= **服务端返回的原始结果条数**，不受用户后续筛选影响；
- `result_count`（`filter_apply`）= **该次筛选后的列表条数**（与事件同时上报，即"选了这个值之后还剩多少条"）；
- `has_results` = `result_count > 0 ? 1 : 0`（冗余但便于在 GA4 里直接当筛选条件用）；
- `position` = 该卡在**列表数组里的下标**（`withAdSlots` 的 `renderItem(item, index)` 提供），仅统计真实条目，**广告位不计入、不占号**；
- `item_list_name` 取值固定为五个：`catalog`、`search_course`、`search_instructor`、`course_instructors`、`professor_courses`；
- `item_id`：课程卡用 `data.New_code ?? data.courseCode`，讲师卡用 `data.prof_id`，教授页的课程卡用 `data.course_id`；
- `faculty` 仅在数据里真有该字段时带上（`CourseCard` 用 `data.Offering_Unit`；`ProfCard` 没有学院字段就**不带**该可选参数，不硬凑）；
- `entry_point` 直接取 `SearchForm` 的 `variant` 值：`hero`（首页）、`header`（搜索页顶栏 `components/search/search-header.tsx`）、`dialog`（`components/search-button.tsx` 弹窗）。`inline` 在类型里保留但当前无调用方，注册表只为它保留说明、不产生 GTM 变量。

### 6.3 Phase 2（转化类，同一份 spec 定义、分阶段实施）

| 事件 | GA4 类型 | 参数 | 接线点 | 触发时机 |
|---|---|---|---|---|
| `review_submit` | 自定义 | `has_image`(0/1)、`recommend`(number)、`result`(`ok`/`error`) | `components/submit/submit-comment-form.tsx` | `submitComment` 返回后：`result.ok` → `ok`；否则 → `error` |
| `review_vote` | 自定义 | `vote_direction`(`up`/`down`/`emoji`) | `components/review/comment-card.tsx`（`EmojiVote` 的 `handleVote`） | `/api/vote/{id}` 的 promise 成功分支 |
| `review_reply` | 自定义 | `result`(`ok`/`error`) | `components/review/comment-card.tsx` | `submitReply` 的 `toast.promise` 成功/失败分支 |
| `review_report` | 自定义 | `reason`(`spam`/`other`/…)、`has_details`(0/1) | `components/report-dialog.tsx` | 成功分支（`toast.success("Report submitted…")` 之前） |
| `timetable_add_section` | 自定义 | `course_code`(string,必需)、`result`(`ok`/`missing`/`duplicate`/`same-course`,必需) | `components/timetable/planner-provider.tsx` 的 `addSection` | 每次真正进入 `addSection` 的调用；`result` 直接取 `AddResult`（`{ok:true}` → `ok`，`{ok:false,error}` → 该 error 值） |
| `timetable_remove_section` | 自定义 | `course_code`(string,可选) | 同文件 `removeSection` | 每次成功移除；`course_code` 由移除前按 `key` 在 plan 里查得，查不到则省略该可选参数 |
| `timetable_share` | 自定义 | `action`(`create`/`rotate`/`revoke`) | `components/timetable/share-dialog.tsx` | `createOrRotate` / `revoke` 成功分支 |
| `login` | 推荐 | `method`(`modal`/`page`) | `components/providers/clerk-provider-client.tsx` 内新增的登录态跃迁检测 | 会话内 `isSignedIn` 由 false → true 时上报一次（`sessionStorage` 去重） |

Phase 2 参数口径的三处**必须按代码事实写**，不得想当然：

- `review_vote` 的 `vote_direction` 允许三个值，但当前 UI **只有 `emoji` 可达**：`handleVote` 的 ±1 分支虽然存在（`comment-card.tsx:437`），但全文件只有两处调用（`:476`、`:511`）都传 `offset = 0`，`ThumbsUp` / `ThumbsDown` 也只是被 import 而未使用。本设计**不复活** up/down UI，只是把枚举位先留好；因此 Phase 2 上线初期 `vote_direction` 的报表里只会出现 `emoji`。
- `timetable_add_section` 的 `result` 取值来自 `AddResult`（`components/timetable/planner-provider.tsx:39`，error 枚举为 `missing` / `duplicate` / `same-course`）。注意两个调用点（`components/timetable-schedule-card.tsx:78`、`components/timetable/planner-sidebar.tsx:76`）都会在上游短路——"已在课表中"直接 `toast.info` 返回、同课程已存在则改走 `replaceSection`——所以这两个值只在竞态下才会出现，报表里预期以 `ok` 为主。
- 不引入 `section_source`（入口来源）：`addSection(clientRef, section)` 的签名里没有来源信息，要拿到就必须在两个调用点分别埋并把来源透传进 provider，收益不值这个耦合；本设计改为在 provider 单点埋，用 `course_code` 回答"哪些课最常被加进课表"。

Phase 2 的公共约束：

- **不做 props 透传**：课程/教授上下文由 GA4 自动携带的 `page_location` 提供（§1.2-2），因此投票/回复/举报不需要把 `code`/`prof` 传进组件树；
- `login` 用"登录态跃迁"而非 Clerk 回调：Clerk 的 `<SignIn />` 嵌入流程不暴露稳定的成功回调，检测 `useAuth()` 的 false→true 跃迁是可靠且可测的替代方案；
- 失败事件（`result = error`）**只上报状态，不上报错误文案**（错误信息可能含 URL 或用户输入）；
- Phase 2 不新增任何文件类型：仍然只往 `registry.ts` 加条目、往 `events.ts` 加语义函数。

---

## 7. 组件设计与文件清单

### 7.1 新增（7 个源码文件 + 1 脚本 + 1 生成文档）

| 文件 | 职责 | 关键约束 |
|---|---|---|
| `lib/analytics/registry-data.mjs` | 事件字典的**物理数据源**（纯 ESM，无类型标注） | 无 import、无副作用；运行时与生成脚本读的是同一份数据（见 §7.3） |
| `lib/analytics/registry.ts` | 从数据源再导出 + 类型标注 + 禁止项清单 | 纯数据 + 类型，无副作用，可被测试直接 import |
| `lib/analytics/data-layer.ts` | `emit()`：SSR 守卫、注册表校验、归一、dev 日志、唯一 push | **全仓唯一允许出现 `dataLayer.push` 的文件** |
| `lib/analytics/events.ts` | 语义化函数（Phase 1 四个 + Phase 2 八个） | 参数类型由 TS 约束；函数体内只调 `emit()`，不含业务判断 |
| `components/analytics/tracked-link.tsx` | `'use client'`：包 `next/link`，`onClick` 上报后照常导航 | 不 `preventDefault`、不改导航时序；`children` 作为 props 透传 → 服务端渲染的卡片内容仍然是 server component |
| `components/analytics/track-on-mount.tsx` | `'use client'`：挂载上报一次 | `useRef` 去重，StrictMode 双执行下只上报一次；卸载不补发 |
| `lib/course-filters.ts` | 把 `CourseFilter` 里内联的筛选循环抽成纯函数 `applyCourseFilters(data, filter)` | 让 `filter_apply` 能在**事件处理函数内同步**算出"筛选后条数"，而不是在 state 更新的副作用里事后补报（否则计数与事件会错一拍）；纯函数可单测 |
| `scripts/print-analytics-manifest.mjs` | 从 `registry-data.mjs` 生成 `docs/analytics/gtm-setup.md` | 零依赖（见 §7.3） |
| `docs/analytics/gtm-setup.md` | 生成的清单：触发器 / 变量 / 参数行 / GA4 自定义维度 / 验收步骤 | 由脚本生成，人工不得手改（防漂移测试会比对） |

### 7.2 改动（9 个文件，每处改动都很小）

| 文件 | 改动 |
|---|---|
| `components/search/search-form.tsx` | `onSubmit` 中上报 `search`；`entry_point` 取 `variant`，`search_scope` 取 `is_prof ? "instructor" : "course"`，`search_term` 取表单已通过 zod 校验的 `code` |
| `components/course-filter.tsx` | 新增 `listName: string`（必需）与 `trackResults?: { term: string; scope: "course" \| "instructor" }`（可选）；筛选循环改为调用 `applyCourseFilters()`；`onValueChange` 用「新筛选条件 → `applyCourseFilters` → 条数」上报 `filter_apply`；`trackResults` 存在时用 `TrackOnMount` 上报 `view_search_results`（`result_count = data.length`） |
| `app/catalog/[...departments]/page.tsx` | 传 `listName="catalog"` |
| `app/search/course/[code]/page.tsx` | 传 `listName="search_course"` 与 `trackResults={{ term: code, scope: "course" }}` |
| `app/search/instructor/[...name]/page.tsx` | 卡片传 `listName="search_instructor"`；结果集与 0 结果分支各用 `TrackOnMount` 上报 `view_search_results` |
| `components/course-card.tsx` | `<Link>` → `<TrackedLink>`；新增 `listName`、`position` 两个 prop |
| `components/prof-card.tsx` | `ProfCard` / `ProfCourseCard` 的 `<Link>` → `<TrackedLink>`；新增 `listName`、`position` |
| `components/course/course-instructors.tsx` | 传 `listName="course_instructors"` 与 `position` |
| `app/professor/[...name]/page.tsx` | 传 `listName="professor_courses"` 与 `position` |

**设计意图**：`CourseCard` / `ProfCard` 保持 server component（只有它们的链接叶子换成 client 组件，`children` 仍由服务端渲染），因此不引入新的客户端边界扩散，也不影响既有 SSR / ISR / 广告投放行为。

### 7.3 生成脚本如何读取注册表（消除歧义）

`registry.ts` 是 TypeScript 源码，Node 脚本不能直接 import。选定做法：

- `scripts/print-analytics-manifest.mjs` 使用 **`tsx`? 否**（会新增依赖，违反 G1/N5）；
- 采用**同一份数据的双入口**：`lib/analytics/registry.ts` 只是类型安全的再导出，真实数据放在 `lib/analytics/registry-data.mjs`（纯 ESM，无类型标注），由 `registry.ts` `import` 并断言类型。
  - `registry.ts`：`import { ANALYTICS_EVENTS, FORBIDDEN_PARAM_NAMES } from "./registry-data.mjs"` + `export` 类型标注；
  - 脚本：`import { ANALYTICS_EVENTS } from "../lib/analytics/registry-data.mjs"`。
  - 这样脚本与运行时读的是**同一个物理数据源**，漂移不可能发生；代价是数据文件不能写 TS 类型（类型安全由 `registry.ts` 的断言 + 单测保证）。

---

## 8. 接入点细节与边界情况

| 场景 | 期望行为 |
|---|---|
| `SearchForm` 输入不足 4 字符 | zod 校验失败 → `onSubmit` 不执行 → **不上报**（表单已阻止提交） |
| 用户在弹窗里提交搜索 | 上报 `entry_point = "dialog"`，随后弹窗按既有逻辑 100ms 后关闭，不影响上报 |
| 课程搜索返回 0 条 | `CourseFilter` 拿到空数组 → `view_search_results` 带 `result_count = 0, has_results = 0`；页面本身的"无结果"渲染不受影响 |
| 讲师搜索返回 0 条 | `app/search/instructor/[...name]/page.tsx` 的 `data.length === 0` 分支渲染 `TrackOnMount`，同样上报 `result_count = 0`（该分支当前 `return` 得很早，注意把上报组件放进返回的 JSX 里） |
| 同一筛选连点两次相同值 | Radix `Select` 不会对相同值触发 `onValueChange`；若触发则如实上报两次（口径=用户操作，不做去重） |
| `filter_apply` 之后 `CourseFilter` 会 `replaceState` 改 query | 该 `replaceState` 可能触发 GTM 的 `History Change` → 由 R3 的触发器过滤兜住，**不产生** `page_view` |
| 卡片点击后导航 | `TrackedLink` 先同步 push 再放行导航；dataLayer push 是同步内存操作，不会因为页面切换而丢失（SPA 导航不触发页面卸载） |
| 新标签页/中键打开卡片 | `onClick` 仍会触发（mouse 中键会触发 `auxclick` 而非 `click`，因此中键打开**不上报**——口径=真实点击，接受） |
| 广告位出现在列表中 | `position` 只数真实条目，广告位不占号（`withAdSlots` 的 `renderItem` 收到的就是原始下标） |
| 服务端渲染这些组件 | `emit()` 在无 `window` 时直接返回；`TrackOnMount` 只在客户端 `useEffect` 里上报 → 不污染 SSR 输出 |
| React StrictMode（`reactStrictMode: true`） | `TrackOnMount` 用 `useRef` 去重；组件测试必须在 StrictMode 下断言只上报一次 |

---

## 9. GTM / GA4 手工配置清单

清单本体由 `scripts/print-analytics-manifest.mjs` 生成到 `docs/analytics/gtm-setup.md`（含每个参数一行的表格）。以下是**结构与理由**，人工执行一次：

### 9.1 GTM 容器 `GTM-KGF3BFS`

| 步骤 | 对象 | 配置 | 理由 |
|---|---|---|---|
| 1 | 内置变量（变量 → 配置） | 启用 `Page URL`、`Page Title`，以及 History 组里的 `History Source`（若采用"比较去 query 的旧/新路径"方案，再启用 `History Old State` / `History New State`） | 第 5、6 步的过滤与参数取值都依赖它们；未启用时第 5 步的条件根本选不到对应变量 |
| 2 | 变量 | 数据层变量 `um_name`；每个注册参数各一个（`result_count` / `position` 类型选**数字**，其余**字符串**） | 变量名与参数名一一对应，标签里一眼能对上 |
| 3 | 触发器 A | 自定义事件；事件名称**精确等于** `um_event` | 唯一锚点：新增事件永不改容器 |
| 4 | 标签 | `Google Analytics: GA4 事件`；Measurement ID `G-V1KZT6Q50E`；Event Name = `{{DL - um_name}}`；事件参数表逐行 `参数名 → {{DL - 参数名}}`；触发器 = A；**发送电子商务数据保持关闭** | 一个标签承载所有业务事件 |
| 5 | 触发器 B | `History Change` | 软导航 `page_view` 的唯一来源 |
| 6 | 触发器 B 的过滤 | 条件：`History Source` 等于 `pushState`（或自定义 JS 变量比较"去掉 query 的旧/新路径"） | 避免 `CourseFilter` 的筛选 `replaceState` 产生噪声 `page_view`（R3） |
| 7 | 标签 | `Google 标签`，ID `G-V1KZT6Q50E`，配置参数 `page_location = {{Page URL}}`、`page_title = {{Page Title}}`、`update = true`；触发器 = B | 官方 SPA 方案：`update: true` 合并配置且不额外发 `page_view` |
| 8 | 发布 | 提交并**发布**容器版本 | 未发布的版本对访客无效（R9 / AC6） |

**明确不做**：不把第 4 步的标签设为 Google 标签的 setup tag——Google 标签随 `gtm.js` 已经在页面加载时执行，而我们的事件发生在用户交互时，时序天然满足；设成 setup tag 只会让配置在每个事件上重复执行。

### 9.2 GA4 后台（`G-V1KZT6Q50E` 所属属性）

| 步骤 | 操作 | 理由 |
|---|---|---|
| 1 | 关闭 `管理 → 数据收集和修改 → 数据流 → 增强衡量 → 网页浏览 → 基于浏览器历史事件的页面变化` | 与 §9.1 第 5、7 步双计（§1.2-1 官方警告） |
| 2 | `管理 → 自定义定义 → 自定义维度`：把每个自定义参数注册为**事件级**维度 | 未注册的参数只在 DebugView 可见，报表里用不上 |
| 3 | 可选：把 `review_submit` / `timetable_share` 等标记为转化 | 便于看转化漏斗 |

---

## 10. 测试策略（TDD）

| 层 | 文件 | 断言 |
|---|---|---|
| 单元 | `tests/analytics/data-layer.test.ts` | payload 恒为 `{event:"um_event", um_name, ...params}`；无 `window` 时不 push 且不抛错；`window.dataLayer` 缺失时被初始化为数组；未注册事件名/参数名在 dev 抛错、在 prod 丢弃且 warn 一次；缺必需参数 dev 抛错；布尔归一为 1/0；数字保持 number；超长字符串截断到 100 且 warn；payload 里不出现 `undefined` 值 |
| 单元 | `tests/analytics/registry.test.ts` | `registry-data.mjs` 能被 Node 直接 import（脚本与运行时同源）；事件名/参数名满足 `^[a-z][a-z0-9_]*$` 且 ≤40 字符；非保留前缀；单事件参数 ≤25；`FORBIDDEN_PARAM_NAMES` 不出现在任何事件参数表；每个 `wiring` 指向的文件真实存在（防文档腐烂）；`recommended` 事件名在白名单内 |
| 单元 | `tests/analytics/events.test.ts` | 每个语义函数的入参到 payload 的映射正确（含可选参数缺省时不出现该键） |
| 单元 | `tests/course-filters.test.ts` | `applyCourseFilters()` 与既有筛选语义逐项一致（9 个维度、`All` 表示不过滤、`Is_Offered` 的 `Offered`/`Not Offered` → 1/0 映射）；空结果返回空数组 |
| 组件 | `tests/components/search-form-analytics.test.tsx` | 合法提交 → `search` 事件且 `entry_point` = 传入 variant；`is_prof` 切换 → `search_scope = "instructor"`；校验失败 → 无上报 |
| 组件 | `tests/components/course-filter-analytics.test.tsx` | 切换下拉 → `filter_apply` 三参数正确（`result_count` = 筛选后条数）；`trackResults` 存在 → 挂载上报一次 `view_search_results`；StrictMode 下仍只上报一次；无 `trackResults` → 不上报 |
| 组件 | `tests/components/tracked-link.test.tsx` | 点击 → `select_item` 带 `item_id`/`item_list_name`/`position`；`href` 未被改写；可选 `faculty` 缺失时不出现在 payload |
| 守卫 | `tests/analytics/wiring.test.ts` | 源码扫描：除 `lib/analytics/data-layer.ts` 外无 `dataLayer` 直接写入、无 `gtag(`；`events.ts` 里用到的参数名全部在注册表内；`CourseCard`/`ProfCard` 中不存在裸 `next/link` 的 `<Link>` 直连；`docs/analytics/gtm-setup.md` 与脚本生成结果**逐字一致**（防漂移） |

测试写法、目录与命名遵循仓库既有惯例（`tests/ads/*`、`tests/components/*`；`vitest.config.ts` 中 `tests/components/**` 走 jsdom，其余走 node）。

---

## 11. 验收标准

- **AC1** `npm run test` 全绿（现有 105 个文件 / 337 个测试 + 新增 8 个测试文件）；`npm run lint`、`npx tsc --noEmit`、`npm run build` 全部通过。
- **AC2** §10 表格里的全部断言有对应测试且通过。
- **AC3** 无新增依赖（`package.json` 的 dependencies/devDependencies 不变）；`npm run build` 的 shared First Load JS 增量 < 3 kB（对比 `main` 基线输出）。
- **AC4** 手工（GTM Preview + 本地 `npm run dev`）：Phase 1 四个事件逐条核对 dataLayer payload；**并在 GA4 DebugView 里逐参数核对"每个参数都有值、没有 not set"**——这是桥 A 唯一的静默失败点。
- **AC5** 手工（GA4 实时报告）：① 首屏只有 1 条 `page_view`；② 点课程卡进课程页后出现第 2 条 `page_view`；③ **改动任一筛选下拉不产生 `page_view`**；④ 浏览器后退一次产生正确的 `page_view`。
- **AC6** 手工：GTM 容器**提交并发布**后，线上 `umeh.top` 复验一次（否则 AC4/AC5 的结论只对本地/预览有效）。
- **AC7** payload 无 PII：守卫测试断言禁止键清单；人工核对一次一次真实事件的 DebugView 截图/记录。
- **AC8** Phase 2 的事件清单在本 spec 中固定，实施时如新增事件，必须同时更新注册表、清单与测试（由守卫测试强制）。

---

## 12. 风险与缓解

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | GTM 的 GA4 事件标签 **Event Name 字段若不允许填变量**，桥 A 不成立 | 桥 A 整体失效 | 已在容器运行时源码中确认该值走 `makeString(vtp_eventName)`（变量在进入标签前解析），但 UI 层未 100% 证实 → **Phase 1 第一个任务先做 10 分钟 GTM 冒烟验证**（配一个最小 `um_event` 标签，本地手动 push 一次，看 DebugView）；失败则整体切桥 C（Custom HTML 桥：1 触发器 + 1 Custom JS 变量 + 1 Custom HTML 标签，代码侧的 `emit()` 与字典**完全不用改**） |
| R2 | 参数未在 GTM 容器声明 → 静默丢失 | 事件在 GA4 里参数为空，白埋 | 生成清单 + 防漂移测试 + AC4 的 DebugView 逐参数核对 |
| R3 | `CourseFilter` 的 `window.history.replaceState` 触发 `History Change` → 每次筛选产生噪声 `page_view` | `page_view` 指标被污染 | §9.1 第 6 步的触发器上游过滤；AC5-③ 专门核对 |
| R4 | Next.js 内部的 `replaceState` / 浏览器回退 → `page_view` 漏计或重计 | 页面浏览数据不准 | AC5-① ② ④ 覆盖前进与后退路径 |
| R5 | 新增事件绕过注册表、口径漂移 | 字典失效、报表口径混乱 | 守卫测试（唯一 push 出口 + 注册表校验 + `wiring` 文件存在性） |
| R6 | StrictMode 双执行 / 组件重挂载 → 重复上报 | 事件数虚高 | `TrackOnMount` 用 ref 去重；组件测试在 StrictMode 下断言"只发一次" |
| R7 | GA4 参数限制（每事件 ≤25、名称 ≤40、字符串 ≤100 字符） | 参数被 GA4 截断/丢弃 | 注册表测试断言上限；`emit()` 运行时截断 + warn |
| R8 | `window.dataLayer` 尚未初始化 | push 抛错、丢事件 | `emit()` 中按 GTM 标准做法兜底初始化数组 |
| R9 | 事件只在本地可见、线上无数据 | 上线后误判"埋点没生效" | AC6 要求先发布容器版本再复验；verification 文档记录容器版本号 |
| R10 | `TrackedLink` 替换 `<Link>` 时误伤导航（例如阻止默认行为、丢 `prefetch`） | 用户体验回归 | 组件测试断言 `href` 未被改写、默认行为未被阻止；接入后核对 `next/link` 的 `prefetch` 行为不变 |

---

## 13. 交付物

1. `docs/superpowers/specs/2026-10-03-next-web-ga-analytics-design.md`（本文）
2. `docs/superpowers/plans/2026-10-03-next-web-ga-analytics.md`（由 `writing-plans` 生成，Phase 1 / Phase 2 分阶段任务）
3. `docs/analytics/gtm-setup.md`（脚本生成的 GTM + GA4 手工配置清单）
4. 源码：`lib/analytics/*`（含 `registry-data.mjs`）、`components/analytics/*`、`lib/course-filters.ts`、`scripts/print-analytics-manifest.mjs`，以及 §7.2 的 9 处接线改动
5. 测试：`tests/analytics/*`、`tests/course-filters.test.ts`、`tests/components/search-form-analytics.test.tsx`、`tests/components/course-filter-analytics.test.tsx`、`tests/components/tracked-link.test.tsx`
6. `docs/superpowers/verification/2026-10-03-next-web-ga-analytics.md`（实施后的验证记录，含 AC1–AC8 证据与 GTM 容器版本号）
