# GA Analytics (Phase 1) Verification — 2026-10-03

## Status

Phase 1（埋点层：事件注册表 + 唯一 dataLayer 写入口 + `search` / `view_search_results` / `filter_apply` / `select_item` 四个事件 + 9 处接线 + 由注册表生成的 GTM 清单）已全部实现，10 个 task 的产物都在工作分支 `feat/ga-analytics-phase1` 上。

- 分支：`feat/ga-analytics-phase1`（基于 `main`，21 个 commit）
- **未合并、未 push、未部署**；线上 `umeh.top` 仍是旧版本，本文所有结论只对本地生产构建成立
- Phase 2 的 8 个转化类事件（`review_submit` / `review_vote` / `review_reply` / `review_report` / `timetable_add_section` / `timetable_remove_section` / `timetable_share` / `login`）**未实现**，见 AC8 一节
- 表格里所有数字都是本轮在本机实测输出，没有估算值；未执行的人工步骤在文中明确标为"未完成"

## Commits

`git log --oneline main..HEAD` 的逐条输出（自下而上为时间顺序）：

- `14a900c feat(analytics): event registry as the single source of truth`
- `ae0c336 feat(analytics): single dataLayer emit with registry validation`
- `69c2831 docs(plan): correct the emit lookup type narrowing (TS7053)`
- `842838f fix(analytics): harden the emit guard against prototype keys and wrong value types`
- `1d3cb76 refactor(analytics): use the es5-safe hasOwnProperty form in the emit guard`
- `faf2087 docs(plan): annotate task 3 with the post-review hardening`
- `25f1ea3 docs(analytics): name the actual hasOwnProperty form in the emit comment`
- `0081370 feat(analytics): semantic event functions for the phase 1 events`
- `696e7ad refactor(catalog): extract course filtering into pure functions`
- `7e9effc docs(plan): reconcile the filter state type and cover the dev debug log`
- `363d2d5 feat(analytics): client tracking leaves for card clicks and search results`
- `817b234 test(analytics): silence the dev log and tighten the faculty assertion`
- `eeb5db9 test(analytics): silence the dev log in the component tracking tests`
- `4f66525 feat(analytics): report search submissions with their entry point`
- `f0b7339 test(analytics): pin the card push count and cover the production log path`
- `8fee119 feat(analytics): report card clicks with list name and position`
- `7d9f492 feat(analytics): report filter changes and search result counts`
- `456ae78 feat(analytics): generate the gtm manifest from the registry with drift guards`
- `2f2f1a3 test(analytics): pin the offered-label filter value and the Is_Offered fallback`
- `da0cef6 docs(plan): keep the generated manifest pure and move the smoke record to verification`
- `ea35ade chore(analytics): derive the manifest counts and widen the data-layer guard`

最后一个 commit 是本轮收尾时做掉的 Task 10 复查遗留项（清单计数改为从注册表派生、DebugView 措辞修正、`wiring.test.ts` 防漂移断言钉死成功行、源码扫描放宽到 `.js`/`.jsx`/`.mjs`），与验收正文分开提交。

## Commands run

| 命令 | 结果 |
|---|---|
| `npm run test` | **124 files / 466 tests passed**，exit 0（5.78s） |
| `npm run lint` | `✔ No ESLint warnings or errors`，exit 0 |
| `npx tsc --noEmit` | exit 0，无输出 |
| `npm run build` | exit 0；`First Load JS shared by all` = **87.6 kB** |
| `node scripts/print-analytics-manifest.mjs --check` | `[analytics] gtm-setup.md is in sync with the registry`（exit 0） |

测试文件数说明：spec 写作时预期 105 + 9 = 114 个文件，但 `main` 上现在已经不止 105 个——本轮实测 `main` 有 **115** 个测试文件，HEAD 有 **124** 个（`git ls-tree` 计数），即本分支新增 9 个测试文件（`tests/analytics/*` 4 个、`tests/components/{tracked-item-link,track-search-results,course-card-analytics,course-filter-analytics}.test.tsx`、`tests/course-filters.test.ts`）并扩展了既有 `tests/components/search-form.test.tsx`，与 spec §10 的清单逐条对应。

清单自检（Step 4，逐条核对生成的 `docs/analytics/gtm-setup.md`，用脚本对比注册表而不是目测）：

```js
// 从 registry-data.mjs 取全部参数名，与清单 §1 变量表、§4 参数行逐项比对
import { readFileSync } from "node:fs";
import { ANALYTICS_EVENTS } from "./lib/analytics/registry-data.mjs";
const params = [...new Set(Object.values(ANALYTICS_EVENTS).flatMap((s) => Object.keys(s.params)))].sort();
const doc = readFileSync("docs/analytics/gtm-setup.md", "utf8");
const vars = [...new Set([...doc.matchAll(/^\| `DL - ([a-z_]+)` \|/gm)].map((m) => m[1]))].sort();
const rows = [...new Set([...doc.matchAll(/^\| `([a-z_]+)` \| `\{\{DL - \1\}\}` \|$/gm)].map((m) => m[1]))].sort();
console.log("registry params (" + params.length + "):", params.join(","));
console.log("vars cover all params:", params.every((p) => vars.includes(p)));
console.log("rows cover all params:", params.every((p) => rows.includes(p)));
console.log("history filter:", /History Source` 等于 `pushState/.test(doc));
console.log("ga4 switch 1 (enhanced measurement):", /增强衡量 → 网页浏览 → 基于浏览器历史事件的页面变化/.test(doc));
console.log("ga4 switch 2 (event-scoped custom dimensions):", /事件级\*\*自定义维度/.test(doc));
```

以 `node --input-type=module -e` 跑上面这段，实测输出：

```text
registry params (11): entry_point,faculty,filter_name,filter_value,has_results,item_id,item_list_name,position,result_count,search_scope,search_term
vars cover all params: true
rows cover all params: true
history filter: true
ga4 switch 1 (enhanced measurement): true
ga4 switch 2 (event-scoped custom dimensions): true
```

只跑埋点相关的子集也是全绿（用于确认新增断言真的在跑）：

```bash
npx vitest run tests/analytics tests/components/course-card-analytics.test.tsx \
  tests/components/track-search-results.test.tsx tests/components/tracked-item-link.test.tsx \
  tests/components/course-filter-analytics.test.tsx tests/course-filters.test.ts \
  tests/components/search-form.test.tsx
# → Test Files 10 passed (10) / Tests 78 passed (78)
```

## Bundle evidence (AC3)

**测量方法**：`npm run build`（Next 14.2.35），从路由表里读 `First Load JS shared by all`。为了不拿历史数字做唯一依据，本轮**在同机同工具链上重新构建了一份 `main` 基线**：`git archive main | tar -x` 到独立目录、软链同一份 `node_modules`、拷贝同一份 `.env.local`，然后在该目录里跑同一条 `npm run build`。两次数值因此可直接相减。

| | `First Load JS shared by all` | 组成 |
|---|---|---|
| `main`（本轮新建基线） | **87.6 kB** | `chunks/119` 31.9 + `chunks/4f051027` 53.6 + other shared 2.01 |
| `feat/ga-analytics-phase1` | **87.6 kB** | `chunks/2117` 31.9 + `chunks/fd9d1056` 53.6 + other shared 2 |
| 历史参照（2026-10-02 masonry 记录） | 87.6 kB | — |

**增量 ≈ 0.0 kB**，AC3 的 "< 3 kB" 成立（两条基线数字打印精度都只到 0.1 kB，差值在打印精度以下）。

路由级 `First Load JS` 的差值同样只落在真正接线的页面上：

| 路由 | `main` | HEAD | Δ |
|---|---|---|---|
| `/` | 157 kB | 159 kB | +2 kB |
| `/catalog/[...departments]` | 135 kB | 138 kB | +3 kB |
| `/course/[code]` | 119 kB | 122 kB | +3 kB |
| `/professor/[...name]` | 106 kB | 108 kB | +2 kB |
| `/search/course/[code]` | 135 kB | 138 kB | +3 kB |
| `/search/instructor/[...name]` | 111 kB | 114 kB | +3 kB |
| 其余 19 条路由（`/privacy-policy`、`/terms-of-service`、`/admin/*`、`/reviews/*`、`/submit/*`、`/timetable`、`/sign-in` 等） | — | — | **+0.00 kB** |

（`/compare/[token]` 是 −1 kB，与埋点无关，是它自己的 chunk 重排噪声。）

### 客户端 chunk 泄漏检查（grep 构建产物）

```bash
grep -rl "um_event"     .next/static/chunks --include='*.js'
grep -rlF "[analytics]" .next/static/chunks --include='*.js'
```

两条命令命中**完全相同**的两个文件：

| chunk | 大小（raw / gzip） | 谁加载它 |
|---|---|---|
| `chunks/7462-f6da83f1b2d49832.js` | 9,367 B / 3,845 B | 只被接线页面加载：`/catalog/[...departments]`、`/course/[code]`、`/professor/[...name]`、`/search/course/[code]`、`/search/instructor/[...name]`（据 `.next/app-build-manifest.json`）；内含 `TrackedItemLink` |
| `chunks/9249-f01856747bff8504.js` | 12,218 B / 4,641 B | `SearchForm` 所在 chunk（root layout 的顶栏搜索弹窗），`/layout`、`/page`、`/search/layout` 都引用它 |

**三个组成 `First Load JS shared by all` 的 chunk（`2117` 124,729 B、`fd9d1056` 172,837 B、other shared 2 kB）里没有任何 `um_event` / `[analytics]` 字符串**——埋点层没有被塞进"每页都加载的共享 chunk"，符合 AC3 的意图。

关于 `chunks/9249`，需要如实说清楚（这是本轮实测发现的唯一一处"每页都会下载到埋点字节"）：

- 它同时含 `SearchForm` 与 analytics 模块，因为 `components/search/search-form.tsx` 调用 `trackSearch`，而顶栏搜索弹窗在 root layout 里，所以每一页都会以 `<script async>` 加载这个 chunk。这是**既有依赖**的延续，不是新增的共享 chunk：`main` 上 `SearchForm` 的代码位于每页都加载的 `chunks/app/layout-*.js`（30,072 B / gzip 8,426 B），HEAD 上它被提升成独立 chunk `9249`（12,218 B）并把 layout 缩到 23,120 B（6,652 B）。
- 直接量预渲染 HTML 里所有 `<script src>` 的字节数（不依赖 Next 的指标口径）：无埋点页面 `/privacy-policy` 由 `main` 的 787,695 B 变成 HEAD 的 **792,890 B（+5,195 B raw）**，gzip 口径 8,426 → 6,652 + 4,641 = **11,293 B（+2,867 B）**。
- 其中埋点本体占多少：`lib/analytics/events.ts` 作为入口 bundle（含 `data-layer.ts` / `registry.ts` / `registry-data.mjs`）用 `npx esbuild --bundle --minify --format=esm --define:process.env.NODE_ENV='"production"'` 实测 **5,661 B raw / 2,230 B gzip**。两数相减的剩余 637 B gzip 归因于 chunk 拆分本身的开销（不是埋点代码）。
- 结论：共享 chunk 指标不变（87.6 kB，AC3 通过），但"只在用到埋点的页面付这份字节"在**顶栏搜索**这一处不成立——这是设计与数据表现一致的取舍（顶栏搜索框在所有页面都在），记录在下面的 known limitations 里。

依赖未变（AC3 的另一半）：

```bash
git diff --stat main..HEAD -- package.json package-lock.json
#  package.json | 3 ++-
git diff main..HEAD -- package.json
# 只有 scripts 里新增一行 "analytics:manifest"，dependencies / devDependencies 未改动
# package-lock.json 无改动
```

## Behavior verification

### AC1 — 全量测试/静态检查/构建全绿

- [x] `npm run test` 124 files / 466 tests passed；`npm run lint` 无告警；`npx tsc --noEmit` exit 0；`npm run build` exit 0（见上一节表格）

### AC2 — spec §10 表格里的每一条断言都有对应测试且通过

- [x] `tests/analytics/data-layer.test.ts`（20 条）：payload 恒为 `{event:"um_event", um_name, ...params}`；无 `window` 时不 push 且不抛错；`window.dataLayer` 缺失时被初始化；未注册事件名/参数名 dev 抛错、prod 丢弃且只 warn 一次；原型链键名（`constructor` 等）不被当作已知事件/参数；缺必需参数 dev 抛错；保留名（`event` / `um_name` / `um_*` / `gtm*`）被拒；布尔归一为 1/0、数字保持 number；类型不符 dev 抛错、prod 丢弃；`undefined`/`null` 不出现在 payload；超长字符串截断到 100 且 warn
- [x] `tests/analytics/registry.test.ts`（7 条）：注册表就是 Phase 1 的四个事件；事件名/参数名满足 `^[a-z][a-z0-9_]*$`、≤40 字符、非保留前缀、单事件参数 ≤25；`FORBIDDEN_PARAM_NAMES` 不出现；不与 payload 形状/`Object.prototype` 成员冲突；`recommended` 事件名在白名单内；每个 `wiring` 指向的文件真实存在；`registry-data.mjs` 能被纯 Node import（无 `import`/`require`）
- [x] `tests/analytics/events.test.ts`（10 条）：四个语义函数的入参→payload 映射；`faculty` 缺省时不出现该键；`result_count=0` → `has_results=0`；dev 打一行可读日志、prod 静默；**"only ever emits parameters that the registry knows"**——四个函数各发一次，逐 payload 断言每个键都在注册表内（等价于 spec 里"`events.ts` 用到的参数名全部在注册表内"，dev 下未注册参数会直接抛错，所以这条断言是硬的）
- [x] `tests/course-filters.test.ts`（10 条）：9 个维度的顺序与初值；`Offered`/`Not Offered`/`All` → `1`/`0`/`All` 三态映射与非法值回退；多维度 AND；空结果；不改动入参与原状态
- [x] `tests/components/search-form.test.tsx`（**扩展**，不新建重复文件）：合法提交 → `search` 事件且 `entry_point` 等于传入 variant（`inline` / `hero`）；`is_prof` 打开 → `search_scope="instructor"`；校验失败（<4 字符）→ 不上报
- [x] `tests/components/course-card-analytics.test.tsx`（3 条）：`href` 仍指向 `/course/<code>`；点击 → `select_item` 带 `item_id`/`item_list_name`/`position`/`faculty`；无 `Offering_Unit` 时不带 `faculty`。`ProfCard` 是 async server component，RTL 不能直接渲染 → 由 `tests/analytics/wiring.test.ts` 的源码断言覆盖（`LIST_CALLERS` 含 `app/professor/[...name]/page.tsx` 等 4 处传 `listName`）
- [x] `tests/components/course-filter-analytics.test.tsx`（6 条）：用真实 DOM 交互驱动 Radix 下拉 → `filter_apply` 三参数正确且 `result_count` = 筛选后条数；`Is_Offered` 上报标签值（`Offered`）而非数字；清回 `All` 也上报；有 `trackResults` → 挂载上报一次 `view_search_results`；0 结果 → `has_results=0`；catalog 页（无 `trackResults`）不上报
- [x] `tests/components/tracked-item-link.test.tsx`（5 条）：`href` 未被改写；点击 → `select_item` 三参数；可选 `faculty` 缺失时不出现在 payload；不阻止默认导航；StrictMode 下只上报一次
- [x] `tests/components/track-search-results.test.tsx`（5 条）：挂载上报一次；0 结果；渲染 `null`；StrictMode 下只上报一次；`resultCount` 变化不重复上报
- [x] `tests/analytics/wiring.test.ts`（7 条源码守卫）：除白名单（`lib/analytics/data-layer.ts` + `app/layout.tsx` 的 GTM 引导字面量）外无 `dataLayer` 直接写入；无 `gtag(`；`CourseCard`/`ProfCard` 不再直接 `from "next/link"`；4 个列表调用点都传 `listName`；两个搜索结果面都接 `TrackSearchResults`；两个客户端叶子带 `"use client"` 且没有回调 prop；`docs/analytics/gtm-setup.md` 与脚本生成结果逐字一致（`--check` exit 0 且成功行逐字钉死）
- [x] 本轮顺带补强（`ea35ade`）：源码扫描从 `.ts`/`.tsx` 放宽到 `.js`/`.jsx`/`.mjs`（否则 `.mjs` 的埋点辅助文件可以直接写 `window.dataLayer` 而守卫全绿）；用临时文件 `lib/analytics/tmp-guard-probe.mjs` 探针验证过——放宽前该文件不报、放宽后 `expected [ 'lib/analytics/tmp-guard-probe.mjs' ] to deeply equal []`，探针已删除

### AC3 — 无新依赖 + shared First Load JS 增量 < 3 kB

- [x] 见 "Bundle evidence" 一节：依赖未变；shared 87.6 kB → 87.6 kB（Δ ≈ 0.0 kB）；埋点字符串只出现在 `chunks/7462`（接线页面）与 `chunks/9249`（顶栏 SearchForm），不在三个 shared chunk 里

### AC4 — 手工：GTM Preview 逐条核对四个事件的 dataLayer payload + GA4 DebugView 逐参数核对

- [ ] **未完成（需人工）**：步骤与责任人见 `## Outstanding manual steps` 的 (a)(b)。生成的核对清单是 `docs/analytics/gtm-setup.md` §7.1、§7.2
- 代码侧可自动保证的部分已覆盖：payload 形状由 `data-layer.test.ts` 钉死、参数名与注册表一致由 `events.test.ts` 钉死、清单与注册表一致由 `wiring.test.ts` 钉死——即"GTM 里该声明哪些参数"这件事不会静默漂移

### AC5 — 手工：GA4 实时报告的 page_view 行为（首屏 1 条 / 点卡后第 2 条 / 改筛选不产生 / 后退产生 1 条）

- [ ] **未完成（需人工）**：步骤见 `## Outstanding manual steps` 的 (b)
- 风险 R3 的代码侧前提已具备：`filter_apply` 走的是 `window.history.replaceState`，生成的清单 §2 给 `Trigger - History Change` 写了上游过滤 `History Source 等于 pushState`，因此筛选改 query 不会产生噪声 `page_view`

### AC6 — 手工：容器发布后线上复验

- [ ] **未完成（需人工）**：见 `## Outstanding manual steps` 的 (d)；容器版本号与线上复验结论发布后回填本文件（风险 R9 要求记录容器版本号）

### AC7 — payload 无 PII

- [x] 自动守卫：`registry.test.ts` 断言 `FORBIDDEN_PARAM_NAMES`（email / user_id / name / content / details / comment / reply_text / url / token / share_url / ip 等 14 项）不出现在任何事件的参数表；`data-layer.test.ts` 断言保留名（`event` / `um_name` / `um_*` / `gtm*`）被拒；`events.test.ts` 断言 payload 的键只可能来自注册表——payload 的形状因此被限制为 `{event, um_name, <注册表内的短枚举/数字参数>}`，没有自由文本字段
- [ ] 人工：一次真实事件在 DebugView 里的截图/记录——**未完成**，随 AC4 一起做

### AC8 — Phase 2 事件清单固定，新增必须同时更新注册表/清单/测试

- [x] Phase 2 的 8 个事件本轮未实现（不在范围内）
- [x] 强制机制在位：`registry.test.ts` 的 `declares the phase 1 events` 精确钉住当前 4 个事件名，加事件必须先改测试；`wiring.test.ts` 的清单防漂移断言（`--check` 逐字一致 + 成功行钉死）要求重新生成 `docs/analytics/gtm-setup.md`；"唯一 dataLayer 写入口""无 `gtag(`"两条守卫对新事件自动生效
- [x] 生成的清单 §7.1 的事件数已从注册表派生（`逐条触发全部 ${Object.keys(ANALYTICS_EVENTS).length} 个事件`），Phase 2 加事件后重新生成即自动更新，不会再出现"文档写四个、注册表有十二个"的漂移

## Outstanding manual steps

责任人：**项目所有者（人工，需要浏览器 + GTM 账号）**；代码侧无待办。

### (a) GTM 容器配置（照抄 `docs/analytics/gtm-setup.md`）

容器 `GTM-KGF3BFS`，Measurement ID `G-V1KZT6Q50E`。

- [ ] §1 建 12 个数据层变量：`DL - entry_point` / `DL - faculty` / `DL - filter_name` / `DL - filter_value` / `DL - has_results`(=数字) / `DL - item_id` / `DL - item_list_name` / `DL - position`(=数字) / `DL - result_count`(=数字) / `DL - search_scope` / `DL - search_term` / `DL - um_name`
- [ ] §1 内置变量启用：`Page URL`、`Page Title`、`History Source`
- [ ] §2 触发器：`Trigger - um_event`（自定义事件，事件名称**精确等于** `um_event`）；`Trigger - History Change`（附加上游过滤 `History Source` 等于 `pushState`——R3 的噪声 `page_view` 就靠这一条挡住）
- [ ] §3 标签：`GA4 Event - um_event`（Measurement ID = `G-V1KZT6Q50E`；Event Name = `{{DL - um_name}}`；发送电子商务数据 **关闭**；触发器 `Trigger - um_event`）；`Google Tag - SPA update`（ID = `G-V1KZT6Q50E`；`page_location={{Page URL}}`、`page_title={{Page Title}}`、`update=true`；触发器 `Trigger - History Change`）
- [ ] §4 在 GA4 事件标签里逐行照抄 11 个参数行（`entry_point` / `faculty` / `filter_name` / `filter_value` / `has_results` / `item_id` / `item_list_name` / `position` / `result_count` / `search_scope` / `search_term`，值均为 `{{DL - …}}`）
- [ ] §7.1 GTM 预览里逐条触发全部 4 个事件，确认标签被触发、`um_name` 解析成正确的事件名

### (b) GA4 后台开关 + DebugView 逐参数核对（AC4 / AC5-①②③④）

- [ ] `管理 → 数据收集和修改 → 数据流 → 增强衡量 → 网页浏览 → 基于浏览器历史事件的页面变化`**关闭**（否则与 §3 的 Google Tag 双计 `page_view`）
- [ ] `管理 → 自定义定义 → 自定义维度`：把 §4 的每个参数注册为**事件级**自定义维度（不注册则只能在 DebugView 看到，报表里查不到）
- [ ] `管理 → 数据收集和修改 → 数据流 → 增强衡量`：确认"网页浏览"的其余项按预期工作
- [ ] （可选）把关键事件标记为转化
- [ ] AC4：DebugView 里对四个事件逐参数核对——**该事件在注册表里声明的**参数都要有值，没有 `not set`（未声明为该事件参数的可选参数不出现属正常，例如 `search` 事件本来就没有 `faculty`）
- [ ] AC5：① 首屏只有 1 条 `page_view`；② 点课程卡进课程页后出现第 2 条 `page_view`；③ 改动任一筛选下拉**不产生** `page_view`；④ 浏览器后退一次产生正确的 `page_view`
- [ ] AC7 人工部分：把一次真实事件的 DebugView 记录/截图留档到本文件

### (c) R1 冒烟验证：GA4 事件标签的 Event Name 能否用变量（**未执行，本轮未做**）

桥 A（1 个 `um_event` 事件 + 1 个变量化的 Event Name）是否成立取决于 GTM UI 让不让 Event Name 填变量；spec §12 R1 说容器运行时源码里该值走 `makeString(vtp_eventName)`（说明变量在进标签前解析），但 UI 层没 100% 证实。Phase 1 的第一个 task 原计划做这个 10 分钟冒烟，**本轮结束时仍未做**，故按控制器裁定 R16 记录在这里（不写进生成的清单）：

1. 在容器里配好 §3 的最小 `GA4 Event - um_event` 标签（Event Name = `{{DL - um_name}}`）与 `Trigger - um_event`
2. 用 GTM 预览打开本地 `npm run dev` 的页面，在控制台手动执行一次 GTM 标准 push：
   `window.dataLayer.push({ event: "um_event", um_name: "search", search_term: "TEST1234", search_scope: "course", entry_point: "hero" })`
3. 在 GA4 DebugView 里确认出现事件名 `search`（而不是 `um_event` 或空名）且参数齐全

若第 2–3 步失败（Event Name 不接受变量）→ 按 spec §12 R1 的整体降级方案切**桥 C**：1 个触发器 + 1 个 Custom JS 变量 + 1 个 Custom HTML 标签；代码侧 `emit()` 与注册表**完全不用改**。

### (d) 发布容器版本并线上复验（AC6）

- [ ] GTM 里 `提交` → `发布` 容器版本，记录**容器版本号**（填到本节与 `## Status`）：`________`
- [ ] 发布后回到线上 `umeh.top`（需先合并并部署本分支）复验一次 AC4 / AC5 的四条 `page_view` 行为与参数核对——否则上面的结论只对本地/预览有效
- [ ] 本分支的合并与部署本身也是人工步骤（当前 `feat/ga-analytics-phase1` 尚未合并、尚未部署，线上 `umeh.top` 没有埋点）

## Known limitations / accepted trade-offs

- **讲师搜索页的 `position` 会在每个手风琴里重新从 0 开始。** `app/search/instructor/[...name]/page.tsx` 按讲师分组渲染，每组的 `CourseCard` 拿到的 `position` 是组内下标，而 `item_list_name` 统一是 `search_instructor`。因此同一 `item_list_name` 下 `position` 会重复出现。GA4 里"列表第 2 位点击率"这类按 `position` 聚合的报表在讲师搜索页会失真；按 `item_id` 聚合（课程维度）不受影响。若要唯一位置，需要在 Phase 2 或后续单独设计（例如把讲师 id 并进 `item_list_name`）。
- **顶栏搜索弹窗让埋点字节上了每一页。** `SearchForm` 在 root layout 的顶栏弹窗里，它调用 `trackSearch`，于是 analytics 模块（实测 2,230 B gzip）随 `chunks/9249` 每页异步加载。需要注意两个口径不一致：Next 的 `First Load JS shared by all` 与路由级 `First Load JS` 对这条 async layout chunk 不敏感（87.6 kB → 87.6 kB，无埋点路由 Δ 0.00 kB），但**直接量预渲染 HTML 里的 `<script src>`** 时，无埋点页面 `/privacy-policy` 实际从 787,695 B 涨到 792,890 B（raw +5,195 B；gzip 8,426 → 11,293，+2,867 B），其中约 2,230 B gzip 是埋点本体。也就是说"只在用到埋点的页面付这份字节"在顶栏搜索这一处不成立——这是设计取舍而非缺陷（顶栏搜索本来就每页都在），AC3 的闸门（shared < +3 kB）通过。
- **jsdom 在点击真实 `<a>` 时打印 `Not implemented: navigation to another Document`。** 本轮全量测试里出现 6 条（`tracked-item-link.test.tsx` 4 条、`course-card-analytics.test.tsx` 2 条），是 jsdom 不实现真实文档导航的噪声，不是断言失败；测试断言的是 `href` 未被改写、默认行为未被阻止、push 只发生一次。要消除需要给 jsdom 补导航桩，收益不大，暂不处理。
- **`TrackSearchResults` 只在挂载时上报一次。** `resultCount` 变化不重复上报（`track-search-results.test.tsx` 钉住），这是刻意的：`view_search_results` 的口径是"服务端返回的原始结果条数"，用户后续在客户端筛选不会重新上报；筛选行为由 `filter_apply` 单独记录。
- **`filter_apply` 的 `result_count` 是客户端筛选后的条数，`view_search_results` 的 `result_count` 是服务端原始条数。**同名参数在两个事件里口径不同，已在生成的清单 §6 的说明列里写明，报表里不要混用。
- **dev 环境 `emit()` 对未注册事件/参数直接抛错，prod 丢弃并 warn 一次。** 这是刻意的（宁可少一条数据也不污染报表），但意味着本地开发时拼错参数名会立刻报错——属于设计行为，不是 bug。

## 未做的事（明确声明）

- Phase 2 的 8 个转化类事件未实现，不在本计划范围
- AC4 / AC5 / AC6 / AC7 的人工部分、R1 冒烟验证、GTM 容器配置与发布：**全部未执行**，本文按"待人工"逐条列出步骤，未编造结论
- 未 push、未合并、未部署
