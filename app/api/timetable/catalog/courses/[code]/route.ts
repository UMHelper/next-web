import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { fetchCourseInfo } from "@/lib/database/get-course-info";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { code: string } },
) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const code = decodeURIComponent(params.code).trim().toUpperCase();
  if (!code) return apiError("invalid_request", "Invalid course code", 400);

  try {
    const result = await fetchCourseInfo(code);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[timetable/catalog/courses] failed:", error);
    return apiError("internal_error", "Unable to load course", 500);
  }
}
