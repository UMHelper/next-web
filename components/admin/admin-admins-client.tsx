"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import AdminPagination from "@/components/admin/admin-pagination";
import { Input } from "@/components/ui/input";

type AdminRow = {
  clerk_user_id: string;
  email: string | null;
  role: string;
  active: boolean;
  granted_by: string;
  granted_by_email: string | null;
  created_at: string;
};

type PlatformAdminRow = {
  clerk_user_id: string;
  email: string | null;
};

const PAGE_SIZE = 20;

export default function AdminAdminsClient() {
  const [platformAdminRows, setPlatformAdminRows] = useState<PlatformAdminRow[]>([]);
  const [platformAdminEmails, setPlatformAdminEmails] = useState<string[]>([]);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/admins?page=${page}&limit=${PAGE_SIZE}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      setPlatformAdminRows(body.platformAdminRows ?? []);
      setPlatformAdminEmails(body.platformAdminEmails ?? []);
      setAdmins(body.admins ?? []);
      setTotal(body.total ?? 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load admins");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function grant() {
    if (!userId.trim()) return;
    const response = await fetch("/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clerk_user_id: userId.trim() }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(body?.error?.message ?? "Failed to grant admin");
      return;
    }
    toast.success("Admin granted");
    setUserId("");
    await load();
  }

  async function revoke(id: string) {
    const response = await fetch(`/api/admin/admins/${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(body?.error?.message ?? "Failed to revoke admin");
      return;
    }
    toast.success("Admin revoked");
    await load();
  }

  const platformEmails = Array.from(new Set([
    ...platformAdminRows.map((row) => row.email).filter((email): email is string => Boolean(email)),
    ...platformAdminEmails,
  ]));

  return (
    <div className="space-y-6">
      <div className="text-lg font-semibold">Admins</div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 text-sm font-medium">Platform admins (environment)</div>
        <div className="space-y-1 font-mono text-xs">
          {platformEmails.length ? platformEmails.map((email) => <div key={email}>{email}</div>) : <div>-</div>}
        </div>
      </div>

      <div className="rounded-lg border p-4">
        <div className="mb-3 text-sm font-medium">Grant admin by email or Clerk user ID</div>
        <div className="flex gap-2">
          <Input
            className="max-w-sm"
            placeholder="name@example.com or user_xxx"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void grant();
            }}
          />
          <Button onClick={grant} disabled={loading || !userId.trim()}>Grant admin</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b text-gray-500">
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Active</th>
              <th className="p-3">Granted by</th>
              <th className="p-3">Created</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.clerk_user_id} className="border-b last:border-0">
                <td className="p-3 text-xs">{admin.email ?? "-"}</td>
                <td className="p-3">{admin.role}</td>
                <td className="p-3">{admin.active ? "Yes" : "No"}</td>
                <td className="p-3 text-xs">{admin.granted_by_email ?? "-"}</td>
                <td className="p-3 text-xs">{String(admin.created_at).slice(0, 19).replace("T", " ")}</td>
                <td className="p-3">
                  {admin.active ? (
                    <Button size="xs" variant="outline" onClick={() => revoke(admin.clerk_user_id)}>Revoke</Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!loading && admins.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-500">No DB admins</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminPagination
        page={page}
        limit={PAGE_SIZE}
        total={total}
        loading={loading}
        onPageChange={setPage}
      />
    </div>
  );
}
