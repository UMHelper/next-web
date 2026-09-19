"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Report = {
  id: number;
  target_id: number;
  course_id: string | null;
  prof_id: string | null;
  reporter_id: string | null;
  reporter_platform: string;
  reason: string;
  details: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

async function updateReport(id: number, patch: Record<string, unknown>) {
  const response = await fetch(`/api/admin/reports/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
  }
}

export default function AdminReportsClient() {
  const [status, setStatus] = useState("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/reports?status=${status}&limit=50`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      setReports(body.reports ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(report: Report, nextStatus: "open" | "resolved" | "dismissed") {
    const note = nextStatus === "open"
      ? ""
      : window.prompt("Admin note (optional)", report.admin_note ?? "") ?? null;

    try {
      await updateReport(report.id, {
        status: nextStatus,
        ...(nextStatus === "open" ? { admin_note: null } : { admin_note: note || null }),
      });
      toast.success("Report updated");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update report");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="text-lg font-semibold">Reports</div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b text-gray-500">
              <th className="p-3">ID</th>
              <th className="p-3">Target</th>
              <th className="p-3">Course / Prof</th>
              <th className="p-3">Reason</th>
              <th className="p-3">Reporter</th>
              <th className="p-3">Created</th>
              <th className="p-3">Note</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="border-b last:border-0">
                <td className="p-3">{report.id}</td>
                <td className="p-3">
                  {report.target_id}
                  {report.details ? (
                    <div className="mt-1 max-w-[360px] truncate text-xs text-gray-500">{report.details}</div>
                  ) : null}
                </td>
                <td className="p-3">
                  {report.course_id ?? "-"}
                  <div className="text-xs text-gray-500">{report.prof_id ?? "-"}</div>
                </td>
                <td className="p-3">{report.reason}</td>
                <td className="p-3">
                  {report.reporter_id ?? "-"}
                  <div className="text-xs text-gray-500">{report.reporter_platform}</div>
                </td>
                <td className="p-3 text-xs">{String(report.created_at).slice(0, 19).replace("T", " ")}</td>
                <td className="p-3 max-w-[200px] truncate text-xs">{report.admin_note ?? "-"}</td>
                <td className="p-3">
                  <div className="flex gap-2">
                    {report.status !== "resolved" ? (
                      <Button size="xs" onClick={() => changeStatus(report, "resolved")}>Resolve</Button>
                    ) : null}
                    {report.status !== "dismissed" ? (
                      <Button size="xs" variant="outline" onClick={() => changeStatus(report, "dismissed")}>Dismiss</Button>
                    ) : null}
                    {report.status !== "open" ? (
                      <Button size="xs" variant="ghost" onClick={() => changeStatus(report, "open")}>Reopen</Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && reports.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">No reports</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
