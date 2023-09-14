import {NextResponse} from "next/server";
import {FUZZY_SEARCH_COURSE} from "@/consant";
import {delay} from "@/lib/utils";

export async function GET(){
    await delay(3000)
    return new NextResponse(JSON.stringify(FUZZY_SEARCH_COURSE))
}