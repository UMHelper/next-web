import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { parseAssistantUsageDays } from "@/lib/assistant/usage-shared";
import { readAssistantUsageSummary } from "@/lib/assistant/usage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const days = parseAssistantUsageDays(new URL(request.url).searchParams.get("days"));
  const summary = await readAssistantUsageSummary(new Date(), { days });
  return NextResponse.json(summary, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
