import {NextResponse} from "next/server";;
import supabase from '@/lib/database/database';
import { getReviewInfo } from "@/lib/database/get-prof-info";
import { put } from '@vercel/blob';
import { uuid } from "@/lib/utils";

export async function POST(request: Request){
    let body = await request.formData()
    const course=await getReviewInfo(body.get('code') as string,body.get('prof') as string)
    // //console.log(course)
    // delete body.code
    // delete body.prof
    let data:any={}
    data.course_id=course.id
    data.result=(parseFloat(body.get('attendance') as string)+
                parseFloat(body.get('pre') as string)+
                parseFloat(body.get('grade') as string)+
                parseFloat(body.get("hard") as string)+
                parseFloat(body.get('reward') as string)+
                parseFloat(body.get('assignment') as string)+
                parseFloat(body.get('recommend') as string))/7
    data.attendance=parseFloat(body.get('attendance') as string)
    data.pre=parseFloat(body.get('pre') as string)
    data.grade=parseFloat(body.get('grade') as string)
    data.hard=parseFloat(body.get("hard") as string)
    data.reward=parseFloat(body.get('reward') as string)
    data.assignment=parseFloat(body.get('assignment') as string)
    data.recommend=parseFloat(body.get('recommend') as string)
    data.content=body.get('content') as string
    // // 2021-10-10T16:00:00.000Z
    data.pub_time=new Date().toISOString().slice(0, 19).replace('T', ' ')
    const id:any=await supabase.from('comment').select('*', { count: 'exact', head: true })
    data.id=27734+id.count
    console.log(body.get('image'))
    if (body.get('image')!=""){
        const image:any=(await body.get('image'))
        const ext=image.name.split('.').pop()
        let name=uuid()+'.'+ext
        const blob = await put(name, await image.arrayBuffer(), {
            access: 'public',
          });

        data.image=blob.url
    }

    console.log(data)
    const {data : res,error}= await supabase.from('comment').insert([data]).select()
    // console.log(res,error)
    return new NextResponse(JSON.stringify({res,error}))
}