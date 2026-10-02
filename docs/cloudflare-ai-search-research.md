# Cloudflare AI Search 整合可行性调研

最后更新：2026-10-02
调研对象：[`docs/superpowers/specs/2026-09-21-next-web-ai-assistant-design.md`](superpowers/specs/2026-09-21-next-web-ai-assistant-design.md)（AI 对话助手设计，状态 Draft）
调研问题：Cloudflare AI Search（<https://developers.cloudflare.com/ai-search/>）能否整合进这套设计？

---

## 0. 结论速览

**能整合，但要先摆正定位：AI Search 是「检索层」，不是「对话层」。**

| 判断 | 结论 |
|---|---|
| 技术上能否接进 next-web（OpenNext on Workers） | **能**。REST API 最省事，Workers binding 也可行但要动构建链路 |
| 能否替代 spec 第 6 节 `ai_public` 公开数据层 | **不能替代，但能复用**。AI Search 没有 Postgres 连接器，必须先把数据导出成文件 |
| 能否替代 spec 第 7 节的 SQL 逃生舱 | **不能**。AI Search 不支持聚合（group by / count / avg），「哪些教授同时开两门课」这类问题它答不了 |
| 能否落地 spec 的 P3-1（语义检索评价） | **正是它擅长的**，且省掉自建 pgvector / Vectorize 的全部代码 |
| 最推荐形态 | 在现有「策展工具 + SQL 逃生舱」之外**增加第三类工具 `semantic_search`**，只做模糊语义召回 |
| 最大坑（会直接决定成败） | **中文 BM25 分词**：`keyword_tokenizer` 只有 `porter`（英文词干）和 `trigram`（3 字符窗口），没有中文分词。中文关键词检索基本失效，质量全靠向量 |
| 第二大的坑 | 数据要**复制一份到 Cloudflare 托管的 R2/Vectorize**，形成新的信任边界与供应商锁定 |
| 时机 | AI Search 于 **2026-10-01 GA**，**计费从 2026-11-01 开始**——现在到 10 月底是零成本的验证窗口 |

**一句话**：如果目标是「让 /assistant 能回答『ACCT100 给分松不松』这类语义问题」，AI Search 是一个性价比很高的选项，值得在 10 月内做一次 spike；但它不会让 spec 里的策展工具、SQL 逃生舱、`ai_public` 白名单变得多余，反而**强依赖**那套白名单做导出源。

---

## 1. 现状盘点（先确认调研前提）

调研前先确认仓库里到底有什么：

| 检查项 | 结果 |
|---|---|
| `next-web/docs/superpowers/specs/2026-09-21-next-web-ai-assistant-design.md` | 存在，状态 Draft，**等待人工 review** |
| 实施计划（`writing-plans` 产物） | **不存在**（`docs/superpowers/plans/` 里没有 ai 相关计划） |
| 代码（`app/api/chat`、`app/assistant`、`lib/chat/*`、`components/assistant/*`） | **全部不存在** |
| 依赖（`ai`、`@ai-sdk/*`、`pgsql-ast-parser`、`react-markdown`） | `package.json` 中**均无** |
| 仓库中任何 `ai_search` / `vectorize` / `autorag` 引用 | **零**（`app`、`lib`、`docs`、`wrangler.jsonc`、`package.json` 全无） |
| 任何 `getCloudflareContext` 调用 | **零**（现有 R2/D1 binding 只被 OpenNext 内部用于增量缓存/标签缓存，业务代码不碰 binding） |
| `next.config.js` 是否调用 `initOpenNextCloudflareForDev()` | **没有** |

也就是说：**这是一次纯新增子系统的选型调研，不存在与已上线代码冲突的问题**，代价是「先有鸡还是先有蛋」——AI Search 的接入方式会反向约束 `/api/chat` 的实现形态，最好在写 plan 之前定下来。

site 侧两个对调研有影响的事实：

- `app/robots.ts` 允许 `*` 抓取 `/`，只 disallow `/admin/`、`/api/`、`/submit/`、`/search/`、`/sign-in`、`/sign-up`，且提供 `sitemap.xml`。
- `app/course/[code]/page.tsx` 是 `revalidate = 3600`，课程页/评价页有稳定 URL（`lib/site.ts` 的 `buildCoursePath` / `buildReviewPath`）。

→ 这两点意味着「**让 AI Search 直接爬 umeh.top**」是一条真实可行、零 ETL 的验证路径（见 §6.3）。

---

## 2. Cloudflare AI Search 是什么

前身是 AutoRAG，2026-10-01 GA（[changelog](https://developers.cloudflare.com/changelog/post/2026-10-01-ai-search-generally-available/)）。它是一个**全托管的检索服务**，在你给出的内容上自动完成解析 → 分块 → 向量化 → 建关键词索引 → 检索 → （可选）生成。

### 2.1 数据源（关键限制）

只能接三类，**没有任何数据库连接器**：

| 数据源 | 说明 |
|---|---|
| Built-in storage | 每个实例自带，用 Items API 直接上传文件（底层是 CF 的 R2 + Vectorize） |
| R2 bucket | 接你自己的 R2 桶，按 `sync_interval` 定期同步 |
| Website | 爬一个你拥有的域名 |

支持的文本格式极广（`.md` / `.txt` / `.json` / `.csv` / `.sql` / 代码文件…），富文本（PDF / Office / 图片）会自动转 Markdown。文件大小上限：纯文本 10 MiB，其他格式 4 MiB，开 OCR 的 PDF 10 MiB。

**对本项目的直接含义**：Supabase 里的 `comment` / `course_noporf` / `prof_with_course` **不能直接接进去**，必须先落成文件（或走网站数据源）。

### 2.2 索引与检索能力

索引期：解析 → 分块（chunking 可调）→ embedding（可选向量）→ BM25 关键词索引 → 存储。
其中分块、embedding 都由 AI Search 托管，也支持混合检索（`vector` / `keyword` / `hybrid`）。

检索期可选能力：

| 能力 | 参数 | 说明 |
|---|---|---|
| 混合检索 | `retrieval.retrieval_type` = `vector` \| `keyword` \| `hybrid`（默认 hybrid） | |
| 相似度阈值 | `retrieval.match_threshold`，0–1，默认 0.4 | |
| 结果条数 | `retrieval.max_num_results`，1–50，默认 10 | |
| 元数据过滤 | `retrieval.filters`，支持 `$eq/$ne/$in/$nin/$lt/$lte/$gt/$gte`，多键隐式 AND | 过滤在检索**之前**生效 |
| 上下文扩展 | `retrieval.context_expansion`，0–3 | 把相邻 chunk 一并带出，缓解「分块切断语义」 |
| 相关性加权 | `retrieval.boost_by`，最多 3 项 | 例如让新评论排前 |
| Query 改写 | `query_rewrite.enabled` | 调 LLM 改写查询，多一次模型调用 |
| 重排 | `reranking.enabled`，模型 `@cf/baai/bge-reranker-base` | 提精度 |
| 相似度缓存 | `cache.enabled` / `cache_threshold` | 语义近似的问题直接命中缓存 → **省查询计费** |

### 2.3 调用方式

| 方式 | 是否需要 API token | 适用性判断 |
|---|---|---|
| **Workers binding**（`ai_search` / `ai_search_namespaces`） | 否（运行时调用） | 可行但需改构建链路，见 §5 |
| **REST API** | 是（`AI Search:Edit` + `AI Search:Run`） | **首推**。普通 `fetch`，不动 OpenNext 配置 |
| MCP endpoint | — | 本项目不需要 |
| Public endpoint | 否（公开无鉴权） | **不能用**：等于把站内数据搜索能力裸奔出去 |
| UI snippets / LangChain / AI SDK | 视情况 | 前端搜索框场景才需要；对话场景不必要 |

`search()` 响应结构（本项目最关心）：

```
query_kind, search_query
chunks[]:
  id, type, score, text
  item.key          ← 文件路径或 URL，**引用锚点的天然来源**
  item.timestamp, item.metadata
  scoring_details.{vector_score, keyword_score, keyword_rank, vector_rank, reranking_score}
```

`chatCompletions()` 是「检索 + 生成」一次性完成；文档明确支持 [Bring your own generation model](https://developers.cloudflare.com/ai-search/how-to/bring-your-own-generation-model/)，即**只用它检索、生成交回自己的模型**。

### 2.4 硬限制（会直接改变设计的地方）

| 限制 | 值 | 对本项目的影响 |
|---|---|---|
| 自定义元数据字段 | **每实例最多 5 个** | 必须精打细算；`doc_type` / `course_code` / `prof_name` / `updated_at` 就用掉 4 个 |
| 元数据容量 | 每向量 10 KiB（含系统开销与 JSON 语法） | 不要把评论全文塞进元数据 |
| 可过滤字符串 | 每字符串**仅前 64 UTF-8 字节**可过滤 | 课程码/教授名没问题；长文本别指望过滤 |
| 字符串数组 | 存得下但**不可过滤** | 一门课多个教授 → 只能存单个主教授或改字段设计 |
| 文件数 | 免费 10 万/实例；付费 100 万（开 hybrid 后 50 万） | 评论「一条一文件」在免费档有可能吃紧 |
| 包含额度 | 每月各 1,000 次 semantic / full-text 查询 | 折算下来免费额度只够**约 30–60 次对话**（见 §8） |
| 爬取 | 免费档每天 500 页 | 若走网站数据源，全站爬完需多天 |
| 无查询自动暂停 | 外部数据源 31 天无查询则暂停同步 | 用内置存储可规避 |
| 中文分词 | **无**（只有 porter / trigram） | **最大质量风险**，见 §7.1 |

价格（[Limits & pricing](https://developers.cloudflare.com/ai-search/platform/limits-pricing/)）：

| 项目 | 价格 |
|---|---|
| 基础摄取 | $0.75 / 百万 token |
| 图片处理 | 额外 $0.50 / 百万 token |
| 存储 | $2.00 / GB-月 |
| 语义 / 向量 / **混合**查询 | $0.75 / 1,000 次 |
| 纯全文（keyword）查询 | **$0.10 / 1,000 次** |

注意两点：① 计费 **2026-11-01 开始**；② 混合检索按语义查询价计费，是纯关键词的 7.5 倍——**能用 keyword 解决的精确查询（课程码）就别用 hybrid**。

---

## 3. 与现有 spec 的契合度逐条对照

### 3.1 目标（G1–G9）

| spec 目标 | AI Search 的作用 | 判断 |
|---|---|---|
| G1 新增 `/assistant` + `POST /api/chat` 流式中文多轮 | AI Search 不影响前端与流式协议 | 无冲突 |
| G2 只基于站内数据 + **每条事实性回答附引用链接** | `chunks[].item.key` 直接给引用锚点（文件路径或 URL），契合度很高 | ✅ 有帮助 |
| G3 检索层 = 策展工具 + SQL 逃生舱 | 建议**扩展为三元组**：策展工具 + SQL 逃生舱 + 语义检索。语义检索正好补上「用户不知道精确拼写」的长尾 | ✅ 补强，不是替代 |
| G4 SQL 五层防御 | AI Search 不参与 SQL 路径，不削弱 | 无影响 |
| G5 视图列白名单（身份/内部字段永不外泄） | **可以复用**：把 `ai_public` 三视图当作导出源，白名单定义只写一份；但导出后数据落在 Cloudflare 侧，是**新的信任边界** | ⚠️ 需新增约束 |
| G6 模型层只依赖 OpenAI 兼容接口 | AI Search 的 `search()` 与生成解耦，`lib/chat/model.ts` 完全不变 | ✅ 兼容 |
| G7 匿名可聊、登录落库 | 与检索无关 | 无影响 |
| G8 限流 / token / 工具调用硬上限 | AI Search 调用要新增配额与次数上限；`max_num_results ≤ 50` 是它的天然上限 | ⚠️ 需补充 |
| G9 现有代码约定（zod / `apiError()` / vitest） | 与 AI Search 无关，照旧 | 无影响 |

### 3.2 非目标（N1–N8）

- **N2「不做任何写操作」**：AI Search 天然只读，✅ 一致。
- **N4「不自建向量库，pgvector 留到 Phase 3，接口预留」**：spec 已经为语义检索留了位。AI Search 是**「不自建」前提下实现 P3-1 的最短路径**，反而更贴合 N4 的精神。
- **N7「statistics / schedule 本期不进公开视图」**：AI Search 的导出范围应与视图白名单**完全同源**，不能借「反正是导出文件」偷偷多导。
- **N8 不做管理后台审计 UI**：同步管道需要一个可观测点（见 §6.5）。

### 3.3 spec 里被 AI Search 触及的既有风险条目（第 18 节）

| 原风险 | AI Search 带来的变化 |
|---|---|
| 提示注入诱导模型导出敏感列 | 风险面扩大：被检索出来的 chunk 本身就是注入载体。spec §12.5「工具返回内容视为数据而非指令」这条要**加重**，且导出的 chunk 文本必须来自白名单视图 |
| 模型编造课程/教授信息 | 语义召回可能召回「相似但不对」的片段（尤其分块切断后），幻觉风险**上升**；需要 `match_threshold` + 引用必填 |
| 首字延迟偏高 | AI Search 是一次额外网络往返（含 embedding 查询），首 token 延迟**增加**；可考虑与策展工具并行发起 |
| 匿名接口被刷 | 直接放大成本：每次匿名提问都可能触发计费查询。限流必须覆盖 AI Search 调用 |

---

## 4. 三种整合方案对比

### 方案 A：作为第三类检索工具（推荐）

在 `lib/chat/tools.ts` 里新增 `semantic_search({ query, course_code?, prof_name? })`，只做模糊语义召回，生成仍由 `lib/chat/model.ts` 负责。

```
用户问题
  └─ 模型选工具
       ├─ 策展工具（search_courses / get_course_info / …）  → 确定性事实
       ├─ semantic_search → AI Search search()             → 模糊语义召回（评论、课程简介）
       └─ sql_query       → ai_exec_sql                    → 聚合、统计、多表
```

优点：改动最小、可灰度、失败可降级（AI Search 挂了就走策展工具）、每类问题用最合适的通道。
缺点：模型要正确选工具，tool description 写不好会误用；检索层从 2 条变 3 条，测试矩阵变大。

### 方案 B：对话直接交给 AI Search `chat/completions`

优点：代码量最少，一天能跑起来。
缺点（任一都足以否决）：

- **违反 G6**：生成模型被锁定在 Workers AI / AI Gateway 名单内，换模型不再只是改 `AI_MODEL`。
- **违反 G2 的可控性**：引用由 AI Search 内部产生，spec §8.3 那套 `{type, code, label, href}` 结构化引用和「单条引用 ≤ 60 字」的隐私条款无从落地。
- 失去工具循环：不能查 SQL 聚合、不能强制「无数据就说无数据」。
- 成本不可控：每次提问都是一次生成 + 一次检索，且生成用量走 AI Gateway 单独计费，与 spec §13 的 token 预算体系脱节。

**结论：不推荐。**

### 方案 C：不用 AI Search，自建 Vectorize + Workers AI

| 维度 | AI Search | 自建 Vectorize |
|---|---|---|
| 代码量 | 少（分块/embedding/同步全托管） | 多（chunking、embedding 调用、upsert、清理都要自己写） |
| 中文质量 | 受限于它内置的 BM25 分词器 | **可自选策略**，中文可自己切词或只做纯向量 |
| 元数据过滤 | 5 字段 / 64 字节前缀 | Vectorize 本身的限制（但可自控字段设计） |
| 结构化过滤 | 弱 | 强（可与 Postgres 结合，先过滤 ID 再向量检索） |
| 计费 | 按查询次数（$0.75/1k 混合） | 按 Vectorize 查询 + Workers AI 用量 |
| 与 `ai_public` 白名单的关系 | 数据要复制出去 | 数据仍可留 DB，只把向量放 CF |
| 新鲜度 | 内置存储即时 / R2 默认 6h | 完全自己控制 |
| 离线可控性 | 索引不可导出，绑定 CF | 可重建 |

**判断**：AI Search 的优势是「**一周内能出效果**」，代价是控制力与中文分词。如果 spike 发现中文召回不达标，退回方案 C 的成本也不算高——因为 `semantic_search` 工具的**对外接口不变**，只换内部实现（这一点与 spec §19 的 P3-1「替换 `tools.ts` 内部实现，不改上层接口」完全一致）。

---

## 5. 接入方式：Binding 还是 REST？

这是本次调研里**最容易踩坑、也最该先定的技术决策**。

### 5.1 Workers binding 路径

```jsonc
// wrangler.jsonc 追加
"ai_search_namespaces": [
  { "binding": "AI_SEARCH", "namespace": "default", "remote": true }
]
```

```ts
const results = await env.AI_SEARCH.get("umhelper-kb").search({ messages: [...] });
```

在普通 Worker 里 `env` 是现成的，但**在 OpenNext 里不是**：需要

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
const { env } = getCloudflareContext();
```

而仓库现状是：**全项目零个 `getCloudflareContext` 调用，`next.config.js` 也没有 `initOpenNextCloudflareForDev()`**。也就是说要新增：

1. `wrangler.jsonc` 加 `ai_search*` binding（`cloudflare-env.d.ts` 需 `npm run cf-typegen` 重新生成，否则 TS 报错）；
2. `next.config.js` 引入 `initOpenNextCloudflareForDev()`（官方要求，否则本地 `next dev` 直接抛错）；
3. 因为 AI Search **不在本地运行**，binding 必须带 `remote: true` 才能被 `wrangler dev` / 本地开发代理到远端实例；
4. 文档示例的 `compatibility_date` 是 `2026-03-27`，本项目是 `2024-12-30`——**需要实测**这个 binding 是否要求更新 compat date。如果要求，改动将影响整个 Next 运行时的兼容行为，风险等级不低，需要独立验证。

### 5.2 REST API 路径

```ts
// lib/chat/ai-search.ts（示意）
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}` +
  `/ai-search/namespaces/default/instances/umhelper-kb/search`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: query }],
      ai_search_options: {
        retrieval: { max_num_results: 8, match_threshold: 0.4, retrieval_type: "hybrid" },
      },
    }),
    signal: AbortSignal.timeout(8000),
  },
);
```

只需增加 3 个服务端 env（`AI_SEARCH_ACCOUNT_ID` / `AI_SEARCH_API_TOKEN` / `AI_SEARCH_INSTANCE`），**不动构建链路、不动 compat date、不需要 `getCloudflareContext`**，且天然可在本地 `next dev` 下调试（这也是本项目其它外部服务的既有形态：`lib/um-proxy.ts`、`lib/telegram.ts` 都是直连 HTTP）。

### 5.3 建议

**先走 REST API（§5.2）**，理由：

- 零构建改动，不触碰 `compatibility_date` 这个高爆炸半径的开关；
- 与仓库既有的「服务端 fetch 外部 HTTP 服务」模式一致（`lib/um-proxy.ts`、`lib/telegram.ts`），新人可读性更好；
- 需要在 CI / 脚本 / 一次性回填任务里复用同一套调用逻辑时，REST 天然可复用，binding 不行；
- 未来若确认 binding 更省事（省 token 管理、免 secret 轮换），因为调用被封装在 `lib/chat/ai-search.ts` 单文件里，**替换成本可控**（与 spec §5.2 对 `lib/chat/model.ts` 的「唯一边界」处理同构）。

---

## 6. 数据同步管道（真正的工作量所在）

AI Search 没有 DB 连接器，所以**「怎么把 Supabase 的数据变成它认识的东西」是这次整合的主要工程量**。

### 6.1 导出源：复用 `ai_public`

spec 第 6 节已经定义了 `ai_public.course` / `ai_public.professor_course` / `ai_public.comment_public` 三个只读视图，并把「身份字段、`hidden`、`admin_note` 永不进视图」写成硬性公开原则，还有列集合断言测试守着。

**建议把这三个视图同时作为 AI Search 的导出源**，好处是「一份白名单，两条消费路径」：

- 不需要为 AI Search 单独定义一套字段裁剪逻辑（避免两套白名单漂移）；
- `tests/database/ai-public-views.test.ts` 的列集合断言**顺带守护了导出范围**；
- AI Search 侧一旦发现泄漏，回查口径与 SQL 路径完全一致。

### 6.2 文档粒度与元数据预算

元数据只有 5 个字段的预算，建议这样分配：

| 字段 | 类型 | 用途 |
|---|---|---|
| `doc_type` | text | `course` / `professor` / `comment`，用于把检索限定在某类内容 |
| `course_code` | text | 精确过滤（`ACCT100` 远小于 64 字节，安全） |
| `prof_name` | text | 精确过滤 |
| `updated_at` | number（或 datetime） | 配合 `boost_by` 让新内容优先 |
| 预留 1 个 | — | 留给后续（例如 `lang` 或 `source`），**不要提前占满** |

文档粒度建议：

- 一门课一个文件：`course/ACCT100.md`（课程名、学分、简介、开课单位…）
- 一位教授一个文件：`professor/<name>.md`
- 评论**按课程（或课程×教授）聚合分片**，而不是一条一文件：既能绕开文件数上限，又能让 `context_expansion` 拿到上下文；单文件用 Markdown 分节，每节带评论 id 与时间。

### 6.3 两条落地路径

**路径 1：网站数据源（零 ETL，适合 spike）**

`umeh.top` 已允许抓取且提供 sitemap → 直接建一个 Website 数据源实例，用 [path filtering](https://developers.cloudflare.com/ai-search/configuration/indexing/path-filtering/) 只放行 `/course/`、`/professor/`、`/reviews/`，排除 `/admin/`、`/api/`、`/submit/`、`/search/`、`/sign-in`、`/sign-up`（与 `app/robots.ts` 的 disallow 列表对齐）。

- 优点：**零代码**，一小时内能看到检索效果；引用天然是真实 URL，无需设计 key 布局；隐私边界自动与公开页面一致（`hidden = 1` 的评论本来就不渲染）。
- 缺点：免费档每天 500 页，全站爬完要几天；默认 6 小时同步一次，新评论不即时；爬取走 Browser Run，页面结构改动会影响解析质量。
- **适合结论：作为「AI Search 到底能不能用」的一小时 spike，不作为最终形态。**

**路径 2：内置存储 + 自建同步脚本（最终形态）**

用 `items.upload()`（或 REST 的 Items API）把导出的 Markdown 按 key 上传，配合 `items.uploadAndPoll()` 可在需要即时可搜的场景等待索引完成；隐藏/删除的评论用 Items Delete 移除。

- 内置存储**上传即索引、无 sync job**，也不受「31 天无查询自动暂停」影响。
- 触发方式：评论提交链路（`lib/submit-comment.ts` 已在写评论处）后入队增量更新；再配一个定时任务做全量对账。
- 注意：`custom_metadata` schema 一旦变更会触发**全量重建索引**，所以 5 个字段要在第一次就设计对。

### 6.4 新鲜度与一致性

| 场景 | 建议 |
|---|---|
| 新评论立刻可搜 | 走内置存储 + 写入后触发上传 |
| 评论被 `hidden = 1` | 必须同步删除对应内容，否则模型会答出「已隐藏/已删除」的内容——这是**合规问题**，不是体验问题 |
| 课程信息更新 | 一天一次全量对账即可 |
| 索引落后于 DB | 在 system prompt / 工具返回里标注数据时间，避免模型把旧索引当实时 |

### 6.5 可观测性

需要一个对账手段：定期比对「DB 中可见内容数」与 `items.list()` 的 `result_info.total_count`，以及 `status = error / skipped / outdated` 的条目。spec §13 的可观测性字段建议扩展为
`{ ..., semanticSearchCalls, semanticSearchStatus, semanticChunks, semanticCostHint }`。

---

## 7. 硬约束与风险清单

### 7.1 🔴 中文关键词检索（最高优先级风险）

`keyword_tokenizer` 只有两个选项，**都不是为中文设计的**：

| 选项 | 行为 | 对中文的效果 |
|---|---|---|
| `porter`（默认） | 英文 Porter 词干化 | 中文基本不分词，长句被当成整块 token → 召回极差 |
| `trigram` | 3 字符滑窗 | 「会计学导论」→「会计学」「计学导」「学导论」…**可召回但噪声大** |

而课程码（`ACCT100`）、教授英文名这类 ASCII 内容两档都表现良好。

**结论与缓解**：

1. 中文语义检索**主要依赖向量**（embedding 建议选多语言模型，如 `@cf/baai/bge-m3` 或 `@cf/qwen/qwen3-embedding-0.6b`，`google-ai-studio/gemini-embedding-*` / `openai/text-embedding-3-*` 也在支持列表内）；
2. 关键词通道改用 `trigram`，并把 `keyword_match_mode` 设为 `and` 提高精度（宁可召回少）；
3. **课程码 / 教授名的精确查询继续走策展工具或 `keyword` 模式**，不要交给语义通道；
4. **这是 spike 必须量化验证的第一项**：拿 20–30 条真实中文问题，测「trigram + 向量混合」与「纯向量」的召回率与噪声率，再决定是否值得继续。

### 7.2 🟠 数据外溢与供应商锁定

- 评论内容（已在站上公开）会被**复制**到 Cloudflare 托管的 R2 + Vectorize。需要明确：这在此前的威胁模型里没有出现过，spec §6 的「公开数据层」原本只被认为受 Postgres 角色权限约束。
- 索引（向量 + 关键词倒排）**无法导出**：换供应商意味着全量重建。这是实打实的锁定，与 spec §18 的「换模型只改 `AI_MODEL`」（A7）精神相悖，需要在 spec 里显式豁免。
- 缓解：导出内容严格等于 `ai_public` 白名单列；把 AI Search 当作**可丢弃的缓存**而非事实源（DB 永远是 source of truth），这样锁定成本 = 一次重建时间。

### 7.3 🟠 成本与成本型攻击

- 免费额度每月各 1,000 次查询，折算约 30–60 次多轮对话（假设每轮 2–3 次检索）——**免费额度只够验证，不够上线**。
- 匿名接口被刷会直接转化为账单。spec §13 的匿名 5 次/分、30 次/小时必须**在调用 AI Search 之前**拦截，并且要给 AI Search 调用**单独计数**（否则「策展工具命中」与「触发语义检索」的限流语义会打架）。
- 省钱手段：① 精确查询走 `keyword`（$0.10/1k，是混合价的 1/7.5）；② 开启相似度缓存；③ 策展工具优先，语义检索作为 fallback；④ `max_num_results` 收敛到 5–8。

### 7.4 🟡 其他

| 风险 | 说明 | 缓解 |
|---|---|---|
| 聚合能力缺失 | AI Search 不做 `count` / `avg` / `group by` | 保留 SQL 逃生舱；工具描述里写清「统计类问题必须走 sql_query」 |
| 元数据 5 字段 + 64 字节前缀 | 字段设计不灵活，长字符串不可过滤 | 字段定稿前做一次评审；长文本只做展示不做过滤 |
| 分块切断语义 | 一条评论被切成两半，召回片段不完整 | 用 `context_expansion: 1–2`；导出时用 Markdown 结构帮助分块 |
| 首 token 延迟 | 多一次网络往返（embedding + 检索） | 与策展工具并行发起；`AI_TIMEOUT_MS` 给检索单独设上限（建议 6–8s） |
| 结果不稳定 | 托管服务的排序/阈值调优不可见 | 用 spec §15.4 的 golden 问题集做回归，把语义检索的召回纳入 CI |
| 计费起算 | 2026-11-01 开始收费 | 若决定上线，10 月内完成 spike；否则上线时间点要重新评估成本 |

---

## 8. 成本估算

按 `cl100k_base` 口径（AI Search 明确用它统计摄取 token），并假设一条评论平均 60 token：

**一次性摄取**

```
摄取费 = (可见评论总条数 × 60 + 课程/教授文本) / 1,000,000 × $0.75
```

| 可见评论条数 | 摄取 token 量 | 摄取费 | 免费额度（5M）是否够 |
|---|---|---|---|
| 1 万 | 约 0.6 M | 约 $0.45 | 够 |
| 10 万 | 约 6 M | 约 $4.5 | 略超 |
| 50 万 | 约 30 M | 约 $22.5 | 超 |

**存储**：`$2.00 / GB-月`。纯文本 corpus 通常远小于 1 GB → 每月 **<$2** 量级。

**查询（真正的持续成本）**

```
月查询费 = 语义/混合查询数 / 1000 × $0.75  +  纯关键词查询数 / 1000 × $0.10
```

| 月对话量 | 假设每次对话触发 2 次检索 | 混合检索月费 | 若 60% 走纯 keyword |
|---|---|---|---|
| 1,000 | 2,000 | 约 $1.5 | 约 $0.72 |
| 10,000 | 20,000 | 约 $15 | 约 $7.2 |
| 100,000 | 200,000 | 约 $150 | 约 $72 |

**结论**：**摄取与存储便宜到可以忽略；成本几乎完全由「每轮对话触发几次语义检索」决定**。因此限流与「策展工具优先」不是优化项，而是**成本控制的核心机制**。相对地，自建 Vectorize 的成本模型是「向量存储 + 查询次数」，量级相近，但需要自己承担 chunking/embedding 的工程与 Workers AI 用量。

⚠️ 上表为量级估算，**上线前必须用真实语料（`supabase/schema.sql` 对应的线上库）跑一次真实 token 统计**，不要直接引用。

---

## 9. 决策建议

### 9.1 建议的推进方式

**做一次限时 spike，而不是直接写进 spec。** 具体判据：

| 步骤 | 内容 | 通过标准 |
|---|---|---|
| S1（半天） | 用**网站数据源**建实例，只放行 `/course/`、`/professor/`、`/reviews/` | 能爬进内容、能搜到东西、引用 URL 正确 |
| S2（半天） | 用 20–30 条**真实中文问题**测召回，对比 `trigram+hybrid` vs `纯 vector` vs `porter+hybrid` | 中文语义召回率可接受（建议 ≥ 80% 命中预期课程/教授），噪声可容忍 |
| S3（半天） | 写 100 行左右的 REST 调用脚本，验证：元数据过滤是否按预期生效、`item.key` 能否直接生成 spec §8.3 的 `citation` | 能产出 `{type, code, label, href}` |
| S4（半天） | 验证「课程码精确查询」在 `keyword` 模式下的表现 | `ACCT100` 这类查询 100% 精确命中 |
| S5（可选） | 在 OpenNext 下试 `getCloudflareContext` + binding，确认 compat date 是否必须升到 2026-03-27 | 若不需升级才考虑 binding 路径 |

Spike 全部通过 → 在 spec 里新增「第 8.4 节 语义检索工具」+「第 6.4 节 导出管道」+ 相应测试项，并把 §19 的 P3-1 从「pgvector」改写为「语义检索（AI Search 或 Vectorize，接口不变）」。
Spike 任一不通过（尤其 S2 中文召回）→ 走方案 C（Vectorize 自建），或维持 spec 原样把语义检索留给真正的 Phase 3。

### 9.2 建议同步修改的 spec 条目（若采纳）

- §2.1 G3：把「策展工具 + SQL 逃生舱」改为三元组；
- §4 架构图：新增 `semantic_search → AI Search` 分支与超时/降级路径；
- §6：明确 `ai_public` 三视图**同时是导出源**，并新增「导出内容 = 视图列白名单」的守护测试；
- §8：新增 `semantic_search` 工具定义（zod 入参、返回上限 8 条、单条截断 600 字符）；
- §13：新增 AI Search 调用配额、单独限流计数、成本观测字段；
- §15：golden 问题集新增「语义类」正/负样本，并纳入 CI 的检索层回归；
- §18：新增 §7 里的四条风险；
- §19 P3-1：改为「语义检索（托管或自建二选一，`tools.ts` 内部实现，上层接口不变）」。

---

## 10. 文档来源

- [AI Search 概览](https://developers.cloudflare.com/ai-search/)
- [How AI Search works](https://developers.cloudflare.com/ai-search/concepts/how-ai-search-works/)
- [Data source](https://developers.cloudflare.com/ai-search/configuration/data-source/) / [Built-in storage](https://developers.cloudflare.com/ai-search/configuration/data-source/built-in-storage/) / [Website](https://developers.cloudflare.com/ai-search/configuration/data-source/website/)
- [Syncing](https://developers.cloudflare.com/ai-search/configuration/indexing/syncing/)
- [Metadata attributes](https://developers.cloudflare.com/ai-search/configuration/indexing/metadata/) / [Filtering](https://developers.cloudflare.com/ai-search/configuration/retrieval/filtering/)
- [Keyword search](https://developers.cloudflare.com/ai-search/configuration/indexing/keyword-search/)（中文分词限制出处）
- [Supported models](https://developers.cloudflare.com/ai-search/configuration/models/supported-models/)
- [Search — Workers binding](https://developers.cloudflare.com/ai-search/api/search/workers-binding/) / [Search — REST API](https://developers.cloudflare.com/ai-search/api/search/rest-api/)
- [Items — Workers binding](https://developers.cloudflare.com/ai-search/api/items/workers-binding/) / [Items — REST API](https://developers.cloudflare.com/ai-search/api/items/rest-api/)
- [Bring your own generation model](https://developers.cloudflare.com/ai-search/how-to/bring-your-own-generation-model/)
- [Limits & pricing](https://developers.cloudflare.com/ai-search/platform/limits-pricing/)
- [AI Search is generally available（2026-10-01）](https://developers.cloudflare.com/changelog/post/2026-10-01-ai-search-generally-available/)
