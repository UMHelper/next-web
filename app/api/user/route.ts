import { NextRequest, NextResponse } from "next/server"
import { clerk } from '@/lib/clerk';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url)
    const user_id = searchParams.get('id') || ""
    if (user_id === "") return new NextResponse(JSON.stringify({ error: "user_id is empty" }))
    const account = await clerk.users.getUser(user_id)
    console.log(account)
    return new NextResponse(JSON.stringify({ firstName: account.firstName, lastName: account.lastName, imageUrl: account.imageUrl }))
}