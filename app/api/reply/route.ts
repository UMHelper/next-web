import { REACTION_EMOJI_LIST } from '@/lib/consant';
import supabase from '@/lib/database/database';
import { NextResponse } from 'next/server';

export async function POST(request: Request){
    const body=await request.json();

    const id:any=await supabase.from('comment').select('id').order('id',{ascending:false}).limit(1)
    console.log(id)
    
    // DO NOT CHANGE THIS ID 
    // check comment API 
    body.id=id.data[0].id+1
    delete body.emoji_vote
    delete body.vote_history
    delete body.img

    const {data,error}:{data:any,error:any}=await supabase.from('comment').insert([body]).select()

    console.log(data,error)
    let reply=data[0]
    reply.emoji_vote=REACTION_EMOJI_LIST.map((emoji:string)=>({emoji:emoji,count:0}))
    reply.vote_history=[]
    return NextResponse.json(reply,{status:200})

}