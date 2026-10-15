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
| Step 4 | **改为由 CI 发布**（见第 6 节）：合并时会自动发布；成功后把 `MCP_REGISTRY_PUBLISHED` 置 `true` |
| Step 5 | 决定 `.agents/plugins/marketplace.json` 是否纳入版本控制（现被 `.gitignore` 忽略）；否则改由页面给出创建该文件的命令 |
| Step 6 | （可选）用 `mcp-submit` 投递第三方目录 |
| Step 7 | 在 `/support`、页脚、iOS App「关于」加入 `/ai` 入口 |

### 未决问题（沿用 spec §9）

- **U1**：registry 按钮用第三方链接（默认）还是嵌入 web component；
- **U3**：**发布前**必须用一台免费/学生 GitHub 账号实测 "Copilot Free 能用 MCP" 这一结论（依据是官方策略的排除性表述，尚未实测）；
- **U5**：站点 `SITE_NAME` 现为 `What2Reg@UM`（commit `9053532`），而插件 `displayName` 为 `What2REG@UM` —— **大小写不一致**，需择一。接入页已改为引用 `SITE_NAME` 常量，故该项决定后无需再改页面；
- **U6**：`/ai` 路由名（备选 `/connect`、`/use-in-ai`）。

## 6. 接入页改造与 CI 发布（2026-10-15 后续）

第一版页面按评审意见重做，同时把 registry 发布从「本机手动」改成「CI 自动」。

### 6.1 接入页改造要点

| 主题 | 结论 |
| --- | --- |
| 交互 | 初始只有一排 App 图标；点选后**同一组 DOM** 用 CSS 过渡缩小，面板在下方展开；再点一次收回 |
| 动画 | 高度用 `grid-template-rows: 0fr↔1fr` + opacity 过渡（实测采样 0→101→189→243→278→297→306px 缓出收敛）；文字分三段进场（延迟 0 / 80 / 160ms，全部 `fill-mode-both`，否则延迟期间会先闪出） |
| 收回闪烁 | 根因是收回时立刻 `hidden` → 内容瞬间消失而高度仍在过渡。加 `retainedId` 让面板留到动画结束；实测 21–320ms 期间 `display: block`，387ms 才卸載 |
| 移动端 | 实测查出两个真 bug：① `min-h-11` **不是 Tailwind 3 的有效类**，标签高度只有 38px → 改 `min-h-[44px]`；② grid 子项默认 `min-width: auto`，长命令把 `<pre>` 撑到 616px 并被外层裁掉 → 两栏加 `min-w-0`，现在 358px 且可横向滚动 |
| 品牌渐变 | 站上惯例：**文字**用 `wordmark` 渐变且只包品牌名/极短强调词（`navbar-list.tsx`、`banner.tsx`），**色块**用 `brand` 渐变（`course-header.tsx`）。第一版把整句话都套了渐变，已改为只包产品名 |
| 文案 | 删掉中文版、说明句、`Good to know` 披露块、底部 Support 按钮；改掉「sign in with UMHelper」（团队名不是账号）与所有方位词（「below」在桌面两栏布局下是错的） |
| Ask AI | 不是页尾独立区块，而是图标行里的**第 6 项**，面板结构与其余客户端完全一致，snippet 即那段可粘贴的 prompt |
| 徽章对齐 | 24px 圆形编号对 20px 行高，需 `-mt-0.5`；实测 delta 由 4px 改为 0 |

### 6.2 CI 发布（`.github/workflows/publish-mcp.yml`）

- 认证用 **`mcp-publisher login github-oidc`**：OIDC token 由 GitHub 运行时签发，**仓库内不需要存任何密钥**，命名空间 `io.github.UMHelper/*` 由 token 的仓库归属证明；
- 触发：push 到 main 且动到 `mcp/server.json` / 打 `mcp-v*` tag / 手动 dispatch；
- 因 registry **不允许覆盖同一版本**，加了「版本真的变了」闸：比对 `git show HEAD^:mcp/server.json` 与当前版本，未升版则跳过（本地彩排验证：未升版跳过、升版发布）；
- 发布前先跑 `mcp-publisher validate`。

### 6.3 `mcp-publisher validate` 抓到的真问题

JSON Schema 里**没有** `description` 长度限制，但 registry 服务端限制 **100 字符**，原描述 200 字符被 422 拒绝：

```
422 body.description  expected length <= 100
```

已改短为 65 字符，并加测试钉住 ≤100。

### 6.4 验证

- `tests`：938 项全过；`tsc` / `lint` / `next build` 均为 0；
- 以上所有几何/动画/颜色结论均来自 Chrome DevTools Protocol 实测（`/tmp/measure-*.mjs`），非目测。
