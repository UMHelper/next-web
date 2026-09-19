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
    <div className="mx-auto max-w-screen-xl px-3 py-5 sm:px-4 sm:py-6">
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">UMHelper Admin</h1>
          <div className="text-xs text-gray-500 sm:text-sm">
            {admin.session.isPlatformAdmin ? "Platform admin" : "Admin"}
          </div>
        </div>
      </div>
      <AdminNav isPlatformAdmin={admin.session.isPlatformAdmin} />
      {children}
    </div>
  );
}
