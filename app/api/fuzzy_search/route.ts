import { NextResponse, type NextRequest } from "next/server";
import { fuzzySearch } from "@/lib/database/get-fuzzy-search";

export const dynamic = "force-dynamic";

/**
 * GET /api/fuzzy_search?keyword=ACCT&type=course
 *
 * 模糊搜索（与 Web 端搜索页共用同款 RPC）：
 * - type=course      → 课程列表（course_noporf 全字段，按 New_code 去重）
 * - type=instructor  → [{ prof_name, course_list }]
 * iOS 客户端（next-ios）使用。
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const keyword = (searchParams.get("keyword") ?? "").trim();
    const type = (searchParams.get("type") ?? "course").trim();

    if (!keyword) {
        return NextResponse.json({ error: "missing `keyword` query parameter" }, { status: 400 });
    }
    if (type !== "course" && type !== "instructor") {
        return NextResponse.json({ error: "`type` must be `course` or `instructor`" }, { status: 400 });
    }

    try {
        const data = await fuzzySearch(keyword, type);
        return NextResponse.json(data, {
            headers: { "Cache-Control": "no-store, max-age=0" },
        });
    } catch (error) {
        console.error("[api/fuzzy_search] failed:", error);
        return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
}
