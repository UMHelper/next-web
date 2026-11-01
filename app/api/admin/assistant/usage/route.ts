import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { readAssistantUsageSummary } from "@/lib/assistant/usage";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const summary = await readAssistantUsageSummary();
  return NextResponse.json(summary, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
