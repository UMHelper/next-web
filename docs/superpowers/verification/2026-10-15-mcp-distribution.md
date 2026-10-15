# MCP 分发与接入 —— 实施记录（2026-10-15）

> 对应 spec：`../specs/2026-10-15-umhelper-mcp-distribution-design.md`
> 范围：Step 1–3（纯代码部分）。Step 4–7 需人工/控制台操作，列在文末。
> 前置：MCP 服务与插件包已完成并端到端验证，见 `2026-10-05-umhelper-mcp-plugin.md`。

## 1. 已交付产物

| 产物 | 路径 | 说明 |
| --- | --- | --- |
| 接入页 | `app/ai/page.tsx` | 匿名可達、雙語（`?lang=zh`）、走 SEO（未 noindex）、已進 sitemap |
| 文案与链接常量 | `lib/ai-onboarding.ts` | 双语内容 + 各客户端深链 **builder**（`buildCursorDeeplink` 等） |
| Registry 元数据 | `mcp/server.json` | `io.github.UMHelper/what2reg-um`，`remotes[0] = streamable-http → https://umeh.top/mcp` |
| 链接打印脚本 | `scripts/build-mcp-links.mjs` | `npm run mcp:links`，零依赖 |
| 测试 | `tests/ai-onboarding.test.ts`、`tests/components/ai-page.test.tsx` | 24 项 |

## 2. 关键实现决策（与 spec 的偏差）

- **spec §4.1/§5.4 原写「脚本生成并把深链写进 `lib/`」**。实现改为：**builder 在 `lib/ai-onboarding.ts`（单一实现、可测）**，`scripts/build-mcp-links.mjs` 只负责**读取** `mcp/server.json` 与插件清单后**打印**链接与命令。理由：避免"生成文件 + 提交产物"这种需要靠测试维持新鲜度的模式；同时仍然满足"深链不得手写"的要求（页面里的链接全部来自 builder）。spec 已同步更正。
- **`mcp/server.json` 的字段先对着官方 schema 校验过**（`https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`）：必填仅 `name`/`description`/`version`；`name` 正则 `^[a-zA-Z0-9.-]+/[a-zA-Z0-9._-]+$` 允许大写，故 `io.github.UMHelper/...` 合法；`remotes` 项的类型枚举为 `streamable-http` / `sse`。
- **页面内层组件不得为 `async`**：`AiOnboardingPage` 最初写成 `async`，服务端渲染没问题，但 jsdom 下的组件测试会渲染失败（`Objects are not valid as a React child (found: [object Promise])`）。已改为同步组件；只有需要 `await searchParams` 的外层 `Page` 保持 `async`。
- **registry 指针按钮受 `MCP_REGISTRY_PUBLISHED` 门控**（当前 `false`），并用一条"把常量 mock 成 true"的测试证明它在发布后会出现。

## 3. 验证结果

- `tests/ai-onboarding.test.ts` + `tests/components/ai-page.test.tsx`：**24 项通过**，覆盖
  - `server.json` 的命名空间、唯一 remote、与插件版本一致性、无凭据；
  - 深链**解码回圈**：Cursor = base64 → `{"url": …}`；VS Code = URL-decoded JSON → `{"type":"http","url": …}`；Goose/LM Studio/CLI 命令；
  - 所有链接不含 token/secret/bearer；
  - 每个客户端区块都有前置条件；ChatGPT 与 Codex **必须**含付费提示（英文与中文都测）；
  - 中文版是完整翻译（客户端 id、 bullets、段落数一一对应），非占位；
  - `/ai` 未 noindex、canonical 与 `zh-Hant` alternate 正确、sitemap 含 `/ai`。
- 仓库全量：**164 文件 / 922 测试通过**；`tsc` / `lint` / `next build` / `build:pages` 全部为 0；构建产物含 `ƒ /ai`。
- 真实 HTTP（`npm run dev`）：`/ai` 200 且含 "Choose your tool"、"Needs a paid ChatGPT plan"、`https://umeh.top/mcp`、`umhelper:read`、`codex plugin add`、`MCP: Add Server`；`install.apicommons.org` 出现 **0 次**（门控生效）；`/ai?lang=zh` 200 且含「選擇你的工具」。

## 4. 顺带修复的既有问题

- `tests/security/api-route-guards.test.ts` 的**公开页面清单**新增 `/ai`（该测试专门用来发现"新增页面是否被有意识地声明为公开"，属预期改动）。
- `tests/seo/metadata.test.ts` 断言的是**旧品牌拼写**（`What2Reg @ UM`）。提交 `9053532 fix(site): remove spaces from SITE_NAME and SITE_SHORT_NAME` 改了 `lib/site.ts` 但没同步该断言，**该测试在本仓库的 `main` 上本来就是红的**（与本次改动无关）。已更新为新值并在注释里说明"品牌变更应当在此处显式失败一次"。

## 5. 仍未完成（需人工/控制台）

| 步骤 | 内容 |
| --- | --- |
| Step 4 | `mcp-publisher login github` + `mcp-publisher publish`；成功后把 `MCP_REGISTRY_PUBLISHED` 置 `true` |
| Step 5 | 决定 `.agents/plugins/marketplace.json` 是否纳入版本控制（现被 `.gitignore` 忽略）；否则改由页面给出创建该文件的命令 |
| Step 6 | （可选）用 `mcp-submit` 投递第三方目录 |
| Step 7 | 在 `/support`、页脚、iOS App「关于」加入 `/ai` 入口 |

### 未决问题（沿用 spec §9）

- **U1**：registry 按钮用第三方链接（默认）还是嵌入 web component；
- **U3**：**发布前**必须用一台免费/学生 GitHub 账号实测 "Copilot Free 能用 MCP" 这一结论（依据是官方策略的排除性表述，尚未实测）；
- **U5**：站点 `SITE_NAME` 现为 `What2Reg@UM`（commit `9053532`），而插件 `displayName` 为 `What2REG@UM` —— **大小写不一致**，需择一。接入页已改为引用 `SITE_NAME` 常量，故该项决定后无需再改页面；
- **U6**：`/ai` 路由名（备选 `/connect`、`/use-in-ai`）。
