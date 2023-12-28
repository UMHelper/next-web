import { delay } from "@/lib/utils";
import {NextResponse} from "next/server";
import supabase from '@/lib/database/database';

export async function POST(request: Request){
    const body=await request.json();
    // console.log(body);
    // await delay(2000)
    const {data,error}=await supabase.from('vote').insert([{
        comment_id:body.comment,
        offset:body.offset,
        created_by:body.created_by,
        created_at:new Date().toISOString().slice(0, 19).replace('T', ' '),
    }]).select()
    // console.log(data,error);
    return NextResponse.json(body,{status:200})
}