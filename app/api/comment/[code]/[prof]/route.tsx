import {NextResponse} from "next/server";;
import supabase from '@/lib/database/database';
import { getReviewInfo } from "@/lib/database/get-prof-info";
import { put } from '@vercel/blob';
import { uuid } from "@/lib/utils";

export async function POST(request: Request){
    let body = await request.formData()
    // console.log(body)
    const course=await getReviewInfo(body.get('code') as string,body.get('prof') as string)
    // console.log(course)
    // delete body.code
    // delete body.prof
    let data:any={}
    data.course_id=course.id
    // console.log(data)
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
    data.id=27734+id.count+200
    // console.log(body.get('image'))
    if (body.get('verify')==="1"){
        data.verify=1
        data.verify_account=body.get('verify_account') as string
    }
    if (body.get('verify')==="1" && body.get('image')!=""){
        const image:any=(await body.get('image'))
        // const ext=image.name.split('.').pop()
        // let name=uuid()+'.'+ext
        // const blob = await put(name, await image.arrayBuffer(), {
        //     access: 'public',
        //   });

        // data.img=blob.url

        const formData = new FormData()
        formData.append('image', image)
        const response=await fetch('https://api.imgur.com/3/upload',
        {
            method: 'POST',
            body: formData,
            headers:{
                'Authorization':`Client-ID ${process.env.IMGUR_CLIENT_ID}`
            }
        })
        const json=await response.json()
        // console.log(json)
        data.img=json.data.link
        
    }
    // console.log(data)
    const {data : res,error}:{data:any, error:any}= await supabase.from('comment').insert([data]).select()
    console.log(res,error)
    const course_id=res.course_id


    course.comments=1+parseInt(course.comments)
    course.result=(parseFloat(course.result)*parseInt(course.comments)+parseFloat(data.result))/parseInt(course.comments)
    course.attendance=(parseFloat(course.attendance)*course.comments+parseFloat(data.attendance))/(course.comments)
    course.grade=(parseFloat(course.grade)*course.comments+parseFloat(data.grade))/(course.comments)
    course.hard=(parseFloat(course.hard)*course.comments+parseFloat(data.hard))/(course.comments)
    course.reward=(parseFloat(course.reward)*course.comments+parseFloat(data.reward))/(course.comments)

    // console.log(course)
    const {data:update,error:update_error}=await supabase.from('prof_with_course').update({...course}).eq('id',course.id).select()
    // console.log(update,update_error)
    return new NextResponse(null,{status:200})
}