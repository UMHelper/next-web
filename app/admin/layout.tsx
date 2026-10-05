import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

import AdminNav from "@/components/admin/admin-nav";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { noIndexMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "UMHelper Admin",
  ...noIndexMetadata,
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin.ok) {
    if (admin.response.status === 401) {
      // redirectToSignIn keeps the current URL, so a deep link returns here after sign-in.
      const { redirectToSignIn } = await auth();
      return redirectToSignIn();
    }
    notFound();
  }

  return (
    <div className="mx-auto max-w-screen-xl px-3 py-5 sm:px-4 sm:py-6">
      <div className="mb-4 flex items-center justify-between sm:mb-6">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">UMHelper Admin</h1>
          <div className="text-xs text-muted-foreground sm:text-sm">
            {admin.session.isPlatformAdmin ? "Platform admin" : "Admin"}
          </div>
        </div>
      </div>
      <AdminNav isPlatformAdmin={admin.session.isPlatformAdmin} />
      {children}
    </div>
  );
}
