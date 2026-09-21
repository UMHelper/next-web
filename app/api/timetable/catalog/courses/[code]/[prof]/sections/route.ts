import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import getScheduleList from "@/lib/database/get-schedule-list";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { code: string; prof: string } },
) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const code = decodeURIComponent(params.code).trim().toUpperCase();
  const prof = decodeURIComponent(params.prof).replaceAll("%20", " ").replaceAll("$", "/");
  if (!code || !prof) {
    return apiError("invalid_request", "Invalid course or professor", 400);
  }

  try {
    const sections = await getScheduleList(code, prof);
    return NextResponse.json({ sections });
  } catch (error) {
    console.error("[timetable/catalog/sections] failed:", error);
    return apiError("internal_error", "Unable to load sections", 500);
  }
}
