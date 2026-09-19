import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/admin-auth";
import supabaseAdmin from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const REPORT_STATUSES = new Set(["open", "resolved", "dismissed"]);

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const from = (page - 1) * limit;

  let query = supabaseAdmin
    .from("reports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  if (status && REPORT_STATUSES.has(status)) {
    query = query.eq("status", status);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[admin/reports] query failed:", error.message);
    return apiError("internal_error", "Unable to load reports", 500);
  }

  return NextResponse.json({ reports: data ?? [], total: count ?? 0, page, limit });
}
