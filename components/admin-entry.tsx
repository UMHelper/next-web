"use client";

import { useAuth } from "@clerk/nextjs";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import React, { useEffect, useState } from "react";

export default function AdminEntry({ className }: { className?: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setIsAdmin(false);
      return;
    }

    const controller = new AbortController();
    fetch("/api/admin/me", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return false;
        const body = await response.json().catch(() => null);
        return Boolean(body?.isAdmin);
      })
      .then((nextIsAdmin) => setIsAdmin(nextIsAdmin))
      .catch(() => {
        // Ignore aborted requests and transient failures; the entry stays hidden.
      });

    return () => controller.abort();
  }, [isLoaded, isSignedIn]);

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      aria-label="Admin console"
      title="Admin console"
      className={`inline-flex items-center justify-center rounded p-1.5 text-gray-900 hover:bg-gray-100 hover:text-blue-500 ${className ?? ""}`}
    >
      <ShieldCheck size={18} />
    </Link>
  );
}
