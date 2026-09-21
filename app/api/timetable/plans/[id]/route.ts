import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { apiError, readJsonBody } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";
import { updatePlanSchema } from "@/lib/validation/timetable";

export const dynamic = "force-dynamic";

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const id = parseId(params.id);
  if (!id) return apiError("invalid_request", "Invalid plan id", 400);

  const { data, error } = await supabaseAdmin
    .from("timetable_plan")
    .select("*")
    .eq("id", id)
    .eq("owner_clerk_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[timetable/plans/:id] get failed:", error.message);
    return apiError("internal_error", "Unable to load timetable plan", 500);
  }
  if (!data) return apiError("not_found", "Timetable plan not found", 404);

  return NextResponse.json({ plan: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const id = parseId(params.id);
  if (!id) return apiError("invalid_request", "Invalid plan id", 400);

  const body = await readJsonBody(request, 96 * 1024);
  if (!body.ok) return body.response;

  const parsed = updatePlanSchema.safeParse(body.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid timetable plan payload", 422, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  const { data: current, error: currentError } = await supabaseAdmin
    .from("timetable_plan")
    .select("*")
    .eq("id", id)
    .eq("owner_clerk_id", userId)
    .maybeSingle();

  if (currentError) {
    console.error("[timetable/plans/:id] lookup failed:", currentError.message);
    return apiError("internal_error", "Unable to update timetable plan", 500);
  }
  if (!current) return apiError("not_found", "Timetable plan not found", 404);

  const input = parsed.data;
  if (current.revision !== input.baseRevision) {
    return NextResponse.json(
      { error: { code: "conflict", message: "Plan revision conflict" }, current },
      { status: 409 },
    );
  }

  const update: Record<string, unknown> = {
    revision: current.revision + 1,
    updated_at: new Date().toISOString(),
  };
  if (input.name !== undefined) update.name = input.name;
  if (input.payload !== undefined) {
    update.payload = input.payload;
    update.schema_version = input.payload.schemaVersion;
  }

  const { data, error } = await supabaseAdmin
    .from("timetable_plan")
    .update(update)
    .eq("id", id)
    .eq("owner_clerk_id", userId)
    .eq("revision", input.baseRevision)
    .select("*")
    .single();

  if (error) {
    console.error("[timetable/plans/:id] update failed:", error.message);
    return apiError("internal_error", "Unable to update timetable plan", 500);
  }

  return NextResponse.json({ plan: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const { userId } = auth();
  if (!userId) return apiError("unauthorized", "Sign in required", 401);

  const id = parseId(params.id);
  if (!id) return apiError("invalid_request", "Invalid plan id", 400);

  const { data, error } = await supabaseAdmin
    .from("timetable_plan")
    .delete()
    .eq("id", id)
    .eq("owner_clerk_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[timetable/plans/:id] delete failed:", error.message);
    return apiError("internal_error", "Unable to delete timetable plan", 500);
  }
  if (!data) return apiError("not_found", "Timetable plan not found", 404);

  return NextResponse.json({ ok: true });
}
