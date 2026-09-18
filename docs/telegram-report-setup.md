# Telegram 举报机器人配置

`next-web` 的 `POST /api/report` 会通过 Telegram Bot 把 iOS 端提交的举报推送到指定群组。
本文记录机器人创建、群组 `chat_id` 获取、环境变量配置与排错方法。

## 1. 创建机器人

1. 在 Telegram 里搜索 `@BotFather`。
2. 发送 `/newbot`，按提示设置名称和 username。
3. BotFather 会返回一个 token，格式类似：

   ```text
   1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

这个 token 只应配置在服务端，不要提交到仓库或放进 iOS 客户端。

## 2. 把机器人拉进目标群组

把上一步创建的机器人加入接收举报的群组。建议在群组设置中将机器人设为管理员，
避免机器人因隐私模式看不到群成员消息。

如果只是用来发送消息，机器人不一定要管理员；但排查收不到消息的问题时，
管理员权限和关闭隐私模式通常更省事。

## 3. 获取群组 chat_id

### 方法一：项目内置脚本（推荐）

```bash
cd next-web

# 直接传 token
node scripts/get-telegram-chat-id.mjs <BOT_TOKEN>

# 或者使用 npm script
npm run telegram:get-chat-id -- <BOT_TOKEN>

# 也可以只通过环境变量传 token
TELEGRAM_BOT_TOKEN=<BOT_TOKEN> node scripts/get-telegram-chat-id.mjs

# 如果本机无法直连 Telegram，可以使用 HTTP 代理（Node fetch 默认不读取系统代理）
HTTPS_PROXY=http://127.0.0.1:7890 node scripts/get-telegram-chat-id.mjs <BOT_TOKEN>

# 或者使用已经可用的 Telegram API 反向代理
node scripts/get-telegram-chat-id.mjs <BOT_TOKEN> --api-base https://your-telegram-api-proxy.example
```

> 如果报错 `fetch failed`，通常是本机网络无法访问 `api.telegram.org`，而不是 token 或群组配置问题。
> 可先用 `curl -v https://api.telegram.org/bot<BOT_TOKEN>/getMe` 验证网络。若 curl 也失败，
> 需要配置代理/VPN，或使用 `--proxy` / `HTTPS_PROXY` / `--api-base`。

运行前请先在群里：

1. 把机器人拉进群；
2. 发送一条任意消息，例如 `hello`；
3. 如果机器人开启了隐私模式，可以 `@你的机器人` 发送一条消息。

脚本会调用 `getUpdates`，输出类似：

```text
┌─────────┬──────────────────────┬──────────────┬──────────────────────┬──────────┐
│ (index) │ chat_id              │ type         │ title                │ username │
├─────────┼──────────────────────┼──────────────┼──────────────────────┼──────────┤
│ 0       │ '-1001234567890'     │ 'supergroup' │ 'UMHelper Reports'   │ ''       │
└─────────┴──────────────────────┴──────────────┴──────────────────────┴──────────┘

把下面这行加到 next-web 的环境变量中（选择目标群组）：
TELEGRAM_REPORT_CHAT_ID=-1001234567890
```

`group` / `supergroup` / `channel` 类型的 `chat_id` 一般以 `-` 或 `-100` 开头，
不要漏掉负号。论坛群组的话题 ID `message_thread_id` 也可以在群消息更新中看到，
配置到 `TELEGRAM_REPORT_THREAD_ID` 后，举报会发送到指定话题。

> 如果脚本提示 `getUpdates` 不可用，说明该 Bot 当前设置了 webhook。
> 可以运行 `node scripts/get-telegram-chat-id.mjs <BOT_TOKEN> --delete-webhook`
> 删除 webhook 后重试。注意删除前确认这个 Bot 没有其它业务依赖 webhook。

### 方法二：手动调用 Telegram API

```bash
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/getUpdates" | jq
```

在返回 JSON 的以下位置查找 `chat.id`：

- `result[].message.chat.id`
- `result[].edited_message.chat.id`
- `result[].channel_post.chat.id`
- `result[].my_chat_member.chat.id`

如果没有看到群组，请确认：

- 机器人确实已在群里；
- 群里在机器人入群后发过消息，或 `@` 过机器人；
- Bot 没有被 webhook 冲突。

## 4. 配置 next-web 环境变量

本地 `.env.local`：

```bash
TELEGRAM_BOT_TOKEN=1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TELEGRAM_REPORT_CHAT_ID=-1001234567890
# 可选：论坛群组的话题 ID
TELEGRAM_REPORT_THREAD_ID=
# 可选：Telegram API 反向代理，默认 https://api.telegram.org
TELEGRAM_API_BASE_URL=
```

### 本地 Next dev 通过代理访问 Telegram

Next dev 里的 Node `fetch` 默认**不会**读取系统的 `HTTPS_PROXY` / `http_proxy`，
所以即使浏览器或代理软件正常，`/api/report` 也可能连不上 `api.telegram.org`。

Node 24+ 可以用 `--use-env-proxy` 让 `fetch` 读取代理环境变量：

```bash
cd next-web

# 方案 A：使用项目内置脚本（Node 24+）
npm run dev:proxy

# 方案 B：手动指定
NODE_USE_ENV_PROXY=1 npm run dev
# 或
NODE_OPTIONS=--use-env-proxy npm run dev
```

如果 shell 里还没有代理变量：

```bash
export http_proxy=http://127.0.0.1:7890
export https_proxy=http://127.0.0.1:7890
export no_proxy=localhost,127.0.0.1

NODE_USE_ENV_PROXY=1 npm run dev
```

把 `7890` 换成你自己的代理端口。`no_proxy` 建议包含 `localhost,127.0.0.1`，
否则 Next dev 访问本地 Supabase 也可能被代理。

> 旧版本 Node 不支持 `--use-env-proxy` 时，可以让 `TELEGRAM_API_BASE_URL`
> 指向一个可访问 Telegram 的反向代理。


生产环境：

- Cloudflare Workers：在对应 Worker 的 Settings → Variables and Secrets 添加以上变量。
- Vercel：在 Project Settings → Environment Variables 添加以上变量。
- 如果部署服务器无法直连 `api.telegram.org`，请配置 `TELEGRAM_API_BASE_URL` 指向可用的反向代理。
- 其它部署平台同理，必须保证运行时进程能读取到这些环境变量。

## 5. 验证

可以直接用 Telegram API 验证 token 和 chat_id 是否正确：

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\":\"${TELEGRAM_REPORT_CHAT_ID}\",\"text\":\"UMHelper report test\"}"
```

返回 `"ok":true` 即表示机器人可以向该群组发消息。

`POST /api/report` 需要携带 iOS HMAC 签名头，正式验证建议直接在 iOS 举报入口提交，
或参照 `next-web/docs/ios-api-research.md` 的签名规则构造请求。

## 6. 排错

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| `chat not found` | `chat_id` 错、漏了负号，或机器人不在群里 | 用脚本重新获取，并确认机器人已入群 |
| `bot was blocked by the user` | 机器人被用户/群组屏蔽 | 在群组里解除限制或重新添加 |
| `getUpdates` 报 webhook 冲突 | Bot 设置了 webhook | 确认无其它业务后加 `--delete-webhook` |
| `fetch failed` / `无法连接 Telegram API` | 本机/服务器无法访问 `api.telegram.org` | 配置代理/VPN；脚本可用 `--proxy`、`HTTPS_PROXY`、`--api-base` |
| 群里收不到消息 | 机器人没有权限或配置的 chat_id 不对 | 设为管理员，并检查环境变量 |
| 接口返回 503 | 服务端没有配置 Telegram 环境变量 | 补全 `TELEGRAM_BOT_TOKEN` 与 `TELEGRAM_REPORT_CHAT_ID` |
| 接口返回 502 | Telegram API 拒绝发送 | 查看服务端日志中的 Telegram description，按上表处理 |
