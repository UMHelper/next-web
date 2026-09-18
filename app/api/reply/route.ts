import { REACTION_EMOJI_LIST } from '@/lib/consant';
import { iosVersionGuard } from '@/lib/ios-version';
import supabaseAdmin from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function POST(request: Request){
    // 版本控制：回复接口为 Web/iOS 共用；仅当请求携带 iOS 版本头时检查。
    const versionResponse = iosVersionGuard(request, { allowMissingVersion: true });
    if (versionResponse) return versionResponse;

    const body=await request.json();
    delete body.emoji_vote
    delete body.vote_history
    delete body.img
    // 主键 id 由数据库自增分配：客户端展开父评论时会带上父评论 id,
    // 直接插入会撞唯一约束导致回复失败(自 2026-08 主键迁移后 web 端回复即失效)
    delete body.id

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
