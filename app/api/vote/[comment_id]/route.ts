import { delay } from "@/lib/utils";
import {NextResponse} from "next/server";
import supabaseAdmin from '@/lib/supabase/admin';

export async function POST(request: Request){
    const body=await request.json();
    // console.log(body);
    // await delay(2000)
    const {data,error}=await supabaseAdmin.from('vote').insert([{
        comment_id:body.comment,
        offset:body.offset,
        created_by:body.created_by,
        created_at:new Date().toISOString().slice(0, 19).replace('T', ' '),
        emoji:body.emoji || null
    }]).select()
    if (error) {
        if (error.code === '23505') {
            return NextResponse.json(body,{status:200})
        }
        console.error(error)
        return NextResponse.json({ error: error.message },{status:500})
    }
    return NextResponse.json(body,{status:200})
}
