import { NextResponse } from "next/server";
import { getStatistics } from "@/lib/database/get-statistics";

export const dynamic = "force-dynamic";

/**
 * GET /api/statistics
 *
 * 各学院课程/评论统计（首页 Comment Bank 用，与 Web 端共用同款数据源）。
 * iOS 客户端（next-ios）使用。
 */
export async function GET() {
    try {
        const data = await getStatistics();
        return NextResponse.json(data ?? [], {
            headers: { "Cache-Control": "no-store, max-age=0" },
        });
    } catch (error) {
        console.error("[api/statistics] failed:", error);
        return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
}
