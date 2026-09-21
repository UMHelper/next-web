import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { fetchCourseListByProf } from "@/lib/database/get-course-info";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { prof: string } },
) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const prof = decodeURIComponent(params.prof).replaceAll("$", "/").toUpperCase();
  if (!prof) return apiError("invalid_request", "Invalid professor", 400);

  const { data, error } = await fetchCourseListByProf({ name: prof });
  if (error) {
    console.error("[timetable/catalog/instructor-courses] failed:", error.message);
    return apiError("internal_error", "Unable to load instructor courses", 500);
  }

  return NextResponse.json({ courses: data ?? [] });
}
