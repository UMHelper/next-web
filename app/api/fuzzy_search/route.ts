import { NextRequest, NextResponse } from "next/server";
import { FUZZY_SEARCH_COURSE } from "@/consant";
import { fuzzySearch } from "@/lib/database/get-fuzzy-search";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')?.toLowerCase() || ""
    const keyword = searchParams.get('keyword')?.toUpperCase() || ""
    if (keyword === "" || type === "") return new NextResponse(JSON.stringify({ error: "keyword or type is empty" }))
    if (type === "course" || type == "instructor") {
        // console.log(type, keyword)
        const data = await fuzzySearch(keyword, type)
        return new NextResponse(JSON.stringify(data))
    }
    return new NextResponse(JSON.stringify({ error: "type is not valid" }))
}