import {NextResponse} from "next/server";

export async function GET(){
    return new NextResponse(JSON.stringify({code:1}))
}
