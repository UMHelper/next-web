import {connectToDatabase} from "@/lib/database";
import {NextResponse} from "next/server";

export async function GET(){
    await connectToDatabase()

    return new NextResponse(JSON.stringify({code:1}))
}
