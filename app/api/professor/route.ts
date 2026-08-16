import { NextResponse, type NextRequest } from "next/server";
import { fetchCourseListByProf } from "@/lib/database/get-course-info";

export const dynamic = "force-dynamic";

/**
 * GET /api/professor?name=CHAN WENG HANG
 *
 * 教授所授课程列表（与 Web 端 /professor/[...name] 页共用同款数据源）。
 * iOS 客户端（next-ios）使用。
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const name = decodeURIComponent((searchParams.get("name") ?? "").trim())
        .replaceAll("$", "/")
        .toUpperCase();

    if (!name) {
        return NextResponse.json({ error: "missing `name` query parameter" }, { status: 400 });
    }

    try {
        const { data, error } = await fetchCourseListByProf({ name });
        if (error) {
            console.error("[api/professor] failed:", error);
            return NextResponse.json({ error: "internal error" }, { status: 500 });
        }
        return NextResponse.json(data ?? [], {
            headers: { "Cache-Control": "no-store, max-age=0" },
        });
    } catch (error) {
        console.error("[api/professor] failed:", error);
        return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
}
