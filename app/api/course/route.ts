import { NextResponse, type NextRequest } from "next/server";
import { fetchCourseInfo } from "@/lib/database/get-course-info";
import { verifyIOSRequest, iosUnauthorized } from "@/lib/ios-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/course?code=ACCT1000
 *
 * 课程详情 + 教授列表（与 Web 端 /course/[code] 页共用同款数据源）。
 * iOS 客户端（next-ios）使用。
 */
export async function GET(request: NextRequest) {
    // iOS 专用接口认证(2FA 时间戳签名)
    if (!verifyIOSRequest(request)) return iosUnauthorized()

    const { searchParams } = new URL(request.url);
    const code = (searchParams.get("code") ?? "").trim().toUpperCase();

    if (!code) {
        return NextResponse.json({ error: "missing `code` query parameter" }, { status: 400 });
    }

    try {
        const { course, profList, isOffer } = await fetchCourseInfo(code);
        return NextResponse.json({ course, profList, isOffer }, {
            headers: { "Cache-Control": "no-store, max-age=0" },
        });
    } catch (error) {
        console.error("[api/course] failed:", error);
        return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
}
