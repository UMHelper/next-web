#!/usr/bin/env node
/**
 * 获取 Telegram 群组/频道的 chat_id。
 *
 * 用法：
 *   node scripts/get-telegram-chat-id.mjs <BOT_TOKEN>
 *   TELEGRAM_BOT_TOKEN=<BOT_TOKEN> node scripts/get-telegram-chat-id.mjs
 *   node scripts/get-telegram-chat-id.mjs <BOT_TOKEN> --delete-webhook
 *
 * 步骤：
 *   1. 在 @BotFather 创建机器人并获取 token。
 *   2. 把机器人拉入目标群组。
 *   3. 在群里发送一条消息，或 @ 一下机器人（取决于机器人的隐私模式）。
 *   4. 运行本脚本，输出中的 chat_id 就是群组 ID。
 */

const args = process.argv.slice(2);

function readOption(name) {
    const index = args.indexOf(name);
    if (index === -1) return undefined;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
        console.error(`参数 ${name} 缺少值`);
        process.exit(1);
    }
    return value;
}

if (args.includes("--help") || args.includes("-h")) {
    console.log(`用法:
  node scripts/get-telegram-chat-id.mjs <BOT_TOKEN>
  TELEGRAM_BOT_TOKEN=<BOT_TOKEN> node scripts/get-telegram-chat-id.mjs
  node scripts/get-telegram-chat-id.mjs <BOT_TOKEN> --delete-webhook
  node scripts/get-telegram-chat-id.mjs <BOT_TOKEN> --api-base <URL>
  node scripts/get-telegram-chat-id.mjs <BOT_TOKEN> --proxy <PROXY_URL>

环境变量:
  TELEGRAM_BOT_TOKEN       Bot token
  TELEGRAM_API_BASE_URL    Telegram API 地址，默认 https://api.telegram.org
  HTTPS_PROXY / HTTP_PROXY / ALL_PROXY
                           可选 HTTP 代理；Node fetch 默认不读取系统代理
`);
    process.exit(0);
}

const deleteWebhook = args.includes("--delete-webhook");
const optionValueFlags = new Set(["--api-base", "--proxy"]);
const tokenArg = args.find((arg, index) => {
    if (arg.startsWith("--")) return false;
    return !optionValueFlags.has(args[index - 1]);
});
const token = (tokenArg ?? process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

if (!token) {
    console.error("缺少 Bot Token。");
    console.error("用法: node scripts/get-telegram-chat-id.mjs <BOT_TOKEN>");
    console.error("或: TELEGRAM_BOT_TOKEN=<BOT_TOKEN> node scripts/get-telegram-chat-id.mjs");
    process.exit(1);
}

const apiBase = (
    readOption("--api-base") ??
    process.env.TELEGRAM_API_BASE_URL ??
    process.env.TELEGRAM_API_BASE ??
    "https://api.telegram.org"
).replace(/\/+$/, "");

const proxyUrl = (
    readOption("--proxy") ??
    process.env.HTTPS_PROXY ??
    process.env.https_proxy ??
    process.env.HTTP_PROXY ??
    process.env.http_proxy ??
    process.env.ALL_PROXY ??
    process.env.all_proxy ??
    ""
).trim();

let dispatcher;
if (proxyUrl) {
    try {
        const { ProxyAgent } = await import("undici");
        dispatcher = new ProxyAgent(proxyUrl);
        console.log(`使用代理: ${proxyUrl}`);
    } catch (error) {
        console.error("代理加载失败，请确认已执行 npm install，且当前 Node 支持 undici。");
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

const apiUrl = (method) => `${apiBase}/bot${token}/${method}`;

async function callTelegram(method, payload) {
    let response;
    try {
        response = await fetch(apiUrl(method), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload ?? {}),
            cache: "no-store",
            ...(dispatcher ? { dispatcher } : {}),
        });
    } catch (error) {
        const cause = error && typeof error === "object" ? error.cause : undefined;
        const reason =
            cause?.code || cause?.message || (error instanceof Error ? error.message : String(error));
        throw new Error(
            `无法连接 Telegram API (${reason})。\n` +
                `请检查网络、DNS 或代理是否可以访问 ${apiBase}。\n` +
                `本机若无法直连 Telegram，可设置 HTTPS_PROXY / ALL_PROXY，` +
                `或使用 --proxy <proxy-url>；也可以使用 --api-base 指向可用的 Telegram API 反向代理。`
        );
    }

    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.ok) {
        throw new Error(`${method} 调用失败: ${json?.description ?? `HTTP ${response.status}`}`);
    }
    return json.result;
}

function chatTitle(chat) {
    if (!chat) return "";
    if (chat.title) return chat.title;
    return [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username || "";
}

async function main() {
    if (deleteWebhook) {
        await callTelegram("deleteWebhook", { drop_pending_updates: false });
        console.log("已删除 Bot 的 webhook（如果存在）。");
    }

    let updates;
    try {
        updates = await callTelegram("getUpdates", {
            allowed_updates: ["message", "edited_message", "channel_post", "my_chat_member", "chat_member"],
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/webhook/i.test(message)) {
            console.error("Bot 当前设置了 webhook，getUpdates 不可用。");
            console.error("请运行: node scripts/get-telegram-chat-id.mjs <BOT_TOKEN> --delete-webhook");
        }
        throw error;
    }

    const chats = new Map();
    for (const update of updates ?? []) {
        const event =
            update.message ??
            update.edited_message ??
            update.channel_post ??
            update.my_chat_member ??
            update.chat_member;
        const chat = event?.chat;
        if (!chat?.id) continue;
        chats.set(String(chat.id), chat);
    }

    if (chats.size === 0) {
        console.log("没有获取到任何群组。请确认：");
        console.log("  1. 机器人已经被拉入目标群组；");
        console.log("  2. 在群里发送一条消息，或 @ 机器人（如果机器人开启了隐私模式）；");
        console.log("  3. 如果刚拉入群，也可以把机器人移出再拉回，让 Telegram 产生 my_chat_member 更新。");
        return;
    }

    const rows = [...chats.values()].map((chat) => ({
        chat_id: String(chat.id),
        type: chat.type,
        title: chatTitle(chat),
        username: chat.username || "",
    }));
    console.table(rows);

    const groupRows = rows.filter(
        (row) => row.type === "group" || row.type === "supergroup" || row.type === "channel",
    );
    if (groupRows.length > 0) {
        console.log("\n把下面这行加到 next-web 的环境变量中（选择目标群组）：");
        for (const row of groupRows) {
            console.log(`TELEGRAM_REPORT_CHAT_ID=${row.chat_id}`);
        }
    } else {
        console.log("\n以上更新里没有群组/频道；如果你只看到私聊，请把机器人拉入目标群组后重试。");
    }
}

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    })
    .finally(() => {
        if (dispatcher?.close) {
            dispatcher.close().catch(() => {});
        }
    });
