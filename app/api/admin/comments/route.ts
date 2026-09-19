import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import supabaseAdmin from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const q = searchParams.get("q")?.trim() ?? "";
  const code = searchParams.get("code")?.trim().toUpperCase() ?? "";
  const prof = searchParams.get("prof")?.trim() ?? "";
  const hidden = searchParams.get("hidden");
  const from = (page - 1) * limit;

  let courseIds: number[] | null = null;
  if (code || prof) {
    let mappingQuery = supabaseAdmin.from("prof_with_course").select("id");
    if (code) mappingQuery = mappingQuery.eq("course_id", code);
    if (prof) mappingQuery = mappingQuery.ilike("prof_id", `%${prof}%`);
    const { data: mappings, error: mappingError } = await mappingQuery;

    if (mappingError) {
      console.error("[admin/comments] mapping query failed:", mappingError.message);
      return apiError("internal_error", "Unable to filter comments", 500);
    }

    courseIds = (mappings ?? []).map((row: any) => row.id);
    if (courseIds.length === 0) {
      return NextResponse.json({ comments: [], total: 0, page, limit });
    }
  }

  let query = supabaseAdmin
    .from("comment")
    .select("*", { count: "exact" })
    .order("pub_time", { ascending: false })
    .range(from, from + limit - 1);

  if (courseIds) query = query.in("course_id", courseIds);
  if (q) query = query.ilike("content", `%${q}%`);
  if (hidden === "0" || hidden === "1") query = query.eq("hidden", Number(hidden));

  const { data, error, count } = await query;
  if (error) {
    console.error("[admin/comments] query failed:", error.message);
    return apiError("internal_error", "Unable to load comments", 500);
  }

  const comments = data ?? [];
  const uniqueCourseIds = Array.from(new Set(comments.map((comment: any) => comment.course_id)));
  const { data: mappings } = uniqueCourseIds.length
    ? await supabaseAdmin
        .from("prof_with_course")
        .select("id, course_id, prof_id")
        .in("id", uniqueCourseIds)
    : { data: [] };

  const mappingById = new Map((mappings ?? []).map((mapping: any) => [mapping.id, mapping]));
  const enriched = comments.map((comment: any) => {
    const mapping = mappingById.get(comment.course_id);
    return {
      ...comment,
      course_code: mapping?.course_id ?? null,
      prof_id: mapping?.prof_id ?? null,
    };
  });

  return NextResponse.json({ comments: enriched, total: count ?? 0, page, limit });
}
