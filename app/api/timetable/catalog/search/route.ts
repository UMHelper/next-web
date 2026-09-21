import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") === "instructor" ? "instructor" : "course";
  const q = (searchParams.get("q") ?? "").trim();
  const faculty = (searchParams.get("faculty") ?? "").trim();
  const department = (searchParams.get("department") ?? "").trim();
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  if (!q && !faculty && !department) {
    return NextResponse.json({ items: [], page, pageSize, total: 0 });
  }

  const rpc = type === "instructor" ? "search_planner_instructors" : "search_planner_courses";
  const { data, error } = await supabaseAdmin.rpc(rpc, {
    keyword: q || null,
    faculty: faculty || null,
    department: department || null,
    page_limit: pageSize,
    page_offset: offset,
  });

  if (error) {
    console.error("[timetable/catalog/search] rpc failed:", error.message);
    return apiError("internal_error", "Unable to search catalog", 500);
  }

  const items = data ?? [];
  const total = items[0]?.total_count ? Number(items[0].total_count) : offset + items.length;
  return NextResponse.json({
    items,
    page,
    pageSize,
    total,
  });
}
