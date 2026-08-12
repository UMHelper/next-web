import { REACTION_EMOJI_LIST } from '@/lib/consant';
import supabaseAdmin from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request){
    const body=await request.json();
    delete body.emoji_vote
    delete body.vote_history
    delete body.img

    const {data,error}:{data:any,error:any}=await supabaseAdmin.from('comment').insert([body]).select().single()
    if (error || !data) {
        console.error(error)
        return new NextResponse(null,{status:500})
    }

    // console.log(data,error)
    let reply=data
    reply.emoji_vote=REACTION_EMOJI_LIST.map((emoji:string)=>({emoji:emoji,count:0}))
    reply.vote_history=[]
    return NextResponse.json(reply,{status:200})

}
