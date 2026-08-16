import {NextResponse} from "next/server";;
import supabaseAdmin from '@/lib/supabase/admin';
import { getReviewInfo } from "@/lib/database/get-prof-info";
import { getComentListByCourseIDAndPage } from "@/lib/database/get-comment-list";
import { getCourseInfo } from "@/lib/database/get-course-info";
import getScheduleList from "@/lib/database/get-schedule-list";

export const dynamic = "force-dynamic";

/**
 * GET /api/comment/[code]/[prof]?page=1
 *
 * 一次返回评价页所需全部数据（与 Web 端 /reviews/[code]/[...prof] 页同款数据源）：
 * - prof：prof_with_course 单行（聚合评分）
 * - course：course_noporf 单行
 * - comments：当前页评论 + 回复（含 vote_history），页大小 20
 * - timetable：当前学期上课时间表
 * - page / total_page：分页信息
 *
 * prof 编码规则与 Web 一致：空格用 %20，/ 用 $ 转义。
 * iOS 客户端（next-ios）使用。
 */
export async function GET(request: Request, { params }: { params: { code: string, prof: string } }) {
    const { searchParams } = new URL(request.url);
    const pageParam = parseInt(searchParams.get('page') ?? '1', 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const code = decodeURIComponent(params.code).toUpperCase();
    const prof = decodeURIComponent(params.prof)
        .replaceAll('%20', ' ')
        .replaceAll('$', '/')
        .toUpperCase();

    const prof_info = await getReviewInfo(code, prof);
    if (!prof_info) {
        return new NextResponse(JSON.stringify({ error: 'not found' }), { status: 404 });
    }

    const [course_info, comments, timetable] = await Promise.all([
        getCourseInfo(code),
        getComentListByCourseIDAndPage(prof_info.id, page - 1),
        getScheduleList(code, prof),
    ]);

    return NextResponse.json(
        {
            prof: prof_info,
            course: course_info,
            comments,
            timetable,
            page,
            total_page: Math.max(1, Math.ceil((prof_info.comments ?? 0) / 20)),
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
}

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
