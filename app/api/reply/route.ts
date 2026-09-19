import { NextResponse } from "next/server";

import { apiError, readJsonBody } from "@/lib/api-response";
import { rateLimitKey, requireWriteIdentity } from "@/lib/api-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import supabaseAdmin from "@/lib/supabase/admin";
import { replySubmissionSchema } from "@/lib/validation/reply";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identityResult = await requireWriteIdentity(request);
  if ("response" in identityResult) return identityResult.response;
  const { identity } = identityResult;

  const bodyResult = await readJsonBody(request, 8_192);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = replySubmissionSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid reply payload", 400, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const limit = Number(process.env.RATE_LIMIT_REPLY_PER_HOUR ?? "30");
  const rate = await consumeRateLimit({
    key: rateLimitKey(identity, "reply"),
    action: "reply",
    limit,
  });
  if (!rate.allowed) {
    return apiError("rate_limited", "Too many replies", 429, { retryAfter: rate.retryAfter });
  }

  const { data: parent, error: parentError } = await supabaseAdmin
    .from("comment")
    .select("id, course_id, attendance, pre, grade, hard, reward, recommend, assignment, result, hidden")
    .eq("id", parsed.data.replyto)
    .maybeSingle();

  if (parentError) {
    console.error("[api/reply] failed to load parent:", parentError.message);
    return apiError("internal_error", "Unable to load parent comment", 500);
  }
  if (!parent || parent.hidden === 1) {
    return apiError("not_found", "Parent comment not found", 404);
  }

  const { data, error } = await supabaseAdmin
    .from("comment")
    .insert([{
      content: parsed.data.content,
      pub_time: new Date().toISOString().slice(0, 19).replace("T", " "),
      course_id: parent.course_id,
      attendance: parent.attendance,
      pre: parent.pre,
      grade: parent.grade,
      hard: parent.hard,
      reward: parent.reward,
      recommend: parent.recommend,
      assignment: parent.assignment,
      result: parent.result,
      verify: 1,
      verify_account: identity.id,
      replyto: parent.id,
    }])
    .select()
    .single();

  if (error || !data) {
    console.error("[api/reply] insert failed:", error?.message ?? "no data");
    return apiError("internal_error", "Unable to submit reply", 500);
  }

  return NextResponse.json({
    ...data,
    avatar_seed: null,
    emoji_vote: [],
    vote_history: [],
  });
}
