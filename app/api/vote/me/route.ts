import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_COMMENT_IDS = 50;

export async function GET(request: Request) {
  const { userId } = auth();
  if (!userId) {
    return apiError("unauthorized", "Sign in required", 401);
  }

  const { searchParams } = new URL(request.url);
  const rawIds = searchParams.get("comment_ids") ?? "";
  const commentIds = [
    ...new Set(
      rawIds
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isSafeInteger(value) && value > 0),
    ),
  ].slice(0, MAX_COMMENT_IDS);

  if (commentIds.length === 0) {
    return NextResponse.json({ votes: [] });
  }

  const { data, error } = await supabaseAdmin
    .from("vote")
    .select("comment_id,offset,emoji")
    .eq("created_by", userId)
    .in("comment_id", commentIds);

  if (error) {
    return apiError("internal_error", "Unable to load votes", 500);
  }

  return NextResponse.json({ votes: data ?? [] });
}
