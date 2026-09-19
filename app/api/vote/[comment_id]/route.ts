import { NextResponse } from "next/server";

import { apiError, readJsonBody } from "@/lib/api-response";
import { invalidateAfterVoteWrite } from "@/lib/cache-invalidation";
import { rateLimitKey, requireWriteIdentity } from "@/lib/api-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import supabaseAdmin from "@/lib/supabase/admin";
import { voteSubmissionSchema } from "@/lib/validation/vote";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { comment_id: string } },
) {
  const identityResult = await requireWriteIdentity(request);
  if ("response" in identityResult) return identityResult.response;
  const { identity } = identityResult;

  const bodyResult = await readJsonBody(request, 4_096);
  if (!bodyResult.ok) return bodyResult.response;

  const parsed = voteSubmissionSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid vote payload", 400, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  if (String(parsed.data.comment) !== params.comment_id) {
    return apiError("invalid_request", "comment must match the URL parameter", 400);
  }

  const limit = Number(process.env.RATE_LIMIT_VOTE_PER_HOUR ?? "120");
  const rate = await consumeRateLimit({
    key: rateLimitKey(identity, "vote"),
    action: "vote",
    limit,
  });
  if (!rate.allowed) {
    return apiError("rate_limited", "Too many votes", 429, { retryAfter: rate.retryAfter });
  }

  const payload = {
    comment_id: parsed.data.comment,
    offset: parsed.data.offset,
    emoji: parsed.data.offset === 0 ? parsed.data.emoji ?? null : null,
    created_by: identity.id,
    created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
  };

  const { error } = await supabaseAdmin.from("vote").insert([payload]);

  if (error && error.code !== "23505") {
    console.error("[api/vote] insert failed:", error.message);
    return apiError("internal_error", "Unable to submit vote", 500);
  }

  invalidateAfterVoteWrite();
  return NextResponse.json({
    comment: parsed.data.comment,
    offset: parsed.data.offset,
    emoji: payload.emoji,
    created_by: identity.id,
  });
}
