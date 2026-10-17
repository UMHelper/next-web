# AI 助手 V1 · Workers spike 验证报告 — 2026-10-18

## 结论

**需要升级 Workers Paid（待用户确认）**：助手每次请求 CPU 41–249 ms，按计划判定规则「CPU 常 ≥ 10ms」触发；但本账号目前并未按 10 ms 逐请求拦截——所有请求 `outcome=ok`，生产 `/course/[code]` 今天也是 51–71 ms 照常返回。打包、流式、多轮上文、两种思考模式全部通过，CopilotKit 方案本身可行。

## 环境

- 分支：`spike/assistant-v1-workers`（不合并）
- 依赖：`@copilotkit/react-core` 1.79.1、`@copilotkit/runtime` 1.79.1、`@ai-sdk/deepseek` 2.0.76（`ai-v6` tag）、`ai` 6.0.309
- DeepSeek：模型 `deepseek-flash`（当前由 DeepSeek-V4.1-Flash-1017 提供）；思考参数 `thinking: { type: "enabled" | "disabled" }` + `reasoning_effort: low | high | max`（API 默认开启思考、`high`），AI SDK 里是 `providerOptions.deepseek.thinking.type` / `reasoningEffort`
- 价格（USD / 1M tokens，2026-10-17 读自 api-docs.deepseek.com）：输入命中缓存 $0.003 低谷 / $0.006 高峰；未命中 $0.15 / $0.30；输出 $0.60 / $1.20。高峰为周一至周五北京时间 09:00–12:00、14:00–18:00
- Cloudflare 档位：Free（用户确认）
- 部署：**独立 Worker `next-web-staging`**（`https://next-web-staging.umhelper.workers.dev`），版本 `c5317007-17db-4ba5-aed7-09b8821bcd27`；生产 `next-web` 未改动（见「偏离计划」）

## 0. 基线（§13-6）

基线为 spike 基点 `8256c98`（Next 15.5.27）。

| 路由 | Size | First Load JS | spike 分支 First Load |
|---|---:|---:|---:|
| `/` | 10.5 kB | 175 kB | 182 kB |
| `/timetable` | 7.66 kB | 203 kB | 210 kB |
| `/course/[code]` | 1.65 kB | 132 kB | 139 kB |
| 共享 JS | | 103 kB | 109 kB |

## 1. 打包（§13-1）

- npm install：通过（added 526 / removed 40 / changed 5）
- node_modules 增量：`@copilotkit` 80M、`@ai-sdk` 25M、`ai` 9.1M；runtime 另带 `openai@7`（32M）、`@langchain`（26M）、`langchain`（4.3M）
- Worker 体积：Total Upload 38,345 KiB / gzip 7,154 KiB（基线 15,305 / 2,714）。Cloudflare 上限 64 MiB 未压缩、不限 gzip（文档 2026-10-12）→ 通过
- 启动时间：19 ms（上限 1 s）
- 需要的 workaround：**Workers 侧无**（没用 `define import.meta.url`，按请求构造 agent 未遇 global scope 报错）。构建警告：CopilotKit `channel-manager.mjs` 动态 require，不影响运行。Next 侧需要：webpack hook 把 CopilotKit v2 的 `./index.css`（Tailwind v4）换成空文件，样式改从 `public/` 用 `<link>` 加载
- `/labs/assistant-spike` First Load：661 kB（页面 498 kB）。**基线三页不是不变：各 +~7 kB**，来源是 webpack runtime 里 streamdown 的约 390 个懒加载 chunk 映射（shiki / mermaid / katex）。违背 spec G5，V1 需处理

## 2. CPU（§13-2，Free 档 10ms）

`wrangler tail --format json` 的 `cpuTime` / `wallTime`。每轮可能含多次请求（前端工具结果回传会再发一次）。

| 思考 | 轮次 | cpuTime (ms) | wallTime (ms) | outcome |
|---|---|---:|---:|---|
| off | 1 查 section | 249 | 2,066 | ok |
| off | 2 问冲突（工具调用 / 回传后作答） | 85 / 41 | 939 / 909 | ok |
| off | 3 上文 + 再查 | 229 | 2,489 | ok |
| low | 1 查 section | 106 | 3,075 | ok |
| low | 2 问冲突（工具调用 / 回传后作答） | 97 / 47 | 1,139 / 976 | ok |
| low | 3 上文 + 再查 | 123 | 2,829 | ok |

对照（同一时段，全部 `outcome=ok`）：

- staging 普通页面（无 R2 / D1 缓存，每次现渲染）：2–609 ms
- 生产 `next-web`（`wrangler tail --ip self`，只看本机请求）：`/`、`/timetable`、`/catalog` 6–17 ms；`/course/ACCT1000` 51–71 ms

解读：助手约为生产最重页面的 2–4 倍。账号目前没有因超 10 ms 返回 1102；无法从这里确认是 Free 档宽松执行还是账号档位不同。风险是 Cloudflare 收紧执行或助手流量持续时开始拦截——届时现有课程页同样受影响。

## 3. 流式（§13-3）

- Content-Type：`text/event-stream`，`cache-control: no-cache`
- 是否逐字到达：是。staging 上一次纯文本回答 44 个事件（40 个 `TEXT_MESSAGE_CONTENT`），首个事件 1.78 s、末个 3.07 s，分散 1.29 s 到达，未被缓冲成一块；本地 workerd 事件间隔约 10 ms

## 4. 多轮上文（§13-4）

- 每轮请求 `messages` 长度：第 3 轮最后一次请求带 13 条（三轮、含工具调用与工具结果）
- 客户端是否带完整历史：是（AG-UI 客户端每次请求重发全部 `messages`）
- afterRequestMiddleware：每次都触发；**`messageCount` 不等于请求历史长度**（实测 0–3，像是本次新增消息数），不能用它数「单会话 30 轮」
- 换 isolate 后第 3 轮：答对（「你第一个问的是 ACCT1000，教授是 CHAN WENG HANG」），off 与 low 都对。上文随请求走，与 isolate 无关
- 刷新后：未测（浏览器 UI 未在 spike 中测）；按设计不落库，刷新即丢

## 5. 思考模式（§13-5）

- off：稳定。三轮答案准确，回答简洁
- low：稳定，带前端工具的多轮未出现 400（本地与 staging 各一次完整三轮）。CopilotKit 不回传 `reasoning_content`，`@ai-sdk/deepseek` 发空串，DeepSeek 接受。推理 token 很少（35–75）；但出现过英文填充句「I'll look that up for you.」，本地一次编造了「2025/2026 学年第一学期」
- 每跳 token：输入 1.3k–3.5k（60–85% 命中缓存），输出 33–221
- 建议默认：**off**（更快、更省 CPU 与 token，答案没有变差）

## 其它发现

- CopilotKit runtime **默认开启遥测**（日志：`telemetry enabled`），V1 需设 `COPILOTKIT_TELEMETRY_DISABLED=true`，否则与「不外发对话」的隐私承诺冲突
- AI SDK 每次请求警告 `System messages in the prompt or messages fields`：CopilotKit 把 system / context 作为消息传入。V1 写 prompt 时留意，不影响功能
- 未测：浏览器 UI 实际渲染、登录态下前端工具 `getSections` 路径（spike 用脚本模拟客户端）

## 偏离计划

- **部署目标**：计划是在生产 `next-web` 上传预览版本；改为新建独立 Worker `next-web-staging`，生产零改动。原因：上传预览会继承生产 secrets（含生产 Clerk secret），而构建只有 Clerk 测试 key；独立 Worker 用测试 key 一套
- **无 R2 / D1**：用户账号在 Umacauhelper 账户里只有 Workers Admin 角色，建 R2 bucket / D1 返回 Authentication error。spike 分支 `open-next.config.ts` 改为 OpenNext 内置 dummy 缓存，`wrangler.jsonc` 加 `env.staging`（采样率 1）。不影响助手接口（动态路由不经缓存），但 staging 页面 CPU 偏高
- **CPU 读取方式**：用 `wrangler tail` 的 `cpuTime`，未改生产 observability 采样率
- Task 1：版本用 caret 范围而非精确锁定；`@ai-sdk/deepseek` 用 `ai-v6` tag（latest 3.x 依赖 `ai` 7）
- Task 3：`/api/copilotkit/[[...slug]]` 加入 `tests/security/api-route-guards.test.ts` 白名单（token 门控，非公开）
- Task 4：CSS stub 与 `public/` 样式文件见 §1；labs 页加入同一白名单
- spike token 请求头为 `x-spike-token`，思考模式头 `x-spike-thinking`
