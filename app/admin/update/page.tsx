import React from "react";
import { notFound, redirect } from "next/navigation";

import UpdateClient from "@/app/admin/update/update-client";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function UpdatePage() {
  const admin = await getCurrentAdmin();
  if (!admin.ok) {
    if (admin.response.status === 401) redirect("/sign-in");
    notFound();
  }
  if (!admin.session.isPlatformAdmin) notFound();

  return <UpdateClient />;
}
