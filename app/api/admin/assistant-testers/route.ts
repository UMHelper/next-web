import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { getClerkUserEmails, requireAdmin } from "@/lib/admin-auth";
import { apiError, readJsonBody } from "@/lib/api-response";
import { MAX_ASSISTANT_TESTERS } from "@/lib/assistant/access-mode";
import supabaseAdmin from "@/lib/supabase/admin";
import { assistantTesterSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

type TesterRow = { email: string; added_by: string; created_at: string };

export async function GET() {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const { data, error } = await supabaseAdmin
    .from("assistant_testers")
    .select("email, added_by, created_at")
    .order("created_at", { ascending: false })
    .limit(MAX_ASSISTANT_TESTERS);

  if (error) {
    console.error("[admin/assistant-testers] query failed:", error.message);
    return apiError("internal_error", "Unable to load testers", 500);
  }

  const testers = (data ?? []) as TesterRow[];
  const emailById = await getClerkUserEmails(testers.map((row) => row.added_by));

  return NextResponse.json({
    testers: testers.map((row) => ({ ...row, added_by_email: emailById.get(row.added_by) ?? null })),
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const body = await readJsonBody(request, 1_024);
  if (!body.ok) return body.response;

  const parsed = assistantTesterSchema.safeParse(body.data);
  if (!parsed.success) return apiError("invalid_request", "Invalid email address", 400);
  const { email } = parsed.data;

  const { count, error: countError } = await supabaseAdmin
    .from("assistant_testers")
    .select("email", { count: "exact", head: true });

  if (countError) {
    console.error("[admin/assistant-testers] count failed:", countError.message);
    return apiError("internal_error", "Unable to add tester", 500);
  }
  if ((count ?? 0) >= MAX_ASSISTANT_TESTERS) {
    return apiError("tester_limit", `Tester list is full (${MAX_ASSISTANT_TESTERS})`, 409);
  }

  const { error } = await supabaseAdmin
    .from("assistant_testers")
    .insert([{ email, added_by: admin.session.userId }]);

  if (error?.code === "23505") return apiError("already_exists", "Tester already added", 409);
  if (error) {
    console.error("[admin/assistant-testers] insert failed:", error.message);
    return apiError("internal_error", "Unable to add tester", 500);
  }

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "assistant_tester.add",
    targetType: "assistant_tester",
    targetId: email,
    after: { email },
  });

  return NextResponse.json({ ok: true, email }, { status: 201 });
}
