import React from "react";
import { notFound, redirect } from "next/navigation";

import AssistantAccessClient from "@/components/admin/assistant-access-client";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { readAssistantAccess } from "@/lib/assistant/access";

export const dynamic = "force-dynamic";

export default async function AssistantAdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin.ok) {
    if (admin.response.status === 401) redirect("/sign-in");
    notFound();
  }
  if (!admin.session.isPlatformAdmin) notFound();

  const access = await readAssistantAccess();
  return <AssistantAccessClient initialAccess={access} />;
}
