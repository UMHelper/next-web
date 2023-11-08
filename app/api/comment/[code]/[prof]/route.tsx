import {NextResponse} from "next/server";
import {COMMENT} from "@/consant";
import {delay} from "@/lib/utils";
import createServer from "@/lib/database/database";
import { getProfInfo } from "@/lib/database/prof_info";

export async function GET(){
    await delay(1000)
    return new NextResponse(JSON.stringify(COMMENT))
}

export async function POST(request: Request){
    let body = await request.json()
    const course=await getProfInfo(body.code,body.prof)
    console.log(course)
    delete body.code
    delete body.prof
    body.course_id=course.id
    body.result=(parseFloat(body.attendance)+parseFloat(body.pre)+body.grade+body.hard+body.reward+body.assignment+body.recommend)/7
    // 2021-10-10T16:00:00.000Z
    body.pub_time=new Date().toISOString().slice(0, 19).replace('T', ' ')
    createServer.from('comment').insert([body]).select().then(({data,error}:{data:any,error:any})=>{
        console.log(data)
        console.log(error)
    })
    console.log(body)
    return new NextResponse(JSON.stringify(COMMENT))
}