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
    
    // ensure score is between 1 to 5
    let regularizeScore = (score: any) => {
        let scoreFloat = parseFloat(score as string);
        if (scoreFloat < 1) return 1
        if (scoreFloat > 5) return 5
        return scoreFloat
    }
    
    // console.log(data)

    data.attendance=regularizeScore(body.get('attendance'))
    data.pre=regularizeScore(body.get('pre'))
    data.grade=regularizeScore(body.get('grade'))
    data.hard=regularizeScore(body.get("hard"))
    data.reward=regularizeScore(body.get('reward'))
    data.assignment=regularizeScore(body.get('assignment'))
    data.recommend=regularizeScore(body.get('recommend'))
    data.result=(data.attendance+data.pre+data.grade+data.hard+data.reward+data.assignment+data.recommend)/7

    // data.result=(parseFloat(body.get('attendance') as string)+
    //             parseFloat(body.get('pre') as string)+
    //             parseFloat(body.get('grade') as string)+
    //             parseFloat(body.get("hard") as string)+
    //             parseFloat(body.get('reward') as string)+
    //             parseFloat(body.get('assignment') as string)+
    //             parseFloat(body.get('recommend') as string))/7
    // data.attendance=parseFloat(body.get('attendance') as string)
    // data.pre=parseFloat(body.get('pre') as string)
    // data.grade=parseFloat(body.get('grade') as string)
    // data.hard=parseFloat(body.get("hard") as string)
    // data.reward=parseFloat(body.get('reward') as string)
    // data.assignment=parseFloat(body.get('assignment') as string)
    // data.recommend=parseFloat(body.get('recommend') as string)
    data.content=body.get('content') as string
    // // 2021-10-10T16:00:00.000Z
    data.pub_time=new Date().toISOString().slice(0, 19).replace('T', ' ')
    const id:any=await supabase.from('comment').select('id').order('id',{ascending:false}).limit(1)
    
    // DO NOT CHANGE THIS ID 
    // check reply API 
    data.id=id.data[0].id+1

    // console.log(body.get('image'))
    if (body.get('verify')==="1"){
        data.verify=1
        data.verify_account=body.get('verify_account') as string
    }
    else{
        data.verify=0
        data.verify_account=""
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
        
        if (json.success){
            data.img=json.data.link
        }
        else{
            return new NextResponse(null,{status:400})
        }
        
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