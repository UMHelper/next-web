import {NextResponse} from "next/server";
import {COMMENT} from "@/consant";
import {delay} from "@/lib/utils";

export async function GET(){
    await delay(1000)
    return new NextResponse(JSON.stringify(COMMENT))
}