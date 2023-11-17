import {NextResponse} from "next/server";
import {FUZZY_SEARCH_COURSE} from "@/consant";

export async function GET(){
    return new NextResponse(JSON.stringify(FUZZY_SEARCH_COURSE))
}