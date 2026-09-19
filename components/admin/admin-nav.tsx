"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/comments", label: "Comments" },
  { href: "/admin/courses", label: "Courses" },
  { href: "/admin/notes", label: "Course Notes" },
  { href: "/admin/admins", label: "Admins", platformOnly: true },
];

export default function AdminNav({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="-mx-3 mb-4 flex gap-1 overflow-x-auto border-b px-3 pb-2 text-sm sm:mx-0 sm:mb-6 sm:px-0">
      {NAV_ITEMS.filter((item) => !item.platformOnly || isPlatformAdmin).map((item) => {
        const active = item.href === "/admin"
          ? pathname === item.href
          : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 ${
              active
                ? "rounded bg-blue-50 px-3 py-2 font-medium text-blue-700"
                : "rounded px-3 py-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
