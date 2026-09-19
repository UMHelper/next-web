import { notFound, redirect } from "next/navigation";

import AdminNav from "@/components/admin/admin-nav";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin.ok) {
    if (admin.response.status === 401) redirect("/sign-in");
    notFound();
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">UMHelper Admin</h1>
          <div className="text-sm text-gray-500">
            {admin.session.isPlatformAdmin ? "Platform admin" : "Admin"}
          </div>
        </div>
      </div>
      <AdminNav isPlatformAdmin={admin.session.isPlatformAdmin} />
      {children}
    </div>
  );
}
