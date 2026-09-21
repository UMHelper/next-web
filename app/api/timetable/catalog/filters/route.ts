import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const { data, error } = await supabaseAdmin
    .from("course_noporf")
    .select("Offering_Unit,Offering_Department");

  if (error) {
    console.error("[timetable/catalog/filters] query failed:", error.message);
    return apiError("internal_error", "Unable to load filters", 500);
  }

  const faculties = new Set<string>();
  const departments = new Set<string>();
  for (const row of data ?? []) {
    if (row.Offering_Unit) faculties.add(row.Offering_Unit);
    if (row.Offering_Department) departments.add(row.Offering_Department);
  }

  return NextResponse.json({
    faculties: [...faculties].sort(),
    departments: [...departments].sort(),
  });
}
