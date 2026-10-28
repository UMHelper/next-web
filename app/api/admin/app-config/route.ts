import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import { ASSISTANT_LIMIT_FIELDS } from "@/lib/assistant/limits";
import { CACHE_TAGS } from "@/lib/cache-tags";
import { mapAppConfigRow } from "@/lib/config/app-config-core";
import supabaseAdmin from "@/lib/supabase/admin";
import { appConfigUpdateSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

const ASSISTANT_NUMERIC_COLUMNS = new Set<string>(
  ASSISTANT_LIMIT_FIELDS.map((field) => field.column),
);
const ASSISTANT_COLUMNS = ASSISTANT_LIMIT_FIELDS.map((field) => field.column).join(", ");

export async function GET() {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const { data, error } = await supabaseAdmin
    .from("app_config")
    .select("current_year, current_sem, is_preenrollment_open, database_last_update, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();

  if (error) return apiError("internal_error", "Unable to load app config", 500);
  return NextResponse.json({ config: mapAppConfigRow(data) });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const body = await readJsonBody(request, 4_096);
  if (!body.ok) return body.response;

  const parsed = appConfigUpdateSchema.safeParse(body.data);
  if (!parsed.success) {
    return apiError("invalid_request", "Invalid app config", 400, {
      issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }

  const fields = Object.keys(parsed.data);
  const touchesAssistantLimits = fields.some((field) => ASSISTANT_NUMERIC_COLUMNS.has(field));
  const touchesOtherConfig = fields.some(
    (field) => field !== "ai_assistant_access" && !ASSISTANT_NUMERIC_COLUMNS.has(field),
  );
  if ((touchesAssistantLimits || touchesOtherConfig) && !admin.session.isPlatformAdmin) {
    return apiError("forbidden", "Platform admin required", 403);
  }

  let before: Record<string, unknown> | undefined;
  if (touchesAssistantLimits) {
    const { data: current, error: readError } = await supabaseAdmin
      .from("app_config")
      .select(ASSISTANT_COLUMNS)
      .eq("id", 1)
      .maybeSingle();

    if (readError) return apiError("internal_error", "Unable to load app config", 500);

    const row = (current ?? {}) as Record<string, unknown>;
    before = Object.fromEntries(
      ASSISTANT_LIMIT_FIELDS.map((field) => [field.column, row[field.column] ?? null]),
    );
  }

  const patch = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
    updated_by: admin.session.userId,
  };

  const { data, error } = await supabaseAdmin
    .from("app_config")
    .update(patch)
    .eq("id", 1)
    .select("current_year, current_sem, is_preenrollment_open, database_last_update, updated_at, updated_by")
    .single();

  if (error) return apiError("internal_error", "Unable to update app config", 500);

  revalidateTag(CACHE_TAGS.appConfig);
  await writeAuditLog({
    actorId: admin.session.userId,
    action: "config.update",
    targetType: "app_config",
    targetId: 1,
    ...(before ? { before } : {}),
    after: patch,
  });

  return NextResponse.json({ config: mapAppConfigRow(data) });
}
