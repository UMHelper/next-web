import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/admin-audit";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api-response";
import supabaseAdmin from "@/lib/supabase/admin";
import { assistantTesterSchema } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";

function decodeEmail(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ email: string }> }) {
  const admin = await requireAdmin({ platformOnly: true });
  if (!admin.ok) return admin.response;

  const { email: rawEmail } = await params;
  const parsed = assistantTesterSchema.safeParse({ email: decodeEmail(rawEmail) });
  if (!parsed.success) return apiError("invalid_request", "Invalid email address", 400);
  const { email } = parsed.data;

  const { data, error } = await supabaseAdmin
    .from("assistant_testers")
    .delete()
    .eq("email", email)
    .select("email");

  if (error) {
    console.error("[admin/assistant-testers] delete failed:", error.message);
    return apiError("internal_error", "Unable to remove tester", 500);
  }
  if (!data || data.length === 0) return apiError("not_found", "Tester not found", 404);

  await writeAuditLog({
    actorId: admin.session.userId,
    action: "assistant_tester.remove",
    targetType: "assistant_tester",
    targetId: email,
    before: { email },
  });

  return NextResponse.json({ ok: true });
}
