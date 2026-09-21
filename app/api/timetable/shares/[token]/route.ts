import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { rateLimitKey } from "@/lib/api-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import supabaseAdmin from "@/lib/supabase/admin";
import { isValidShareToken } from "@/lib/timetable/share-token";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { token: string } },
) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);
  const rate = await consumeRateLimit({
    key: rateLimitKey({ platform: "web", id: userId }, "share_read"),
    action: "share_read",
    limit: 120,
    windowSeconds: 60,
  });
  if (!rate.allowed) {
    return apiError("rate_limited", "Too many requests", 429, {
      retryAfter: rate.retryAfter,
    });
  }
  if (!isValidShareToken(params.token)) {
    return apiError("not_found", "Shared timetable not found", 404);
  }

  const { data, error } = await supabaseAdmin
    .from("timetable_plan")
    .select("name, year, sem, payload, revision, updated_at")
    .eq("share_token", params.token)
    .maybeSingle();

  if (error) {
    console.error("[timetable/shares] lookup failed:", error.message);
    return apiError("internal_error", "Unable to load shared timetable", 500);
  }
  if (!data) return apiError("not_found", "Shared timetable not found", 404);

  const revision = new URL(request.url).searchParams.get("revision");
  if (revision !== null && Number(revision) === data.revision) {
    return new NextResponse(null, { status: 304 });
  }

  return NextResponse.json({
    plan: {
      name: data.name,
      year: data.year,
      sem: data.sem,
      revision: data.revision,
      updatedAt: data.updated_at,
      payload: data.payload,
    },
  });
}
