import supabaseAdmin from "@/lib/supabase/admin";

type AuditEntry = {
  actorId: string;
  action:
    | "report.update"
    | "comment.update"
    | "course.update"
    | "prof.update"
    | "admin.grant"
    | "admin.revoke"
    | "sync.um"
    | "config.update";
  targetType: string;
  targetId?: string | number | null;
  before?: unknown;
  after?: unknown;
};

export async function writeAuditLog(entry: AuditEntry) {
  try {
    const { error } = await supabaseAdmin.from("admin_audit_log").insert([{
      actor_id: entry.actorId,
      action: entry.action,
      target_type: entry.targetType,
      target_id: entry.targetId == null ? null : String(entry.targetId),
      before: entry.before ?? null,
      after: entry.after ?? null,
    }]);

    if (error) {
      console.error("[admin-audit] insert failed:", error.message);
    }
  } catch (error) {
    console.error("[admin-audit] insert threw:", error instanceof Error ? error.message : String(error));
  }
}
