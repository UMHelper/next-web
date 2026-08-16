import { NextResponse, type NextRequest } from "next/server";
import { fetchCatalogList } from "@/lib/database/get-course-info";

export const dynamic = "force-dynamic";

/**
 * GET /api/catalog?unit=FBA&dept=AIM
 *
 * 学院目录（与 Web 端 /catalog/[...departments] 页共用同款数据源）：
 * - 仅 unit=FBA                  → FBA 全部课程
 * - unit=gecourse                → 全部 GE 课程
 * - unit=FBA&dept=AIM            → AIM 系课程
 * - unit=GECourse&dept=GEGA      → GEGA 类 GE 课程
 * iOS 客户端（next-ios）使用。
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const unit = (searchParams.get("unit") ?? "").trim();
    const dept = (searchParams.get("dept") ?? "").trim();

    if (!unit) {
        return NextResponse.json({ error: "missing `unit` query parameter" }, { status: 400 });
    }

    try {
        const departments = dept ? [unit, dept] : [unit];
        const data = await fetchCatalogList(departments);
        return NextResponse.json(data ?? [], {
            headers: { "Cache-Control": "no-store, max-age=0" },
        });
    } catch (error) {
        console.error("[api/catalog] failed:", error);
        return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
}
