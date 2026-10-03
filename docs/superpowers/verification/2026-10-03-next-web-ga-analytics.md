# GA Analytics (Phase 1) Verification — 2026-10-03

## Status

Phase 1（埋点层：事件注册表 + 唯一 dataLayer 写入口 + `search` / `view_search_results` / `filter_apply` / `select_item` 四个事件 + 9 处接线 + 由注册表生成的 GTM 清单）已全部实现，10 个 task 的产物都在工作分支 `feat/ga-analytics-phase1` 上。

- 分支：`feat/ga-analytics-phase1`（基于 `main`，24 个 commit，含本文档与复查轮的两个 commit）
- **未合并、未 push、未部署**；线上 `umeh.top` 仍是旧版本，本文所有结论只对本地生产构建成立
- Phase 2 的 8 个转化类事件（`review_submit` / `review_vote` / `review_reply` / `review_report` / `timetable_add_section` / `timetable_remove_section` / `timetable_share` / `login`）**未实现**，见 AC8 一节
- 表格里所有数字都是本轮在本机实测输出，只有明确标为**估算**的差值例外（见 Bundle evidence 一节的残差说明）；未执行的人工步骤在文中明确标为"未完成"
- 全文的 **gzip 字节数一律用 `gzip -9 -n -c`**（level 9，且 `-n` 不写文件名与 mtime）。默认的 `gzip -c` 是另一回事（level 6 且会写文件名/时间头），得到的数字更大，**不是本文口径**：例如同样两个 chunk，`gzip -c` 是 3,872 / 4,669 B，本文口径是 3,845 / 4,641 B。每个 gzip 数字旁边都重复标注了该命令。

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
- `a578e77 test(analytics): cover the remount and StrictMode assertions from spec 10`

列表之外还有一条：**本文档自身所在的收尾 commit**（`docs(analytics): audit the AC2 mapping and make every bundle figure traceable`）—— 它只改本文档，正文因此不引用自己的 SHA，否则任何一次正文改动都会让它失效。

`ea35ade` 是做掉的 Task 10 复查遗留项（清单计数改为从注册表派生、DebugView 措辞修正、`wiring.test.ts` 防漂移断言钉死成功行、源码扫描放宽到 `.js`/`.jsx`/`.mjs`），与验收正文分开提交。`a578e77` 与收尾 commit 是本文件被复查后补做的：前者补上 spec §10 漏掉的两条断言（卸载重挂、StrictMode），后者修正本文档（AC2 逐行对照、gzip 口径、残差与路由差值的如实标注）。细节见 `task-11-report.md` 的复查轮记录。

## Commands run

| 命令 | 结果 |
|---|---|
| `npm run test` | **124 files / 468 tests passed**，exit 0（5.86s） |
| `npm run lint` | `✔ No ESLint warnings or errors`，exit 0 |
| `npx tsc --noEmit` | exit 0，无输出 |
| `npm run build` | exit 0；`First Load JS shared by all` = **87.6 kB** |
| `node scripts/print-analytics-manifest.mjs --check` | `[analytics] gtm-setup.md is in sync with the registry`（exit 0） |

（本文档在复查轮里补齐了 spec §10 的两条断言 —— 见 AC2 一节的"本轮补齐"，测试数因此由 466 变成 468：`tests/components/track-search-results.test.tsx` 5 → 6 条、`tests/components/course-filter-analytics.test.tsx` 6 → 7 条。文件数不变，仍是 124。）

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
# → Test Files 10 passed (10) / Tests 80 passed (80)
```

## Bundle evidence (AC3)

**测量方法**：`npm run build`（Next 14.2.35），从路由表里读 `First Load JS shared by all`。为了不拿历史数字做唯一依据，本轮**在同机同工具链上重新构建了一份 `main` 基线**：`git archive main | tar -x` 到独立目录、软链同一份 `node_modules`、拷贝同一份 `.env.local`，然后在该目录里跑同一条 `npm run build`。两次数值因此可直接相减。

**Next 打印的 kB 是什么口径**：gzip（不是 raw）。本轮用"把该路由 `app-build-manifest.json` 里列出的每个 JS chunk 用 node `zlib.gzipSync(..., {level: 9})` 压一遍再求和"复现它的数字，抽查 `main` 基线 9 条（对照本轮 `npm run build` 打印的路由表）与 HEAD 9 条（对照上一轮构建留下的打印表），**全部落在它 3 位有效数字的打印精度内**：`main` `/privacy-policy` 96,475 B → 打印 `96.5 kB`；`main` `/` 156,789 B → `157 kB`；HEAD `/` 159,367 B → `159 kB`；HEAD `/compare/[token]` 132,498 B → `132 kB`。选 node zlib level 9 而不是 `gzip -9 -n -c` 还有一处旁证：Next 给共享 chunk 打印的组成是 `53.6 kB`，该文件 node zlib9 = 53,640 B → `53.6`（与 Next 一致），而 `gzip -9 -n -c` = 53,660 B → `53.7`（与 Next 不符）。下面路由表后面另给**字节级**实测值（口径同上），因为 kB 打印值会把 ±百字节的差异放大成 ±1 kB。

| | `First Load JS shared by all` | 组成 |
|---|---|---|
| `main`（本轮新建基线） | **87.6 kB** | `chunks/119` 31.9 + `chunks/4f051027` 53.6 + other shared 2.01 |
| `feat/ga-analytics-phase1` | **87.6 kB** | `chunks/2117` 31.9 + `chunks/fd9d1056` 53.6 + other shared 2 |
| 历史参照（2026-10-02 masonry 记录） | 87.6 kB | — |

**增量 ≈ 0.0 kB**，AC3 的 "< 3 kB" 成立。同一角色的共享 chunk 本身也只有几字节变化：`chunks/119` 124,760 B → `chunks/2117` 124,729 B（`gzip -9 -n -c` 31,897 B → 31,898 B）。

路由级 `First Load JS` 的差值同样只落在真正接线的页面上：

| 路由 | `main` | HEAD | Δ |
|---|---|---|---|
| `/` | 157 kB | 159 kB | +2 kB |
| `/catalog/[...departments]` | 135 kB | 138 kB | +3 kB |
| `/course/[code]` | 119 kB | 122 kB | +3 kB |
| `/professor/[...name]` | 106 kB | 108 kB | +2 kB |
| `/search/course/[code]` | 135 kB | 138 kB | +3 kB |
| `/search/instructor/[...name]` | 111 kB | 114 kB | +3 kB |
| 其余 35 条路由（`/privacy-policy`、`/privacy-policy/en`、`/terms-of-service`、`/catalog`、`/admin/*`、`/reviews/*`、`/submit/*`、`/timetable`、`/sign-in`、`/sign-up`、各 `loading`/`layout` 条目等） | — | — | 打印值不变（**实测 −5 ~ −32 B**，见下） |

接线路由的**字节级**增量（口径同上：每个 first-load chunk 的 `zlib.gzipSync(level 9)` 求和，`git archive main` 基线 vs HEAD）：

```text
/search/instructor/[...name]/page  110,885 -> 114,025  (+3,140)
/search/course/[code]/page         135,447 -> 138,498  (+3,051)
/catalog/[...departments]/page     135,448 -> 138,499  (+3,051)
/layout                            199,140 -> 202,069  (+2,929)
/search/layout                     124,674 -> 127,483  (+2,809)
/course/[code]/page                118,849 -> 121,562  (+2,713)
/professor/[...name]/page          105,742 -> 108,407  (+2,665)
/page                              156,789 -> 159,367  (+2,578)
```

**`/compare/[token]` 的 −1 kB 已查清，它不是 −1 kB，也不与埋点有关。** 该路由的字节级实测是：

```text
/compare/[token]/page: main 132,504 B -> HEAD 132,498 B   (Δ = -6 B)
```

Next 打印时只保留 3 位有效数字，而这条路由正好骑在 `.5 kB` 边界上：132.504 kB → `133 kB`，132.498 kB → `132 kB`，于是"−6 B"被打印成"−1 kB"。这 −6 B 的构成（按两份构建里该路由 first-load chunk 的位置配对，位置配对的可靠性见下段）：路由自己的 page chunk `app/compare/[token]/page-*.js` **+3 B**（3,126 → 3,129），共享/公共 chunk 合计 **−9 B**（`webpack` −1、`chunks/4f051027` → `fd9d1056` −1、`chunks/119` → `2117` −1、`main-app` −4、`chunks/9539` → `8332` −3、`chunks/2534` → `5592` +1）。

**配对方式说明**：两份构建的 chunk 文件名带内容哈希，必然不同，因此这里按 `.next/app-build-manifest.json` 里每个路由的 chunk **顺序**配对（抽查的 3 条路由里，两份清单形状都一致：webpack → 两个共享 chunk → main-app → 若干异步 chunk → 路由自己的 page chunk）。即使个别异步 chunk 配错了，也只是把 ±3 B 的抖动在两三个文件之间挪动，不会改变"这一档是几十字节"的量级判断。

同样的 ±几字节抖动**出现在每一条路由上，包括完全没接埋点的路由**：`/privacy-policy/page` 实测 96,475 → 96,465 B（−10 B），`/admin/update/page` 341,122 → 341,090 B（−32 B），35 条未接线路由的 Δ 落在 **−5 ~ −32 B**（打印值都不变，所以上表写"打印值不变"而不是"+0.00 kB"）。原因已定位到证据级、但未逐字节归因：两份构建里**同一个模块的 webpack 模块 id 不同**，例如共享 chunk 里同一个模块是 `18970:function(...)` → `65157:function(...)`、`29492:function(...)` → `91572:function(...)`（模块 id 是 chunk 里的字面量，位数变化就会让字节数抖动几十字节）；至于每个 chunk 具体多了/少了几字节、以及为什么模块 id 会这样重排，本文没有逐模块核对，属于**未解释但有界的构建噪声**（≤32 B，与接线路由 +2.6 ~ +3.1 kB 的真实增量相差两个数量级，不影响 AC3 的任何结论）。

### 客户端 chunk 泄漏检查（grep 构建产物）

```bash
grep -rl "um_event"     .next/static/chunks --include='*.js'
grep -rlF "[analytics]" .next/static/chunks --include='*.js'
```

两条命令命中**完全相同**的两个文件（在 `main` 基线树上跑同样两条命令：**零命中**，即这两个 chunk 是本分支新增的）：

| chunk | 大小（raw / gzip，gzip = `gzip -9 -n -c`） | 谁加载它 |
|---|---|---|
| `chunks/7462-f6da83f1b2d49832.js` | 9,367 B / 3,845 B | 只被接线页面加载：`/catalog/[...departments]`、`/course/[code]`、`/professor/[...name]`、`/search/course/[code]`、`/search/instructor/[...name]`（据 `.next/app-build-manifest.json`）；内含 `TrackedItemLink` |
| `chunks/9249-f01856747bff8504.js` | 12,218 B / 4,641 B | `SearchForm` 所在 chunk（root layout 的顶栏搜索弹窗），`/layout`、`/page`、`/search/layout` 都引用它 |

**三个组成 `First Load JS shared by all` 的 chunk（`2117` 124,729 B、`fd9d1056` 172,837 B、other shared 2 kB）里没有任何 `um_event` / `[analytics]` 字符串**——埋点层没有被塞进"每页都加载的共享 chunk"，符合 AC3 的意图。

关于 `chunks/9249`，需要如实说清楚（这是本轮实测发现的唯一一处"每页都会下载到埋点字节"）：

- 它同时含 `SearchForm` 与 analytics 模块，因为 `components/search/search-form.tsx` 调用 `trackSearch`，而顶栏搜索弹窗在 root layout 里，所以每一页都会以 `<script async>` 加载这个 chunk。这是**既有依赖**的延续，不是新增的共享 chunk：`main` 上 `SearchForm` 的代码位于每页都加载的 `chunks/app/layout-*.js`（30,072 B / gzip `gzip -9 -n -c` 8,426 B），HEAD 上它被提升成独立 chunk `9249`（12,218 B / 4,641 B）并把 layout 缩到 23,120 B（6,652 B）。
- **每页实际下载的 JS 字节数**（不依赖 Next 的指标口径）：把预渲染 HTML 里每个 `<script src>` 指向的**文件**逐个量一遍再求和（逐个 gzip 也用同一条 `gzip -9 -n -c`）。无埋点页面 `/privacy-policy`：

  | | raw | gzip（`gzip -9 -n -c`） |
  |---|---|---|
  | `main` 基线 | 787,695 B（18 个 chunk） | 239,161 B |
  | HEAD | 792,890 B（19 个 chunk） | 242,027 B |
  | **Δ** | **+5,195 B** | **+2,866 B** |

  （两列都覆盖同一批文件：`polyfills-42372ed130431b0a.js` 在两份构建里同名同内容，raw 112,594 B / gzip 39,373 B，两侧相抵。）

  raw 这一侧可以**逐文件闭合**：把两份构建里角色对应的 17 个 chunk（两个共享 chunk、若干异步 chunk、page chunk、layout、not-found、webpack）按 HTML 里 `<script src>` 的出现顺序配对（HEAD 多出的 `9249` 单独计；`polyfills-42372ed130431b0a.js` 两侧同名同大小，互相抵消），得到 `+12,218`（新增 `9249`）`+ (−6,952)`（layout 30,072 → 23,120）`+ (−71)`（其余 16 个被引用 chunk 的净变化：−76 + 3 + 2）`= +5,195`，与直接量出来的差值**完全一致**。上一版文档里那个 −71 B 的缺口就是这么来的，即：差的不是埋点，而是这 16 个 chunk 自己也抖了几十字节（同 `webpack 模块 id 重排`，见路由一节）。gzip 侧同理：`+4,641`（`9249`）`+ (−1,774)`（layout 8,426 → 6,652）`+ (−1)`（其余 16 个 chunk）= `+2,866`。
- 其中埋点本体占多少：`lib/analytics/events.ts` 作为入口 bundle（含 `data-layer.ts` / `registry.ts` / `registry-data.mjs`）用
  `./node_modules/.bin/esbuild lib/analytics/events.ts --bundle --minify --format=esm --define:process.env.NODE_ENV='"production"'`（esbuild 0.27.0）实测 **5,661 B raw / 2,217 B gzip（`gzip -9 -n -c`）**。
  上一版本文档写的 gzip 值是 **2,230 B，用文中声明的任何方法都复现不出来**（`gzip -9 -n -c` = 2,217、`gzip -6 -n -c` = 2,217、`gzip -9 -c`（带头）= 2,237、node `zlib.gzipSync(level 9)` = 2,240），本轮已按可复现口径改为 **2,217 B**。
- **埋点本体与"每页增量"之差是估算，不是测量**：`+5,195 − 5,661 = −466 B`（raw，即整页净增量比单独打包出来的埋点本体还小 466 B——因为 layout chunk 自己缩了 6,952 B）、`+2,866 − 2,217 = +649 B`（gzip）。这两个差值**不做逐字节归因**，可能的原因（**推断，未逐字节验证**）：① 独立的 esbuild 打包与 Next 打包后的产物不同，analytics 模块在 Next 侧与 `9249` 里的 `SearchForm` 等共用一批 helper，而 esbuild 单独打包时会把这份开销都算进它自己的 5,661 B；② gzip 大小不可加——把代码拆到两个文件后，"逐文件 gzip 求和"与"合并后 gzip"不是一回事。上一版文档把这 637 B（按旧的 2,230 算出来的残差）写成"归因于 chunk 拆分本身的开销（不是埋点代码）"，那是**推断当成了测量**，本轮改为按上面两个可复现的口径分开列示，并明确标注为估算。
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

- [x] `npm run test` 124 files / 468 tests passed；`npm run lint` 无告警；`npx tsc --noEmit` exit 0；`npm run build` exit 0（见上一节表格）

### AC2 — spec §10 表格里的每一条断言都有对应测试且通过

**核对方法**：按 spec §10 的**行**逐条对照（而不是从测试文件反推后挑好看的写）。下表每一行给出"§10 要求什么 → 哪个用例真的断言了它"。下表 10 个文件的用例全部在 `npm run test`（124 files / 468 tests）里通过。

| spec §10 的行 | 覆盖用例（含本轮补齐） |
|---|---|
| 单元 `tests/analytics/data-layer.test.ts`（20 条） | payload 恒为 `{event:"um_event", um_name, ...params}` → `pushes the canonical payload shape`；无 `window` 时不 push 且不抛错 → `does nothing without a window (server rendering)` + `does not throw on an invalid event without a window (server rendering)`；`window.dataLayer` 缺失时被初始化为数组 → `initialises window.dataLayer when it is missing`；未注册事件名 dev 抛错 → `rejects unknown events in development`，prod 丢弃且 warn 一次 → `drops and warns once instead of throwing in production`；未注册参数名 dev 抛错 → `rejects unregistered parameters in development`；缺必需参数 dev 抛错 → `rejects missing required parameters in development`；布尔归一为 1/0、数字保持 number → `normalises booleans to 1/0 and keeps numbers as numbers`；超长字符串截断到 100 且 warn → `truncates long string values to 100 characters`；payload 里不出现 `undefined` → `omits undefined and null parameters`（连 `null` 一起断言）。另有 §10 未要求但已覆盖的：保留名被拒（`rejects reserved parameter names`）、原型链键名（`treats prototype-key event names as unknown events in development`、`drops prototype-key event names in production instead of throwing`、`rejects prototype-key parameter names in development`）、类型不符 dev 抛错/prod 丢弃（`rejects a string value for a numeric parameter in development`、`rejects a numeric value for a string parameter in development`、`rejects a boolean value for a string parameter in development`、`drops a wrongly typed value in production instead of throwing`）、prod 静默（`stays silent in production`） |
| 单元 `tests/analytics/registry.test.ts`（7 条） | `registry-data.mjs` 能被 Node 直接 import → `keeps the data source importable by plain node`；事件名/参数名满足 `^[a-z][a-z0-9_]*$` 且 ≤40 字符、非保留前缀（`ga_`/`google_`/`firebase_`）、单事件参数 ≤25 → `keeps every event and parameter name ga4-compatible`（这四条在同一用例里逐项断言）；`FORBIDDEN_PARAM_NAMES` 不出现在任何事件参数表 → `never registers a forbidden pii parameter`；每个 `wiring` 指向的文件真实存在 → `points every event at wiring files that exist`；`recommended` 事件名在白名单内 → `only uses whitelisted ga4 recommended event names`。另有：`declares the phase 1 events`（钉死四个事件名）、`never registers a parameter name that collides with the payload shape or Object.prototype` |
| 单元 `tests/analytics/events.test.ts`（10 条） | 四个语义函数的入参→payload 映射 → `maps search arguments onto ga4 parameters`、`maps instructor search scope and the header entry point`、`reports zero results as has_results = 0`、`reports non-zero results as has_results = 1`、`maps filter arguments`、`includes faculty when it is provided`；可选参数缺省时不出现该键 → `omits the optional faculty parameter when it is absent`。另有 §10 未要求但已覆盖的：`logs one readable line in development`、`stays silent about logging in production`、`only ever emits parameters that the registry knows`（同时是 §10 wiring 行那条断言的覆盖者，见下） |
| 单元 `tests/course-filters.test.ts`（10 条） | `nextFilterState()` 三态映射 → `maps Offered and Not Offered onto 1 and 0 for Is_Offered` + `falls back to All when an unrecognised Is_Offered value arrives`；9 个状态维度 → `keeps the nine filter state dimensions in their existing order` + `starts with every dimension set to All`；`All` 表示不过滤 → `treats All as no filtering`；多维度 AND → `combines dimensions with AND`；空结果 → `returns an empty list when nothing matches`；不改动入参与原状态 → `does not mutate the input array or the previous state`（另有 `filters by a plain string dimension`、`clears a dimension when All is chosen again`） |
| 组件 **扩展**既有 `tests/components/search-form.test.tsx`（5 条） | 合法提交 → `search` 事件且 `entry_point` = 传入 variant → `reports the submitted course search with its entry point`（`variant="inline"` → `entry_point: "inline"`，逐字段 `toEqual`）+ `reports the instructor scope for the hero entry point`（`variant="hero"` → `entry_point: "hero"`）；`is_prof` 切换 → `search_scope = "instructor"` → 事件侧由 `reports the instructor scope for the hero entry point` 断言（`search_scope: "instructor"`），导航侧由 `submits instructor search when switch is enabled` 断言（跳到 `/search/instructor/…`）；校验失败（<4 字符）→ 无上报 → `reports nothing when the form is invalid`；另有既有回归 `submits course search by default` |
| 组件 `tests/components/course-card-analytics.test.tsx`（3 条） | `href` 指向 `/course/<code>` → `keeps linking to the course page`；点击 → `select_item` 带 `item_id`/`item_list_name`/`position`/`faculty` → `reports select_item with the list name, position and faculty`；无 `faculty` 字段时不带该参数 → `omits faculty when the course row has no Offering_Unit`。`ProfCard` 是 async server component，RTL 不能直接渲染 → 由 `tests/analytics/wiring.test.ts` 的 `routes every card link through the tracked link` + `passes a list name to every card list`（`LIST_CALLERS` 含 `app/professor/[...name]/page.tsx` 等 4 处传 `listName`）覆盖，与 §10 的写法一致 |
| 组件 `tests/components/course-filter-analytics.test.tsx`（**7 条**，本轮 6 → 7） | 用真实 DOM 交互驱动 Radix 下拉 → `filter_apply` 三参数正确（`result_count` = 筛选后条数）→ `reports filter_apply with the post-filter result count`；`trackResults` 存在 → 挂载上报一次 `view_search_results` → `reports the search results once when trackResults is provided`；**StrictMode 下仍只上报一次** → `reports the search results only once under StrictMode`（**本轮补齐**）；无 `trackResults` → 不上报 → `stays silent on the catalog page (no trackResults)`。另有：`reports the offered label rather than the numeric flag for Is_Offered`、`reports filter_apply when a dimension is cleared back to All`、`reports zero results for an empty result set` |
| 组件 `tests/components/tracked-item-link.test.tsx`（5 条） | 点击 → `select_item` 带 `item_id`/`item_list_name`/`position` → `reports select_item with the list and position on click`；`href` 未被改写 → `keeps the destination href untouched`；可选 `faculty` 缺失时不出现在 payload → `omits faculty when the caller does not have it`。另有：`does not block the default navigation`、`reports once per click, not twice under StrictMode` |
| 组件 `tests/components/track-search-results.test.tsx`（**6 条**，本轮 5 → 6） | 挂载 → 上报一次 → `reports the result count once on mount`；`resultCount` 变化不重复上报 → `does not report again when the result count changes`；StrictMode 双执行仍只上报一次 → `does not report twice under StrictMode`；**卸载重挂一次按"新挂载"再上报一次** → `reports once more when it is unmounted and mounted again`（**本轮补齐**）。另有：`reports zero results`、`renders nothing` |
| 守卫 `tests/analytics/wiring.test.ts`（7 条） | 除白名单外无 `dataLayer` 直接写入 → `writes to the data layer from exactly one module`；无 `gtag(` → `never calls gtag directly`；`CourseCard`/`ProfCard` 中不存在裸 `next/link` 直连 → `routes every card link through the tracked link`；两个搜索结果面都接 `TrackSearchResults` → `reports search results from both result surfaces`；`docs/analytics/gtm-setup.md` 与脚本生成结果逐字一致 → `keeps the gtm manifest in sync with the registry`（`--check` 退出码 + 成功行逐字钉死，且源码扫描已放宽到 `.ts`/`.tsx`/`.js`/`.jsx`/`.mjs`）。另有：`passes a list name to every card list`、`keeps the client tracking leaves free of callback props` |

**本轮补齐的两条（复查发现 §10 有断言没有测试）**：§10 的 `track-search-results` 行要求"卸载重挂一次按'新挂载'再上报一次"（原来只有 `rerender` 用例，那是"同一实例不重复上报"，是另一种行为），`course-filter-analytics` 行要求"StrictMode 下仍只上报一次"（该文件里原本一条 `StrictMode` 都没有）。两条都按"只增不删"补进了对应文件，做法与红灯证据见 `task-11-report.md` 的复查轮记录。

**两处"§10 的写法与实际覆盖位置不同"（如实记录，不是漏测）**：

1. §10 的 wiring 行写的是"除 `lib/analytics/data-layer.ts` 外无 `dataLayer` 直接写入"，但守卫的白名单实际是 `lib/analytics/data-layer.ts` + `app/layout.tsx`。多出来的那个文件是既有的 GTM 引导片段（其中的 `dl=l!='dataLayer'` 与 `})(window,document,'script','dataLayer',…)` 只是嵌入的 GTM 标准脚本字符串），它**不含任何埋点写入、也不调用 `emit()`**，所以这是为了让守卫与既有代码兼容而列的白名单，不是放水。
2. §10 把"`events.ts` 里用到的参数名全部在注册表内"写在 wiring 行（暗示源码扫描），实际没有源码扫描，覆盖它的是 `tests/analytics/events.test.ts` 的 `only ever emits parameters that the registry knows`：dev 下未注册参数会直接抛错，该用例再逐 payload 断言每个键都在注册表内。当前 `lib/analytics/events.ts` 里出现的参数键与注册表的 11 个参数**集合完全相同**（本轮实测：`entry_point,faculty,filter_name,filter_value,has_results,item_id,item_list_name,position,result_count,search_scope,search_term` 两侧各 11 个，互相无差集），且四个语义函数（含 `faculty` 有/无两条分支）都在测试里被调用过，所以这条断言目前是真覆盖的；但它是运行时断言而非源码扫描 —— 若以后有人在 `events.ts` 里加一个只在未测分支里出现的参数名，这条不会自动报警。已记入"未做的事 / 已知限制"。

**结论**：§10 表格的 10 行断言在补齐上述两条后**逐条有测试覆盖**，没有需要留空的行使；两条"覆盖位置与 §10 写法不同"的点如上如实标注。

### AC3 — 无新依赖 + shared First Load JS 增量 < 3 kB

- [x] 见 "Bundle evidence" 一节：依赖未变；shared 87.6 kB → 87.6 kB（Δ ≈ 0.0 kB，逐 chunk 实测几字节）；埋点字符串只出现在 `chunks/7462`（接线页面）与 `chunks/9249`（顶栏 SearchForm），不在三个 shared chunk 里；8 条接线入口（6 条页面路由 + `/layout`、`/search/layout`）的字节级增量为 +2,578 ~ +3,140 B，35 条未接线路由实测 −5 ~ −32 B（Next 打印值不变）

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
- **顶栏搜索弹窗让埋点字节上了每一页。** `SearchForm` 在 root layout 的顶栏弹窗里，它调用 `trackSearch`，于是 analytics 模块随 `chunks/9249` 每页异步加载。需要注意两个口径不一致：Next 的 `First Load JS shared by all` 与路由级 `First Load JS` 对这条 async layout chunk 不敏感（87.6 kB → 87.6 kB，未接线路由打印值不变），但**直接量预渲染 HTML 里的每个 `<script src>` 文件**时，未接线页面 `/privacy-policy` 实际从 787,695 B 涨到 792,890 B（raw **+5,195 B**；gzip `gzip -9 -n -c` 239,161 → 242,027 B，**+2,866 B**）。其中埋点本体（esbuild 单独打包 `lib/analytics/events.ts`）实测 5,661 B raw / 2,217 B gzip，与整页增量的差（raw −466 B / gzip +649 B）是**估算项**、不逐字节归因（原因见 Bundle evidence 一节）。也就是说"只在用到埋点的页面付这份字节"在顶栏搜索这一处不成立——这是设计取舍而非缺陷（顶栏搜索本来就每页都在），AC3 的闸门（shared < +3 kB）通过。
- **两根构建之间每个 chunk 都有几十字节级别的抖动（未逐字节解释）。** 用同机同工具链重建 `main` 基线后，35 条未接线路由的 `First Load JS` 实测变化 −5 ~ −32 B（打印值不变），`/compare/[token]` 是 −6 B（打印成 −1 kB，见 Bundle evidence 一节）。已定位到"webpack 模块 id 在两份构建里不同（`18970` → `65157` 之类）"这一层证据，但没有逐模块核对每个 chunk 具体差在哪几个字节。结论不受影响：这档抖动 ≤32 B，比接线路由的真实增量（+2.6 ~ +3.1 kB）小两个数量级。
- **§10 的 wiring 行那条"`events.ts` 里用到的参数名全部在注册表内"是运行时断言，不是源码扫描。** 覆盖它的是 `events.test.ts` 的 `only ever emits parameters that the registry knows`（dev 下未注册参数直接抛错 + 逐 payload 断言键在注册表内）；`wiring.test.ts` 里并没有这条源码扫描。当前两侧参数集合实测完全相同（各 11 个），所以现状是真覆盖的，但 `events.ts` 里若新增一个只出现在未测分支里的参数名，这条守卫不会报警。
- **jsdom 在点击真实 `<a>` 时打印 `Not implemented: navigation to another Document`。** 本轮全量测试里出现 6 条（`tracked-item-link.test.tsx` 4 条、`course-card-analytics.test.tsx` 2 条），是 jsdom 不实现真实文档导航的噪声，不是断言失败；测试断言的是 `href` 未被改写、默认行为未被阻止、push 只发生一次。要消除需要给 jsdom 补导航桩，收益不大，暂不处理。
- **`TrackSearchResults` 只在挂载时上报一次。** `resultCount` 变化不重复上报（`track-search-results.test.tsx` 钉住），这是刻意的：`view_search_results` 的口径是"服务端返回的原始结果条数"，用户后续在客户端筛选不会重新上报；筛选行为由 `filter_apply` 单独记录。
- **`filter_apply` 的 `result_count` 是客户端筛选后的条数，`view_search_results` 的 `result_count` 是服务端原始条数。**同名参数在两个事件里口径不同，已在生成的清单 §6 的说明列里写明，报表里不要混用。
- **dev 环境 `emit()` 对未注册事件/参数直接抛错，prod 丢弃并 warn 一次。** 这是刻意的（宁可少一条数据也不污染报表），但意味着本地开发时拼错参数名会立刻报错——属于设计行为，不是 bug。

## 未做的事（明确声明）

- Phase 2 的 8 个转化类事件未实现，不在本计划范围
- AC4 / AC5 / AC6 / AC7 的人工部分、R1 冒烟验证、GTM 容器配置与发布：**全部未执行**，本文按"待人工"逐条列出步骤，未编造结论
- spec §10 表格里**没有仍然缺测试的断言**（补齐两条后逐行对照，见 AC2 一节）；但有两处"覆盖位置与 §10 的写法不同"如实记录在 AC2 一节：wiring 行的 `dataLayer` 白名单实际含 `app/layout.tsx`；"`events.ts` 参数名全部在注册表内"由运行时断言而非源码扫描覆盖
- 两份构建之间每个 chunk 的几十字节抖动只定位到"webpack 模块 id 重排"这一层，**未逐模块核对具体字节差异**（有界：≤32 B，见 Known limitations）
- 埋点本体（2,217 B gzip）与整页增量（+2,866 B gzip）之差 **+649 B 是估算、不逐字节归因**；raw 侧同一处的差是 −466 B（原因见 Bundle evidence 一节）
- 未 push、未合并、未部署
