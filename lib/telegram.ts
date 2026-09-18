import "server-only";

const DEFAULT_TELEGRAM_API_BASE = "https://api.telegram.org";

/**
 * Telegram sendMessage 使用 HTML parse_mode 时，必须转义用户可控文本，
 * 否则举报内容里的 `<b>` 等字符会破坏消息结构。
 */
export function escapeTelegramHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

/** 单条 Telegram 消息上限 4096 字符，这里对长文本做保守截断。 */
export function truncateTelegramText(value: string, maxLength = 1200): string {
    const normalized = value.trim();
    if (normalized.length <= maxLength) return normalized;
    return normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd() + "…";
}

function requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`缺少环境变量 ${name}`);
    }
    return value;
}

function telegramApiBase(): string {
    return (
        process.env.TELEGRAM_API_BASE_URL?.trim() ||
        process.env.TELEGRAM_API_BASE?.trim() ||
        DEFAULT_TELEGRAM_API_BASE
    ).replace(/\/+$/, "");
}

/**
 * 通过 Telegram Bot API 向指定群组/频道发送举报消息。
 *
 * 必需环境变量：
 *   TELEGRAM_BOT_TOKEN          @BotFather 创建的机器人 token
 *   TELEGRAM_REPORT_CHAT_ID     目标群组/频道的 chat_id（通常为 -100...）
 *
 * 可选：
 *   TELEGRAM_REPORT_THREAD_ID   论坛群组里的话题 ID（message_thread_id）
 *   TELEGRAM_API_BASE_URL       自定义 Telegram API 反向代理地址（默认 https://api.telegram.org）
 */
export async function sendTelegramMessage(text: string): Promise<void> {
    const token = requiredEnv("TELEGRAM_BOT_TOKEN");
    const chatId = requiredEnv("TELEGRAM_REPORT_CHAT_ID");
    const threadId = process.env.TELEGRAM_REPORT_THREAD_ID?.trim();

    const body: Record<string, unknown> = {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
    };

    if (threadId) {
        const parsedThreadId = Number(threadId);
        if (!Number.isInteger(parsedThreadId)) {
            throw new Error("TELEGRAM_REPORT_THREAD_ID 必须是整数");
        }
        body.message_thread_id = parsedThreadId;
    }

    let response: Response;
    try {
        response = await fetch(`${telegramApiBase()}/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            cache: "no-store",
        });
    } catch (error) {
        const cause = error && typeof error === "object" ? (error as { cause?: unknown }).cause : undefined;
        const causeObject = cause && typeof cause === "object" ? (cause as { code?: string; message?: string }) : null;
        const reason =
            causeObject?.code ||
            causeObject?.message ||
            (error instanceof Error ? error.message : String(error));
        // 不要把 token 放进错误消息。
        throw new Error(`无法连接 Telegram API: ${reason}`);
    }

    const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; description?: string }
        | null;

    if (!response.ok || result?.ok !== true) {
        // 不要把 token 放进错误消息；只记录 Telegram 返回的 description。
        throw new Error(
            `Telegram sendMessage 失败 (${response.status}): ${result?.description ?? "unknown error"}`,
        );
    }
}
