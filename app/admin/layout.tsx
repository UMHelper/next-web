import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/comments", label: "Comments" },
  { href: "/admin/courses", label: "Courses" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin.ok) {
    if (admin.response.status === 401) redirect("/sign-in");
    notFound();
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">UMHelper Admin</h1>
        <div className="text-sm text-gray-500">{admin.session.userId}</div>
      </div>
      <nav className="mb-6 flex flex-wrap gap-2 border-b pb-2 text-sm">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="rounded px-3 py-1 hover:bg-gray-100">
            {item.label}
          </Link>
        ))}
        {admin.session.isPlatformAdmin ? (
          <Link href="/admin/admins" className="rounded px-3 py-1 hover:bg-gray-100">
            Admins
          </Link>
        ) : null}
      </nav>
      {children}
    </div>
  );
}
