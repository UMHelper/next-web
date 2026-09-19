import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  return NextResponse.json({
    isAdmin: true,
    isPlatformAdmin: admin.session.isPlatformAdmin,
  });
}
