"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import AdminInfiniteScroll from "@/components/admin/admin-infinite-scroll";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Report = {
  id: number;
  target_type: string;
  target_id: number;
  course_id: string | null;
  prof_id: string | null;
  reporter_id: string | null;
  reporter_platform: string;
  email: string | null;
  reason: string;
  details: string | null;
  status: string;
  admin_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
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

const PAGE_SIZE = 50;

export default function AdminReportsClient() {
  const [status, setStatus] = useState("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestIdRef = useRef(0);

  const loadPage = useCallback(async (targetPage: number, append: boolean) => {
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const response = await fetch(`/api/admin/reports?status=${status}&page=${targetPage}&limit=${PAGE_SIZE}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      if (requestId !== requestIdRef.current) return;

      const nextReports = body.reports ?? [];
      setReports((current) => (append ? [...current, ...nextReports] : nextReports));
      setTotal(body.total ?? 0);
      setPage(targetPage);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        toast.error(error instanceof Error ? error.message : "Failed to load reports");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  }, [status]);

  useEffect(() => {
    setReports([]);
    setPage(1);
    void loadPage(1, false);
  }, [loadPage]);

  const hasMore = reports.length < total;
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void loadPage(page + 1, true);
  }, [loadPage, page, loading, loadingMore, hasMore]);

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
      await loadPage(1, false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update report");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="text-lg font-semibold">Reports</div>
        <Select value={status} onValueChange={(value) => { setStatus(value); setPage(1); }}>
          <SelectTrigger className="w-32 sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => void loadPage(1, false)} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b text-gray-500">
              <th className="p-3">ID</th>
              <th className="p-3">Type / Target</th>
              <th className="p-3">Course / Prof</th>
              <th className="p-3">Reason / Details</th>
              <th className="p-3">Reporter</th>
              <th className="p-3">Status</th>
              <th className="p-3">Created</th>
              <th className="p-3">Resolved</th>
              <th className="p-3">Note</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className="border-b last:border-0">
                <td className="p-3">{report.id}</td>
                <td className="p-3">
                  <div>{report.target_type}</div>
                  <div className="font-mono text-xs text-gray-500">#{report.target_id}</div>
                </td>
                <td className="p-3">
                  {report.course_id ?? "-"}
                  <div className="text-xs text-gray-500">{report.prof_id ?? "-"}</div>
                </td>
                <td className="p-3">
                  <div>{report.reason}</div>
                  {report.details ? (
                    <div className="mt-1 max-w-[360px] line-clamp-2 text-xs text-gray-500">{report.details}</div>
                  ) : null}
                </td>
                <td className="p-3">
                  <div>{report.email ?? "-"}</div>
                  <div className="text-xs text-gray-500">{report.reporter_platform}</div>
                </td>
                <td className="p-3">
                  <span className={
                    report.status === "open"
                      ? "rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700"
                      : report.status === "resolved"
                        ? "rounded bg-green-100 px-2 py-0.5 text-xs text-green-700"
                        : "rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                  }>
                    {report.status}
                  </span>
                </td>
                <td className="p-3 text-xs">{String(report.created_at).slice(0, 19).replace("T", " ")}</td>
                <td className="p-3 text-xs">
                  {report.resolved_at ? String(report.resolved_at).slice(0, 19).replace("T", " ") : "-"}
                </td>
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
                <td colSpan={10} className="p-6 text-center text-gray-500">No reports</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminInfiniteScroll
        canLoadMore={hasMore}
        loading={loading || loadingMore}
        onLoadMore={loadMore}
      />
    </div>
  );
}
