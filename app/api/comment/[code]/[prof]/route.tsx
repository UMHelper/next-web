import { NextResponse } from "next/server";

import supabaseAdmin from "@/lib/supabase/admin";
import { getReviewInfo } from "@/lib/database/get-prof-info";
import { getComentListByCourseIDAndPage } from "@/lib/database/get-comment-list";
import { getCourseInfo } from "@/lib/database/get-course-info";
import getScheduleList from "@/lib/database/get-schedule-list";
import { verifyIOSRequest, iosUnauthorized } from "@/lib/ios-auth";
import { iosVersionGuard } from "@/lib/ios-version";
import { apiError, readFormData } from "@/lib/api-response";
import { invalidateAfterCommentWrite } from "@/lib/cache-invalidation";
import { withIOSVerifyAccountCompat } from "@/lib/ios-comment-compat";
import { rateLimitKey, resolveCommentIdentity } from "@/lib/api-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  commentSubmissionSchema,
  courseCodeSchema,
  professorNameSchema,
} from "@/lib/validation/comment";
import { isVerifiedIdentityId } from "@/lib/validation/identity";

export const dynamic = "force-dynamic";

/**
 * GET /api/comment/[code]/[prof]?page=1
 *
 * 一次返回评价页所需全部数据（与 Web 端 /reviews/[code]/[...prof] 页同款数据源）：
 * - prof：prof_with_course 单行（聚合评分）
 * - course：course_noporf 单行
 * - comments：当前页评论 + 回复（含 vote_history），页大小 20
 * - timetable：当前学期上课时间表
 * - page / total_page：分页信息
 *
 * prof 编码规则与 Web 一致：空格用 %20，/ 用 $ 转义。
 * iOS 客户端（next-ios）使用。
 */
export async function GET(request: Request, { params }: { params: { code: string; prof: string } }) {
  // iOS 专用接口认证(2FA 时间戳签名)
  if (!verifyIOSRequest(request)) return iosUnauthorized();

  // 版本控制：版本过旧时返回 426，客户端弹出更新提醒。
  const versionResponse = iosVersionGuard(request);
  if (versionResponse) return versionResponse;

  const { searchParams } = new URL(request.url);
  const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

  const code = decodeURIComponent(params.code).toUpperCase();
  const prof = decodeURIComponent(params.prof)
    .replaceAll("%20", " ")
    .replaceAll("$", "/")
    .toUpperCase();

  const viewerId = request.headers.get("x-um-viewer-id")?.trim() || null;

  const prof_info = await getReviewInfo(code, prof);
  if (!prof_info) {
    return new NextResponse(JSON.stringify({ error: "not found" }), { status: 404 });
  }

  const [course_info, comments, timetable] = await Promise.all([
    getCourseInfo(code),
    getComentListByCourseIDAndPage(prof_info.id, page - 1, viewerId),
    getScheduleList(code, prof),
  ]);

  return NextResponse.json(
    {
      prof: prof_info,
      course: course_info,
      // get_comment_page_v2 出于隐私考虑移除了 verify_account，这里为旧 iOS 客户端补回兼容字段。
      comments: comments.map(withIOSVerifyAccountCompat),
      timetable,
      page,
      total_page: Math.max(1, Math.ceil((prof_info.comments ?? 0) / 20)),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

const MAX_IMAGE_BYTES = 5_000_000;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function formNumber(form: FormData, key: string) {
  return Number(form.get(key));
}

export async function POST(
  request: Request,
  { params }: { params: { code: string; prof: string } },
) {
  const identityResult = await resolveCommentIdentity(request);
  if ("response" in identityResult) return identityResult.response;
  const { identity } = identityResult;
  const isAnonymous = identity.platform === "anonymous";
  // verify 徽章只授予真实 Clerk 账号(user_...);iOS 本机 UUID 仍是匿名设备标识。
  const isVerified = isVerifiedIdentityId(identity.id);

  const code = decodeURIComponent(params.code).toUpperCase();
  const prof = decodeURIComponent(params.prof).replaceAll("$", "/").toUpperCase();

  const codeParsed = courseCodeSchema.safeParse(code);
  const profParsed = professorNameSchema.safeParse(prof);
  if (!codeParsed.success || !profParsed.success) {
    return apiError("invalid_request", "Invalid course code or professor name", 400);
  }

  const formResult = await readFormData(request, MAX_IMAGE_BYTES + 65_536);
  if (!formResult.ok) return formResult.response;
  const form = formResult.data;

  const parsed = commentSubmissionSchema.safeParse({
    attendance: formNumber(form, "attendance"),
    pre: formNumber(form, "pre"),
    grade: formNumber(form, "grade"),
    hard: formNumber(form, "hard"),
    reward: formNumber(form, "reward"),
    assignment: formNumber(form, "assignment"),
    recommend: formNumber(form, "recommend"),
    content: form.get("content"),
  });
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid comment payload", 400, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const image = form.get("image");
  if (image instanceof File && image.size > 0) {
    if (image.size > MAX_IMAGE_BYTES) {
      return apiError("payload_too_large", "Image is larger than 5 MB", 413);
    }
    if (!ACCEPTED_IMAGE_TYPES.has(image.type)) {
      return apiError("invalid_request", "Unsupported image type", 400);
    }
  }

  const review = await getReviewInfo(codeParsed.data, profParsed.data);
  if (!review) {
    return apiError("not_found", "Course/professor mapping not found", 404);
  }

  const limit = Number(process.env.RATE_LIMIT_COMMENT_PER_HOUR ?? "10");
  const rate = await consumeRateLimit({
    key: rateLimitKey(identity, "comment"),
    action: "comment",
    limit,
  });
  if (!rate.allowed) {
    return apiError("rate_limited", "Too many comments", 429, { retryAfter: rate.retryAfter });
  }

  let imageUrl: string | null = null;
  if (image instanceof File && image.size > 0) {
    const imgurForm = new FormData();
    imgurForm.append("image", image, image.name);
    const imgurResponse = await fetch("https://api.imgur.com/3/upload", {
      method: "POST",
      body: imgurForm,
      headers: { Authorization: `Client-ID ${process.env.IMGUR_CLIENT_ID}` },
      signal: AbortSignal.timeout(10_000),
    });
    const imgurJson = await imgurResponse.json().catch(() => null);
    if (!imgurResponse.ok || !imgurJson?.success) {
      return apiError("internal_error", "Image upload failed", 502);
    }
    imageUrl = imgurJson.data.link;
  }

  const scores = parsed.data;
  const { error } = await supabaseAdmin
    .rpc("insert_comment_and_refresh_prof_stats", {
      target_course_id: review.id,
      target_content: scores.content,
      target_attendance: scores.attendance,
      target_pre: scores.pre,
      target_grade: scores.grade,
      target_hard: scores.hard,
      target_reward: scores.reward,
      target_recommend: scores.recommend,
      target_assignment: scores.assignment,
      target_result:
        (scores.attendance +
          scores.pre +
          scores.grade +
          scores.hard +
          scores.reward +
          scores.assignment +
          scores.recommend) / 7,
      target_pub_time: new Date().toISOString().slice(0, 19).replace("T", " "),
      target_verify: isVerified ? 1 : 0,
      target_verify_account: isAnonymous ? "" : identity.id,
      target_img: imageUrl,
    })
    .single();

  if (error) {
    console.error("[api/comment] insert failed:", error.message);
    return apiError("internal_error", "Unable to submit comment", 500);
  }

  invalidateAfterCommentWrite();
  return NextResponse.json({ ok: true });
}
