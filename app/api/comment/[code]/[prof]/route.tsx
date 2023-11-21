import {NextResponse} from "next/server";;
import supabase from '@/lib/database/database';
import { getReviewInfo } from "@/lib/database/get-prof-info";


export async function POST(request: Request){
    let body = await request.json()
    const course=await getReviewInfo(body.code,body.prof)
    //console.log(course)
    delete body.code
    delete body.prof
    body.course_id=course.id
    body.result=(parseFloat(body.attendance)+parseFloat(body.pre)+body.grade+body.hard+body.reward+body.assignment+body.recommend)/7
    // 2021-10-10T16:00:00.000Z
    body.pub_time=new Date().toISOString().slice(0, 19).replace('T', ' ')
    const id:any=await supabase.from('comment').select('*', { count: 'exact', head: true })
    body.id=27734+id.count
    console.log(body)
    const {data,error}= await supabase.from('comment').insert([body]).select()
    console.log(data,error)
    return new NextResponse(JSON.stringify({data,error}))
}