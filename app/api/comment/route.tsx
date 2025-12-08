import {NextResponse} from "next/server";;
import { getReviewInfo } from "@/lib/database/get-prof-info";
import { getCourseInfo } from "@/lib/database/get-course-info";

import { getComentListByCourseIDAndPage, getCommentList, getVoteHistory } from "@/lib/database/get-comment-list";

import getScheduleList from "@/lib/database/get-schedule-list";

export async function POST(request: Request) {

    return new NextResponse("ok")
    let body = await request.formData()

    const code = body.get('code') as string
    const prof = body.get('prof') as string

    console.log(code, prof)

    const prof_info = await getReviewInfo(code, prof)

    const course_info = await getCourseInfo(code); 

    const comments: any[] = await getComentListByCourseIDAndPage(prof_info.id, 0);
    const comments_id_array = comments.map((comment) => comment.id)
    const vote_history: any[] = await getVoteHistory(comments_id_array)

    const timetable = await getScheduleList(code, prof)
    return new NextResponse(JSON.stringify({
        prof:prof_info,
        course:course_info,
        comments:comments,
        vote_history:vote_history,
        timetable:timetable
    }).replaceAll('\\n', ' ').replaceAll('\\r', ' ').replaceAll('  ', ' ').replaceAll('\\t', ' '))
}