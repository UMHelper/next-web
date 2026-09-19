"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminRow = {
  clerk_user_id: string;
  role: string;
  active: boolean;
  granted_by: string;
  created_at: string;
};

export default function AdminAdminsClient() {
  const [platformAdmins, setPlatformAdmins] = useState<string[]>([]);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/admins");
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      setPlatformAdmins(body.platformAdmins ?? []);
      setAdmins(body.admins ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load admins");
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="text-lg font-semibold">Admins</div>

      <div className="rounded-lg border p-4">
        <div className="mb-2 text-sm font-medium">Platform admins (environment)</div>
        <div className="space-y-1 font-mono text-xs">
          {platformAdmins.map((id) => <div key={id}>{id}</div>)}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          className="max-w-sm"
          placeholder="user_xxx"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
        />
        <Button onClick={grant} disabled={loading}>Grant admin</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b text-gray-500">
              <th className="p-3">Clerk user</th>
              <th className="p-3">Role</th>
              <th className="p-3">Active</th>
              <th className="p-3">Granted by</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => (
              <tr key={admin.clerk_user_id} className="border-b last:border-0">
                <td className="p-3 font-mono text-xs">{admin.clerk_user_id}</td>
                <td className="p-3">{admin.role}</td>
                <td className="p-3">{admin.active ? "Yes" : "No"}</td>
                <td className="p-3 font-mono text-xs">{admin.granted_by}</td>
                <td className="p-3">
                  {admin.active ? (
                    <Button size="xs" variant="outline" onClick={() => revoke(admin.clerk_user_id)}>Revoke</Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
