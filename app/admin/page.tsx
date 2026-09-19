import { getClerkUserEmails } from "@/lib/admin-auth";
import supabaseAdmin from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function count(query: PromiseLike<{ count: number | null }>) {
  const result = await query;
  return result.count ?? 0;
}

export default async function AdminDashboardPage() {
  const [openReports, hiddenComments, recentAudit] = await Promise.all([
    count(supabaseAdmin.from("reports").select("*", { count: "exact", head: true }).eq("status", "open")),
    count(supabaseAdmin.from("comment").select("*", { count: "exact", head: true }).eq("hidden", 1)),
    supabaseAdmin
      .from("admin_audit_log")
      .select("id, actor_id, action, target_type, target_id, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const auditEntries = recentAudit.data ?? [];
  const actorEmails = await getClerkUserEmails(
    auditEntries.map((entry: any) => entry.actor_id).filter(Boolean),
  );

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
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-2">Time</th>
                <th className="py-2">Admin</th>
                <th className="py-2">Action</th>
                <th className="py-2">Target</th>
              </tr>
            </thead>
            <tbody>
              {auditEntries.map((entry: any) => (
                <tr key={entry.id} className="border-b last:border-0">
                  <td className="py-2">{String(entry.created_at).slice(0, 19).replace("T", " ")}</td>
                  <td className="py-2 text-xs">{actorEmails.get(entry.actor_id) ?? "-"}</td>
                  <td className="py-2">{entry.action}</td>
                  <td className="py-2">
                    {entry.target_type}
                    {entry.target_id ? `: ${entry.target_id}` : ""}
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
