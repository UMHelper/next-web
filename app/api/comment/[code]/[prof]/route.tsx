import {NextResponse} from "next/server";;
import supabaseAdmin from '@/lib/supabase/admin';
import { getReviewInfo } from "@/lib/database/get-prof-info";

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
    const {data : res,error}:{data:any, error:any}= await supabaseAdmin.rpc(
        'insert_comment_and_refresh_prof_stats',
        {
            target_course_id: course.id,
            target_content: data.content,
            target_attendance: data.attendance,
            target_pre: data.pre,
            target_grade: data.grade,
            target_hard: data.hard,
            target_reward: data.reward,
            target_recommend: data.recommend,
            target_assignment: data.assignment,
            target_result: data.result,
            target_pub_time: data.pub_time,
            target_verify: data.verify,
            target_verify_account: data.verify_account,
            target_img: data.img ?? null,
        }
    ).single()
    if (error || !res) {
        console.error(error)
        return new NextResponse(null,{status:500})
    }
    console.log(res,error)
    return new NextResponse(null,{status:200})
}
