import { getClerkUserEmails } from "@/lib/admin-auth";
import supabaseAdmin from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const AUDIT_EMAIL_TIMEOUT_MS = 1_500;

async function count(query: PromiseLike<{ count: number | null }>) {
  const result = await query;
  return result.count ?? 0;
}

async function resolveAuditActorEmails(entries: any[]) {
  const actorIds = entries.map((entry) => entry.actor_id).filter(Boolean);
  if (actorIds.length === 0) return new Map<string, string | null>();

  return Promise.race([
    getClerkUserEmails(actorIds),
    new Promise<Map<string, string | null>>((resolve) => {
      setTimeout(() => resolve(new Map()), AUDIT_EMAIL_TIMEOUT_MS);
    }),
  ]);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length > 80 ? `${clean.slice(0, 77)}…` : clean;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  try {
    const json = JSON.stringify(value);
    return json.length > 80 ? `${json.slice(0, 77)}…` : json;
  } catch {
    return "[object]";
  }
}

function summarizeAuditChanges(entry: any): string {
  const before = asRecord(entry.before);
  const after = asRecord(entry.after);

  if (before && after) {
    const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
    const changed = keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    if (changed.length === 0) return "no field changes";

    const summary = changed
      .slice(0, 5)
      .map((key) => `${key}: ${formatAuditValue(before[key])} → ${formatAuditValue(after[key])}`)
      .join("; ");

    return changed.length > 5 ? `${summary} (+${changed.length - 5} more)` : summary;
  }

  if (after) {
    const keys = Object.keys(after).slice(0, 4);
    return keys.length
      ? `created: ${keys.map((key) => `${key}=${formatAuditValue(after[key])}`).join(", ")}`
      : "created";
  }

  if (before) return "deleted";
  return "-";
}

export default async function AdminDashboardPage() {
  const [openReports, hiddenComments, recentAudit] = await Promise.all([
    count(supabaseAdmin.from("reports").select("*", { count: "exact", head: true }).eq("status", "open")),
    count(supabaseAdmin.from("comment").select("*", { count: "exact", head: true }).eq("hidden", 1)),
    supabaseAdmin
      .from("admin_audit_log")
      .select("id, actor_id, action, target_type, target_id, before, after, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (recentAudit.error) {
    console.error("[admin/dashboard] audit query failed:", recentAudit.error.message);
  }
  const auditEntries = recentAudit.error ? [] : recentAudit.data ?? [];
  const actorEmails = await resolveAuditActorEmails(auditEntries);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">Open reports</div>
          <div className="text-3xl font-bold">{openReports}</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm text-gray-500">Hidden comments</div>
          <div className="text-3xl font-bold">{hiddenComments}</div>
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-3 text-lg font-semibold">Recent audit log</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-2">Time</th>
                <th className="py-2">Admin</th>
                <th className="py-2">Action</th>
                <th className="py-2">Target</th>
                <th className="py-2">Changes</th>
              </tr>
            </thead>
            <tbody>
              {recentAudit.error ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    Unable to load audit log
                  </td>
                </tr>
              ) : auditEntries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-500">
                    No recent audit logs
                  </td>
                </tr>
              ) : auditEntries.map((entry: any) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="py-2">{String(entry.created_at).slice(0, 19).replace("T", " ")}</td>
                  <td className="py-2 text-xs">{actorEmails.get(entry.actor_id) ?? "-"}</td>
                  <td className="py-2">{entry.action}</td>
                  <td className="py-2">
                    {entry.target_type}
                    {entry.target_id ? `: ${entry.target_id}` : ""}
                  </td>
                  <td className="max-w-[420px] py-2 text-xs text-gray-600">
                    <div className="line-clamp-2">{summarizeAuditChanges(entry)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
