import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { canUseAssistant } from "@/lib/assistant/access";

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  const enabled = userId ? await canUseAssistant(userId) : false;
  return NextResponse.json({ enabled }, { headers: { "Cache-Control": "private, no-store" } });
}
