import { NextResponse } from "next/server";

import { apiError, readJsonBody } from "@/lib/api-response";
import { rateLimitKey, resolveReportIdentity } from "@/lib/api-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import supabaseAdmin from "@/lib/supabase/admin";
import { escapeTelegramHtml, sendTelegramMessage, truncateTelegramText } from "@/lib/telegram";
import { REPORT_REASONS, reportSubmissionSchema } from "@/lib/validation/report";

export const dynamic = "force-dynamic";

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

function readOptionalString(value: unknown, maxLength: number): string {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * POST /api/report
 *
 * 登录 Web 用户与 iOS 客户端共用举报入口。
 * - Web：Clerk auth
 * - iOS：X-UM-Timestamp / X-UM-Signature + 版本头
 * 服务端只信任 targetId，其余评论/课程/教授信息由数据库查询。
 */
export async function POST(request: Request) {
    const identityResult = await resolveReportIdentity(request);
    if ("response" in identityResult) return identityResult.response;
    const { identity } = identityResult;

    const bodyResult = await readJsonBody(request, 16_384);
    if (!bodyResult.ok) return bodyResult.response;

    const rawBody = bodyResult.data;
    if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
        return apiError("invalid_request", "请求体必须是 JSON 对象", 400);
    }
    const body = rawBody as Record<string, unknown>;

    const parsed = reportSubmissionSchema.safeParse({
        targetType: body.targetType ?? "comment",
        targetId: body.targetId,
        reason: body.reason,
        details: body.details,
        email: body.email ?? body.contact,
    });
    if (!parsed.success) {
        return apiError("invalid_request", "举报内容不合法", 400, {
            issues: parsed.error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
            })),
        });
    }

    const { targetId, reason } = parsed.data;
    const details = parsed.data.details ?? "";
    const email = parsed.data.email ?? "";

    const limit = Number(process.env.RATE_LIMIT_REPORT_PER_HOUR ?? "5");
    const rate = await consumeRateLimit({
        key: rateLimitKey(identity, "report"),
        action: "report",
        limit,
    });
    if (!rate.allowed) {
        return apiError("rate_limited", "Too many reports", 429, { retryAfter: rate.retryAfter });
    }

    const { data: commentData, error: commentError } = await supabaseAdmin
        .from("comment")
        .select("id, content, course_id, verify_account, pub_time")
        .eq("id", targetId)
        .maybeSingle();

    if (commentError) {
        console.error("[api/report] failed to load comment target:", commentError);
        return apiError("internal_error", "加载举报目标失败", 500);
    }
    if (!commentData) {
        return apiError("not_found", "举报目标不存在", 404);
    }
    const comment = commentData as CommentTarget;

    let prof: ProfTarget | null = null;
    const { data: profData, error: profError } = await supabaseAdmin
        .from("prof_with_course")
        .select("course_id, prof_id")
        .eq("id", comment.course_id)
        .maybeSingle();

    if (profError) {
        // 课程/教授信息只是增强消息内容，拿不到时不阻断举报。
        console.error("[api/report] failed to load prof target:", profError);
    } else {
        prof = (profData as ProfTarget | null) ?? null;
    }

    const iosCourseCodeInput = identity.platform === "ios" ? readOptionalString(body.courseCode, 100) : "";
    const iosProfessorInput = identity.platform === "ios" ? readOptionalString(body.professor, 200) : "";
    const courseCode = prof?.course_id || iosCourseCodeInput || "unknown";
    const professor = prof?.prof_id || iosProfessorInput || "unknown";
    const reporterId = identity.platform === "web" ? identity.id : readOptionalString(body.reporterId, 100);
    const appVersion = identity.platform === "ios" ? readOptionalString(body.appVersion, 100) : "";

    const lines: string[] = [
        "🚩 <b>New report from What2REG</b>",
        "",
        `<b>Source:</b> ${escapeTelegramHtml(identity.source)}`,
        `<b>Type:</b> ${escapeTelegramHtml(parsed.data.targetType)}`,
        `<b>Comment ID:</b> <code>${comment.id}</code>`,
        `<b>Course:</b> ${escapeTelegramHtml(courseCode)}`,
        `<b>Professor:</b> ${escapeTelegramHtml(professor)}`,
        `<b>Comment author:</b> ${escapeTelegramHtml(comment.verify_account || "unknown")}`,
        `<b>Comment time:</b> ${escapeTelegramHtml(comment.pub_time || "unknown")}`,
    ];

    const encodedProf = professor.replaceAll("/", "$").replaceAll(" ", "%20");
    const reviewUrl = `https://umeh.top/reviews/${encodeURIComponent(courseCode)}/${encodedProf}`;
    lines.push(`<b>Link:</b> <a href="${escapeTelegramHtml(reviewUrl)}">Open review</a>`);

    lines.push(`<b>Reason:</b> ${escapeTelegramHtml(REPORT_REASONS[reason])}`);
    if (details) {
        lines.push(`<b>Details:</b> ${escapeTelegramHtml(truncateTelegramText(details, 800))}`);
    }
    if (email) {
        lines.push(`<b>Email:</b> ${escapeTelegramHtml(truncateTelegramText(email, 100))}`);
    }
    if (reporterId) {
        const label = identity.platform === "ios" ? "Reporter (client-provided)" : "Reporter";
        lines.push(`<b>${label}:</b> <code>${escapeTelegramHtml(reporterId)}</code>`);
    }
    if (appVersion) {
        lines.push(`<b>App version:</b> ${escapeTelegramHtml(appVersion)}`);
    }
    if (comment.content) {
        lines.push("", "<b>Reported comment:</b>");
        lines.push(`<blockquote>${escapeTelegramHtml(truncateTelegramText(comment.content, 1600))}</blockquote>`);
    }

    const message = lines.join("\n").slice(0, 4000);

    try {
        await sendTelegramMessage(message);
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("缺少环境变量")) {
            console.warn("[api/report] Telegram not configured:", error.message);
            return apiError("service_unavailable", "举报推送服务未配置", 503);
        }
        console.error("[api/report] failed to push Telegram message:", error);
        return apiError("telegram_failed", "举报推送失败，请稍后重试", 502);
    }

    return NextResponse.json({ ok: true });
}
