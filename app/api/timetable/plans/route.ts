import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { apiError, readJsonBody } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";
import { createPlanSchema } from "@/lib/validation/timetable";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get("year"));
  const sem = Number(searchParams.get("sem"));

  let query = supabaseAdmin
    .from("timetable_plan")
    .select("*")
    .eq("owner_clerk_id", userId)
    .order("updated_at", { ascending: false });

  if (Number.isFinite(year)) query = query.eq("year", year);
  if (Number.isFinite(sem)) query = query.eq("sem", sem);

  const { data, error } = await query;
  if (error) {
    console.error("[timetable/plans] list failed:", error.message);
    return apiError("internal_error", "Unable to load timetable plans", 500);
  }

  return NextResponse.json({ plans: data ?? [] });
}

export async function POST(request: Request) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const body = await readJsonBody(request, 96 * 1024);
  if (!body.ok) return body.response;

  const parsed = createPlanSchema.safeParse(body.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid timetable plan payload", 422, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const input = parsed.data;
  const existing = await supabaseAdmin
    .from("timetable_plan")
    .select("*")
    .eq("owner_clerk_id", userId)
    .eq("client_ref", input.clientRef)
    .maybeSingle();

  if (existing.error) {
    console.error("[timetable/plans] lookup failed:", existing.error.message);
    return apiError("internal_error", "Unable to create timetable plan", 500);
  }
  if (existing.data) {
    return NextResponse.json({ plan: existing.data });
  }

  const { data, error } = await supabaseAdmin
    .from("timetable_plan")
    .insert({
      owner_clerk_id: userId,
      client_ref: input.clientRef,
      name: input.name,
      year: input.year,
      sem: input.sem,
      payload: input.payload,
      schema_version: input.payload.schemaVersion,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[timetable/plans] insert failed:", error.message);
    return apiError("internal_error", "Unable to create timetable plan", 500);
  }

  return NextResponse.json({ plan: data }, { status: 201 });
}
