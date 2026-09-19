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
  const q = (searchParams.get("q") ?? "").replace(/[%,()]/g, "").trim();
  const from = (page - 1) * limit;

  let query = supabaseAdmin
    .from("course_noporf")
    .select("*", { count: "exact" })
    .order("New_code", { ascending: true })
    .range(from, from + limit - 1);

  if (q) query = query.or(`New_code.ilike.%${q}%,courseTitleEng.ilike.%${q}%`);

  const { data, error, count } = await query;
  if (error) {
    console.error("[admin/courses] query failed:", error.message);
    return apiError("internal_error", "Unable to load courses", 500);
  }

  return NextResponse.json({ courses: data ?? [], total: count ?? 0, page, limit });
}
