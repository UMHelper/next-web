import { NextResponse } from "next/server";

import { iosUnauthorized, verifyIOSRequest } from "@/lib/ios-auth";
import supabaseAdmin from "@/lib/supabase/admin";
import { escapeTelegramHtml, sendTelegramMessage, truncateTelegramText } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const REPORT_REASONS = {
    spam: "Spam / advertising",
    harassment: "Harassment / bullying",
    hate: "Hate speech",
    misinformation: "False information",
    privacy: "Privacy violation",
    other: "Other",
} as const;

type ReportReason = keyof typeof REPORT_REASONS;

type ReportBody = Record<string, unknown>;

type CommentTarget = {
    id: number;
    content: string | null;
    course_id: number;
    verify_account: string | null;
    pub_time: string | null;
};

type ProfTarget = {
    course_id: string | null;
    prof_id: string | null;
};

function badRequest(message: string) {
    return NextResponse.json({ error: message }, { status: 400 });
}

function readString(value: unknown, maxLength: number): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function readOptionalString(value: unknown, maxLength: number): string | undefined {
    return readString(value, maxLength) ?? undefined;
}

/**
 * POST /api/report
 *
 * iOS 客户端内置举报入口调用；接收举报后通过 Telegram Bot 推送到配置群组。
 * 需要复用 iOS 专用 HMAC 请求头（X-UM-Timestamp / X-UM-Signature），防止浏览器或第三方刷接口。
 */
export async function POST(request: Request) {
    // 与其它 iOS 专用接口一致：HMAC-SHA256 时间戳签名。
    if (!verifyIOSRequest(request)) return iosUnauthorized();

    let rawBody: unknown;
    try {
        rawBody = await request.json();
    } catch {
        return badRequest("请求体必须是合法 JSON");
    }

    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
        return badRequest("请求体必须是 JSON 对象");
    }
    const body = rawBody as ReportBody;

    const source = readOptionalString(body.source, 32) ?? "ios";
    const targetType = readOptionalString(body.targetType, 32) ?? "comment";
    const reasonValue = readString(body.reason, 32);
    if (!reasonValue || !(reasonValue in REPORT_REASONS)) {
        return badRequest("缺少或无效的 `reason`");
    }
    const reason = reasonValue as ReportReason;
    const details = readOptionalString(body.details, 1000) ?? "";
    const email = readOptionalString(body.email, 100) ?? readOptionalString(body.contact, 100) ?? "";
    const reporterId = readOptionalString(body.reporterId, 100) ?? "";
    const appVersion = readOptionalString(body.appVersion, 100) ?? "";
    const courseCodeInput = readOptionalString(body.courseCode, 100) ?? "";
    const professorInput = readOptionalString(body.professor, 200) ?? "";

    if (reason === "other" && details.length === 0) {
        return badRequest("`reason=other` 时请填写 `details`");
    }

    let targetId: number | null = null;
    if (body.targetId !== undefined && body.targetId !== null && body.targetId !== "") {
        const parsed = Number(body.targetId);
        if (!Number.isInteger(parsed) || parsed <= 0) {
            return badRequest("`targetId` 必须是正整数");
        }
        targetId = parsed;
    }

    if (targetType === "comment" && targetId === null) {
        return badRequest("评论举报必须提供 `targetId`");
    }

    let comment: CommentTarget | null = null;
    let prof: ProfTarget | null = null;

    if (targetType === "comment" && targetId !== null) {
        const { data: commentData, error: commentError } = await supabaseAdmin
            .from("comment")
            .select("id, content, course_id, verify_account, pub_time")
            .eq("id", targetId)
            .maybeSingle();

        if (commentError) {
            console.error("[api/report] failed to load comment target:", commentError);
            return NextResponse.json({ error: "加载举报目标失败" }, { status: 500 });
        }
        if (!commentData) {
            return NextResponse.json({ error: "举报目标不存在" }, { status: 404 });
        }
        comment = commentData as CommentTarget;

        const { data: profData, error: profError } = await supabaseAdmin
            .from("prof_with_course")
            .select("course_id, prof_id")
            .eq("id", comment.course_id)
            .maybeSingle();

        if (profError) {
            // 课程/教授信息只是增强消息内容，拿不到时回退到客户端传参，不阻断举报。
            console.error("[api/report] failed to load prof target:", profError);
        } else {
            prof = (profData as ProfTarget | null) ?? null;
        }
    }

    const courseCode = prof?.course_id || courseCodeInput || "unknown";
    const professor = prof?.prof_id || professorInput || "unknown";
    const lines: string[] = [
        "🚩 <b>New report from What2REG</b>",
        "",
        `<b>Source:</b> ${escapeTelegramHtml(source)}`,
        `<b>Type:</b> ${escapeTelegramHtml(targetType)}`,
    ];

    if (comment) {
        lines.push(`<b>Comment ID:</b> <code>${comment.id}</code>`);
        lines.push(`<b>Course:</b> ${escapeTelegramHtml(courseCode)}`);
        lines.push(`<b>Professor:</b> ${escapeTelegramHtml(professor)}`);
        lines.push(`<b>Comment author:</b> ${escapeTelegramHtml(comment.verify_account || "unknown")}`);
        lines.push(`<b>Comment time:</b> ${escapeTelegramHtml(comment.pub_time || "unknown")}`);

        const encodedProf = professor.replaceAll("/", "$").replaceAll(" ", "%20");
        const reviewUrl = `https://umeh.top/reviews/${encodeURIComponent(courseCode)}/${encodedProf}`;
        lines.push(`<b>Link:</b> <a href="${escapeTelegramHtml(reviewUrl)}">Open review</a>`);
    }

    lines.push(`<b>Reason:</b> ${escapeTelegramHtml(REPORT_REASONS[reason])}`);
    if (details) {
        lines.push(`<b>Details:</b> ${escapeTelegramHtml(truncateTelegramText(details, 800))}`);
    }
    if (email) {
        lines.push(`<b>Email:</b> ${escapeTelegramHtml(truncateTelegramText(email, 100))}`);
    }
    if (reporterId) {
        lines.push(`<b>Reporter:</b> <code>${escapeTelegramHtml(reporterId)}</code>`);
    }
    if (appVersion) {
        lines.push(`<b>App version:</b> ${escapeTelegramHtml(appVersion)}`);
    }
    if (comment?.content) {
        lines.push("", "<b>Reported comment:</b>");
        lines.push(`<blockquote>${escapeTelegramHtml(truncateTelegramText(comment.content, 1600))}</blockquote>`);
    }

    const message = lines.join("\n").slice(0, 4000);

    try {
        await sendTelegramMessage(message);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("缺少环境变量")) {
            console.warn("[api/report] Telegram not configured:", error.message);
            return NextResponse.json({ error: "举报推送服务未配置" }, { status: 503 });
        }
        console.error("[api/report] failed to push Telegram message:", error);
        return NextResponse.json({ error: "举报推送失败，请稍后重试" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
}
