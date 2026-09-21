import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { apiError, readJsonBody } from "@/lib/api-response";
import { rateLimitKey } from "@/lib/api-auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import supabaseAdmin from "@/lib/supabase/admin";
import { createShareToken } from "@/lib/timetable/share-token";

export const dynamic = "force-dynamic";

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const shareUrl = (request: Request, token: string) =>
  `${new URL(request.url).origin}/compare/${token}`;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const id = parseId(params.id);
  if (!id) return apiError("invalid_request", "Invalid plan id", 400);

  const { data, error } = await supabaseAdmin
    .from("timetable_plan")
    .select("share_token")
    .eq("id", id)
    .eq("owner_clerk_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[timetable/share] get failed:", error.message);
    return apiError("internal_error", "Unable to load share state", 500);
  }
  if (!data) return apiError("not_found", "Timetable plan not found", 404);
  if (!data.share_token) return NextResponse.json({ shared: false });

  return NextResponse.json({
    shared: true,
    token: data.share_token,
    url: shareUrl(_request, data.share_token),
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);
  const rate = await consumeRateLimit({
    key: rateLimitKey({ platform: "web", id: userId }, "share_write"),
    action: "share_write",
    limit: 30,
  });
  if (!rate.allowed) {
    return apiError("rate_limited", "Too many share updates", 429, {
      retryAfter: rate.retryAfter,
    });
  }

  const id = parseId(params.id);
  if (!id) return apiError("invalid_request", "Invalid plan id", 400);

  const body = await readJsonBody(request, 4_096);
  if (!body.ok) return body.response;
  const rotate = Boolean((body.data as { rotate?: boolean } | null)?.rotate);

  const { data: current, error: currentError } = await supabaseAdmin
    .from("timetable_plan")
    .select("share_token")
    .eq("id", id)
    .eq("owner_clerk_id", userId)
    .maybeSingle();

  if (currentError) {
    console.error("[timetable/share] lookup failed:", currentError.message);
    return apiError("internal_error", "Unable to create share link", 500);
  }
  if (!current) return apiError("not_found", "Timetable plan not found", 404);

  const token =
    current.share_token && !rotate ? current.share_token : createShareToken();

  if (token !== current.share_token || !current.share_token) {
    const { error } = await supabaseAdmin
      .from("timetable_plan")
      .update({ share_token: token, share_token_created_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_clerk_id", userId);

    if (error) {
      console.error("[timetable/share] update failed:", error.message);
      return apiError("internal_error", "Unable to create share link", 500);
    }
  }

  return NextResponse.json({ token, url: shareUrl(request, token) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);
  const rate = await consumeRateLimit({
    key: rateLimitKey({ platform: "web", id: userId }, "share_write"),
    action: "share_write",
    limit: 30,
  });
  if (!rate.allowed) {
    return apiError("rate_limited", "Too many share updates", 429, {
      retryAfter: rate.retryAfter,
    });
  }

  const id = parseId(params.id);
  if (!id) return apiError("invalid_request", "Invalid plan id", 400);

  const { error } = await supabaseAdmin
    .from("timetable_plan")
    .update({ share_token: null, share_token_created_at: null })
    .eq("id", id)
    .eq("owner_clerk_id", userId);

  if (error) {
    console.error("[timetable/share] revoke failed:", error.message);
    return apiError("internal_error", "Unable to revoke share link", 500);
  }

  return NextResponse.json({ ok: true });
}
