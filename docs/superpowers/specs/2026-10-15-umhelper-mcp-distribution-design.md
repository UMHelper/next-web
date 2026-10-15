# What2Reg @ UM MCP 分发与接入设计

> 状态：Steps 1–4 完成（registry 已发布，由 CI 自动发布）；Step 5 待決；U3/U5/U6 仍待決策
> 日期：2026-10-15
> 产品名称：`What2REG@UM 澳大選咩課`（开发团队：`UMHelper`，命名规范见 `2026-10-05-umhelper-gpt-plugin-design.md` §11.1）
> 前置：`2026-10-05-umhelper-gpt-plugin-design.md` —— MCP 服务与插件包已完成，生产端到端验证通过（见 `../verification/2026-10-05-umhelper-mcp-plugin.md` 第 12 条）
> 本文范围：**分发与接入**，不修改 MCP 协议、工具契约或鉴权模型

## 1. 背景与问题

MCP 服务本身已经可用：`https://umeh.top/mcp` 通过 Clerk OAuth 2.1 + PKCE + CIMD 完成授权，五个只读工具已在生产用真实 token 验证（含分页）。插件包（`plugins/what2reg-um/`）也已在 ChatGPT 桌面端的 Codex 里本地安装成功。

问题不在服务端，而在**分发的最后一公里**。三条硬约束（均于 2026-10-15 核实）：

1. **OpenAI 公共目录不可达**。提交需要"已验证开发者身份"（individual / business verification），而 OpenAI 的[支持地区列表](https://developers.openai.com/api/docs/supported-countries)（208 项）**不含澳门、香港、中国大陆**，大陆发卡行的银行卡也不被接受。该页明确警告：在列表之外使用服务可能导致账号被限制。
2. **ChatGPT 侧的自定义连接器要 Plus 及以上**。[定价页](https://learn.chatgpt.com/docs/pricing)的功能对照表只列 `plus / pro / business / enterprise`（外加 `api`），`Plugins`、`Connectors`、`MCP` 三行都是这四档 available —— **Free（$0）与 Go（$8）不在其中**。Free/Go 能用 Codex 做轻量任务，但加不了 MCP/插件。即：ChatGPT 路径的实际门槛是 **$20/月**。
3. **但存在一条对学生几乎零成本的路径**。GitHub 文档在说明 MCP 策略时写明：

   > "The MCP policy only applies to users who have a Copilot **Business or Enterprise** subscription… **Copilot Free, Copilot Pro, Copilot Pro+, or Copilot Max do not have their MCP access governed by this policy.**"

   而 [GitHub Copilot 计划页](https://docs.github.com/en/copilot/get-started/plans)列出 **Copilot Student**：*"Available to verified students. Get access to Copilot's features for free."* VS Code 同时提供 `MCP: Add Server` 命令面板流程、[MCP Registry 面板](https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/customize-copilot/extend-copilot-with-tools-and-context/extend-copilot-chat-with-mcp)与 `code --add-mcp` CLI。

**结论**：面向"同学们"的主要分发路径应当是 **网站 + iOS App**（已是既成事实），MCP 是给"已经在用 AI 工具那部分同学"的增量入口，而这部分增量里**最大的一块是 VS Code/Copilot（学生免费）**，不是 ChatGPT。

## 2. 目标与非目标

### 2.1 目标

- **G1**：把 `what2reg-um` 发布到**官方 MCP Registry**，使用可被所有 MCP 客户端消费的标准元数据，且完全不依赖 OpenAI 审核。
- **G2**：在站内提供**唯一权威的接入页**，同学不需要读 README 或翻聊天记录就能装好。
- **G3**：接入方式以**指针**（registry 名称 / 站内常量）表达，而不是把各客户端深链格式硬编码进页面，避免客户端版本漂移导致链接失效。
- **G4**：明确标注每条路径的**前置条件**（尤其"ChatGPT 需要 Plus"），避免同学白折腾。
- **G5**：让 Codex 用户能用**两条命令**安装（仓库 marketplace）。
- **G6**：不新增服务端接口、不新增数据表、不改变 `/mcp` 的鉴权或工具契约；接入页是纯静态内容。
- **G7**：新增产物继续通过现有 Vitest / `tsc` / `lint` / `next build` / OpenNext build 门槛。

### 2.2 非目标

- **N1**：不绕过 OpenAI 的地区或身份限制（不使用 VPN 伪装、不借用他人身份或银行卡）。
- **N2**：不实现站内聊天、模型调用、RAG 或 `/assistant`（沿用插件 spec 的 N5）。
- **N3**：不新写一套 MCP 服务端；不在接入页暴露任何 token、scope 细节或内部 ID。
- **N4**：不为每个客户端维护长期格式表（见 G3）；第三方格式表只作为**构建期参考来源**。
- **N5**：不引入第三方运行时脚本到生产页面（见 §9 未决问题 U2）。
- **N6**：不改动现有 `/support`、隐私政策、服务条款的既有内容，只做必要的交叉链接。

## 3. 核心决策

### 3.1 以官方 MCP Registry 作为分发中枢

Registry 的 [`remotes`](https://modelcontextprotocol.io/registry/remote-servers) 属性原生支持远程服务器，我们的服务天然符合：

```json
{ "type": "streamable-http", "url": "https://umeh.top/mcp" }
```

它**只托管元数据**，远程服务器**不需要发布 npm 包**；认证方式决定命名空间，用 GitHub 认证即得 `io.github.UMHelper/*`（我们有该 org）。发布一次即可被 VS Code（含 Copilot 的 MCP Registry 面板）、Cursor、Claude、MCP Inspector 等消费。

代价：Registry 目前标注为 **preview**（可能发生破坏性变更或数据重置）；发布需要人工做一次 GitHub 设备码授权。

### 3.2 站内接入页是唯一权威入口

README、聊天记录、第三方目录都会过期，站内页面不会。所有对外渠道（插件 listing 的 support URL、网站页脚、iOS App、社群公告）都指向同一个路径。

### 3.3 按钮带指针，不带载荷

深链的 `config` 是**明文**放在 URL 里的。我们这种 OAuth 远程服务器只有一个 URL，确实可以做静态深链；但客户端格式频繁变化（Cursor 自家就同时存在 `cursor://` scheme 与 `https://cursor.com/en/install-mcp` 两种形态）。因此：

- 页面**主按钮**使用「registry 名称」这一**指针**（见 §5.3）；
- 静态深链只作为**兜底**，并且集中定义在**一处常量**里，便于一次性修订。

### 3.4 ChatGPT / Codex 是次要渠道，且必须标注门槛

它们仍要写进页面（有同学确实买了 Plus），但**每块顶部必须有前置条件提示**，不能让人点了半天才发现要付费。

### 3.5 接入页走 SEO，不做 noindex

与法律页不同，本页是**获客/引导型内容**（"选咩课 怎么在 ChatGPT 里用"），应当被索引并进 sitemap。

## 4. 产物与架构

### 4.1 产物清单

| 产物 | 路径 | 类型 |
| --- | --- | --- |
| Registry 元数据 | `mcp/server.json`（仓库内版本化） | 新增 |
| 接入页 | `app/ai/page.tsx` | 新增 |
| 文案与链接常量 | `lib/ai-onboarding.ts`（含各客户端深链 builder） | 新增 |
| 深链打印脚本 | `scripts/build-mcp-links.mjs`（`npm run mcp:links`） | 新增 |
| Codex marketplace | `.agents/plugins/marketplace.json`（当前被 `.gitignore` 忽略） | 改变跟踪策略 |

### 4.2 为什么把文案抽到 `lib/`

接入页与 `/support` 一样是双语内容页，但比法律页更依赖**精确的技术字符串**（URL、命令、深链）。把这些抽到 `lib/ai-onboarding.ts` 后：

- 页面组件保持纯渲染；
- 测试可以对**数据**断言（每条片段都含精确 production URL、深链不含 token），而不是对 JSX 做脆弱匹配。

## 5. 详细契约

### 5.1 `mcp/server.json`

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.UMHelper/what2reg-um",
  "title": "What2REG@UM 澳大選咩課",
  "description": "Read-only University of Macau course, instructor, public review and class-section data, with reference links back to what2reg. Built by the UMHelper developer team.",
  "version": "0.1.0",
  "websiteUrl": "https://umeh.top",
  "repository": { "url": "https://github.com/UMHelper/next-web", "source": "github" },
  "remotes": [{ "type": "streamable-http", "url": "https://umeh.top/mcp" }]
}
```

约束：

- `name` 必须以 `io.github.UMHelper/` 开头（GitHub 认证的命名空间规则）；若改用 DNS 认证则须改为 `top.umeh/*` 并配置 TXT 记录 —— **本设计选 GitHub 认证**。
- `version` 与 `plugins/what2reg-um/plugin.json` 的 `version` 保持一致，避免两处漂移（由测试守护，见 §6.1）。
- 发布命令（人工执行一次，需 GitHub 设备码授权）：

  ```bash
  mcp-publisher login github
  mcp-publisher publish
  ```

### 5.2 接入页信息架构

路由 `/ai`，沿用 `components/legal-content.tsx` + `?lang=zh` 的双语机制（与 `/support` 一致）。

页面顺序：

1. **一句话说明**：What2REG@UM 是什么，MCP 能做什么（查课程/教师/公开评价/班次，只读）。
2. **选择你的工具**（区块顺序 = 推荐顺序）：
   - **VS Code + GitHub Copilot**（推荐，学生可免费）→ `MCP: Add Server` / `code --add-mcp` / Registry 面板
   - **Cursor / Claude Code / 其他 MCP 客户端** → 一节配置片段
   - **ChatGPT**（**标注需 Plus**）→ Developer Mode 连接器步骤
   - **Codex**（**标注需 Plus**）→ 两条命令
3. **授权说明**：首次连接会跳转 Clerk 登录与同意页，授权 scope 为 `umhelper:read`，可随时在账号设置撤销。
4. **数据边界**：只读；不返回邮箱、评论者身份、隐藏内容、图片、个人课表；所有结果带 `umeh.top` 引用链接；非澳门大学官方意见。
5. **排错**：常见失败（未授权 / 无结果 / 限流）与对应处理；指向 `/support`。

### 5.3 各客户端接入方式（页面展示内容）

| 客户端 | 主入口 | 确定性来源 |
| --- | --- | --- |
| **VS Code** | ① Registry 面板 ② `code --add-mcp '{"name":"what2reg-um","type":"http","url":"https://umeh.top/mcp"}'` | [VS Code 文档](https://code.visualstudio.com/docs/copilot/customization/mcp-servers)；配置根键 `servers` |
| **Cursor** | ① registry 指针按钮 ② 兜底深链（§5.4） | [Cursor install links](https://cursor.com/docs/mcp/install-links)；配置 `~/.cursor/mcp.json`，根键 `mcpServers` |
| **Claude Code** | `claude mcp add --transport http what2reg-um https://umeh.top/mcp` | [Claude Code MCP 文档](https://docs.claude.com/en/docs/claude-code/mcp) |
| **ChatGPT**（需 Plus） | Settings → Connectors → Developer mode → Add → `https://umeh.top/mcp` | 见插件 spec §5.6 的同意页配置 |
| **Codex**（需 Plus） | `codex plugin marketplace add UMHelper/next-web` + `codex plugin add what2reg-um@what2reg-local` | 已在桌面端实测通过 |

**指针按钮**（推荐主入口，需先完成 §5.1 发布）：

```text
https://install.apicommons.org/?name=io.github.UMHelper/what2reg-um
```

该链接在点击时解析 registry 名称、探测用户 OS 与客户端，再渲染正确的安装方式；我们的 URL 或传输方式变化时，已发出的链接依然正确。

### 5.4 深链格式与编码规则（兜底用，集中定义）

已核实的编码差异（**各家不同，不可混用**）：

| 客户端 | 模板 | `config` 编码 | 配置结构 |
| --- | --- | --- | --- |
| Cursor（官方 scheme） | `cursor://anysphere.cursor-deeplink/mcp/install?name=$NAME&config=$CFG` | **base64** | `{"url": …}` |
| Cursor（HTTPS 形式） | `https://cursor.com/en/install-mcp?name=$NAME&config=$CFG` | **base64（再 URL-encode）** | `{"url": …}` |
| VS Code | `https://vscode.dev/redirect/mcp/install?name=$NAME&config=$CFG` | **URL-encoded JSON** | `{"type":"http","url":…}` |
| VS Code Insiders | 同上域名换 `insiders.vscode.dev` 并追加 `&quality=insiders` | 同上 | 同上 |
| LM Studio | `lmstudio://add_mcp?name=$NAME&config=$CFG` | **base64** | `{"url": …}` |
| Goose | `goose://extension?url=…&type=streamable_http&id=…&name=…` | 摊平查询参数 | — |

硬性要求：

- **base64 必须走 UTF-8 安全路径**（`btoa(unescape(encodeURIComponent(json)))`），否则含中文的配置会抛异常。
- 深链中**禁止出现 token、client secret、scope 之外的凭据**；我们的配置里只有 URL，OAuth 由客户端自行发起。
- 深链由 `lib/ai-onboarding.ts` 的 builder **计算**得出，**不允许手写** base64 字面量；测试对每条链接做解码回圈断言（§6.2）。
- `scripts/build-mcp-links.mjs`（`npm run mcp:links`）**不重复实现**这些模板，而是读取 `mcp/server.json` 与插件清单后打印全部链接与命令，供文档、README 或人工核对使用 —— 单一实现，零依赖。

### 5.5 隐私与安全

- 接入页**不采集任何输入**，不引入分析脚本（与站点现有分析策略一致；若站点已有 GA，则沿用其既有同意机制，不新增第三方）。
- 不上报用户选择了哪个客户端（避免构造新的行为指纹）。
- 页面不展示 scope 之外的内部细节（不写 Clerk instance、不写 `MCP_RESOURCE_URL` 之外的端点）。
- registry 元数据里**不得**包含密钥；`server.json` 只有公开 URL。

### 5.6 文案规范

- 产品名一律 `What2REG@UM 澳大選咩課`（短形式 `What2REG@UM`），团队名 `UMHelper` 只出现在归属句（spec §11.1）。
- 每条路径必须给出**前置条件**（"需要 ChatGPT Plus"、"需要 GitHub 学生认证"）。
- 明确"数据非澳门大学官方意见"，与 `/support`、隐私政策保持一致。

## 6. 测试设计

### 6.1 `server.json` 守护测试

- `name` 匹配 `/^io\.github\.UMHelper\//`；
- `version` 与 `plugins/what2reg-um/plugin.json` 的 `version` 相等；
- `remotes` 恰有一项且 `url === "https://umeh.top/mcp"`、`type === "streamable-http"`；
- `description` 不含 `token`/`secret` 等字样（防误贴）。

### 6.2 接入片段与深链守护测试

针对 `lib/ai-onboarding.ts`：

- 每条客户端片段都包含精确的 `https://umeh.top/mcp`（不接受占位符或环境变量）；
- Cursor 深链能被 base64 解码回 `{"url":"https://umeh.top/mcp"}`；
- VS Code 深链能被 `decodeURIComponent` 解析回 `{"type":"http","url":"https://umeh.top/mcp"}`；
- 所有深链**不含** `token`/`secret`/`Bearer` 字样；
- ChatGPT 与 Codex 两条路径的文案**必须**包含付费/计划提示（防止有人删掉提示）；
- 未发布 registry 时，页面不得出现指向 `install.apicommons.org` 的链接（由 `MCP_REGISTRY_PUBLISHED` 常量控制，见 §9 U1）。

### 6.3 页面与 SEO

- 双语渲染存在（`?lang=zh` 命中中文文案）；
- `metadata.alternates.languages` 含 `en` 与 `zh-Hant`；
- 页面**未被** `noIndexMetadata` 包裹；
- sitemap 包含 `/ai`。

## 7. 实施顺序

1. ~~**Step 1**：`lib/ai-onboarding.ts` 常量 + `scripts/build-mcp-links.mjs` + 测试（§6.2）。~~ **已完成**
2. ~~**Step 2**：`app/ai/page.tsx` 页面 + SEO/sitemap + 测试（§6.3）。~~ **已完成**
3. ~~**Step 3**：`mcp/server.json` + 测试（§6.1）**并提交**（不含发布动作）。~~ **已完成**
4. ~~**Step 4**：发布到 Registry。~~ **已完成**：改用 `.github/workflows/publish-mcp.yml` 由 CI 以 `github-oidc` 自动发布（无需密钥），`io.github.UMHelper/what2reg-um@0.1.0` 已 `active`，`MCP_REGISTRY_PUBLISHED` 已置 `true`。
5. **Step 5**：`.agents/plugins/marketplace.json` 纳入版本控制（或改为在页面里给出创建该文件的命令），使 Codex 路径对同学可用。
6. **Step 6（人工，可选）**：投递第三方目录（Smithery / mcp.so / Glama / PulseMCP，可用 `mcp-submit`）。
7. **Step 7**：在 `/support`、页脚、iOS App「关于」里加入 `/ai` 的入口链接。

## 8. 验收标准

- **A1**：Registry 上能按 `io.github.UMHelper/what2reg-um` 查到本服务器，且 `remotes` 指向生产 URL。
- **A2**：`/ai` 页面匿名可达、双语可用、被索引，且每个客户端段落都有前置条件提示。
- **A3**：按页面步骤，在一台**未配置过**的机器上能够：VS Code 里 30 秒内加好服务器并成功调用一次 `get_course`。
- **A4**：Cursor 深链点击后弹出安装确认，导入的配置与 §5.4 完全一致。
- **A5**：`tsc` / `lint` / `next build` / `tests` 全部为 0；新增测试覆盖 §6.1–§6.3。
- **A6**：文档同步 —— 插件 spec 的「仍未人工完成」表更新为"分发与接入见本文"，验证记录追加一条。

## 9. 风险与未决问题

- **U1（需你决定）**：`install.apicommons.org` 是第三方服务，其 web component 是外部脚本。方案：① 只用它的**链接**（点击时用户离开我们站点，隐私影响最小）；② 嵌入 web component（体验最好，但引入第三方脚本，与 N5 冲突）；③ 自建等价页面（可控，但要自己维护或定期同步 `clients.json`）。**默认取 ①**，并在 registry 发布前隐藏该按钮。
- **U2**：MCP Registry 处于 preview，schema 或认证方式可能变更；若命名空间规则变化，`server.json` 的 `name` 需要重新发布（旧名不会自动迁移）。
- **U3**：VS Code 侧"Copilot Free/Student 可用 MCP"依据的是官方策略文档的**排除性表述**（该策略不管 Free/Pro/Pro+/Max），尚未在免费账号上实测。**Step 4 之前应在一台免费/学生账号上实测一次**，若不可用则页面把它降级为"需要 Copilot 订阅"并调整推荐顺序。
- **U4**：ChatGPT 网页版的「上传插件 ZIP」入口对部分账号报 `Couldn't add plugin. Try again.`（三版对照包均失败，包括 10 月 5 日那版），原因未明、不可控。本设计不依赖该入口。
- **U5**：站点自身的 `SITE_NAME` 仍是旧拼写 `What2Reg @ UM`（约 80 处），本页文案采用新拼写会造成同站两套写法 —— 需与"是否全站改名"一并决策（插件 spec §11.1 已记为遗留项）。
- **U6**：`/ai` 路由名待确认。备选：`/connect`、`/use-in-ai`。选 `/ai` 的理由是短且与站点既有命名不冲突。

## 10. 参考资料

- OpenAI 支持地区：https://developers.openai.com/api/docs/supported-countries
- ChatGPT 各计划功能矩阵：https://learn.chatgpt.com/docs/pricing
- ChatGPT 插件（含网页版 ZIP 上传说明）：https://help.openai.com/articles/20001256-plugins-in-chatgpt
- MCP Registry 发布远程服务器：https://modelcontextprotocol.io/registry/remote-servers
- MCP Registry 认证与命名空间：https://modelcontextprotocol.io/registry/authentication
- VS Code 扩展 Copilot Chat 的 MCP：https://docs.github.com/en/copilot/how-tos/copilot-in-your-ide/customize-copilot/extend-copilot-with-tools-and-context/extend-copilot-chat-with-mcp
- GitHub Copilot 计划（含 Copilot Student）：https://docs.github.com/en/copilot/get-started/plans
- Cursor MCP 安装链接：https://cursor.com/docs/mcp/install-links
- 各客户端安装格式开放注册表：https://install.apicommons.org/clients.json
