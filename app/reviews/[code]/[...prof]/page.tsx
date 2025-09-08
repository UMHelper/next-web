import Toolbar from "@/components/toolbar";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CalendarRange, Cat, ChevronRightCircle, ClipboardEdit } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimetableCard } from "@/components/timetable-card";
import { getComentListByCourseIDAndPage, getCommentList, getVoteHistory } from "@/lib/database/get-comment-list";
import { getReviewInfo } from "@/lib/database/get-prof-info";
import Link from "next/link";
import { notFound } from 'next/navigation'

import { getCourseInfo } from "@/lib/database/get-course-info";
import getScheduleList from "@/lib/database/get-schedule-list";
import { Comments } from "@/components/comments";
import { BBSAd } from "@/components/bbs-updates";
import { Viewport } from "next";
import { ReviewPagination } from "@/components/review-pagination";
import { ReviewReload } from "@/components/review-reload";

import { SparklesText } from "@/components/magicui/sparkles-text";

import { ReviewNotice } from "@/components/review-notice";

export const revalidate = 0
export const dynamic = "force-dynamic";

export function generateMetadata(
    { params }: { params: any }) {
    let page_num = 1;
    let prof = params.prof.join('/').replaceAll('%2C', ",").toUpperCase();
    if (!Number.isNaN(parseInt(params.prof[params.prof.length - 1]))) {
        page_num = parseInt(params.prof.pop() as string);
        prof = params.prof.join('/').replaceAll('%2C', ",").toUpperCase();
    }
    const title = `${prof.replaceAll('%20', " ")} | ${params.code.toUpperCase()} | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
    }

}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

const ReviewPage = async ({ params }: { params: { code: string, prof: string[] } }) => {
    const code = params.code.toUpperCase();
    // check prof list last one is number:
    let page_num = 1;
    let prof = params.prof.join('/').replaceAll('%2C', ",").toUpperCase();
    if (!Number.isNaN(parseInt(params.prof[params.prof.length - 1]))) {
        page_num = parseInt(params.prof.pop() as string);
        prof = params.prof.join('/').replaceAll('%2C', ",").toUpperCase();
    }

    const prof_info = await getReviewInfo(code, decodeURI(prof.replaceAll('$', '/')));
    if (prof_info == undefined) {
        return (
            notFound()
        )
    }
    const is_offered = prof_info['is_offered'];

    const course_info = await getCourseInfo(code);
    // console.log(course_info);

    const comments: any[] = await getComentListByCourseIDAndPage(prof_info.id, page_num - 1);
    const comments_id_array = comments.map((comment) => comment.id)
    const vote_history: any[] = await getVoteHistory(comments_id_array)

    const timetable = await getScheduleList(params.code, params.prof.join('/'));

    return (
        <>
            <div className='bg-gradient-to-r from-blue-600 to-indigo-500 text-white p-6'>
                <div className='max-w-screen-xl mx-auto p-4'>
                    <div className='flex flex-col md:flex-row justify-between'>
                        <div className="py-3">
                            <div>
                                <Link href={"/search/course/" + course_info['New_code'].substring(0, 4)} className="flex space-x-1 items-center">
                                    <div className='text-sm'>{course_info['New_code'].substring(0, 4)}</div>
                                    <ChevronRightCircle size={14} strokeWidth={1.5} />
                                </Link>
                            </div>
                            <div className='font-bold text-xl'>
                                <Link href={"/course/" + course_info['New_code']} className="flex space-x-1 items-center">
                                    <h2>
                                        {course_info['New_code']}
                                    </h2>
                                    <ChevronRightCircle size={14} strokeWidth={1.5} />
                                </Link>
                            </div>
                            <div className='text-base'>{course_info["courseTitleEng"]}</div>
                            <div className='text-sm'>{course_info["courseTitleChi"]}</div>
                            <div className='pb-3 flex-row flex space-x-2 mt-4'>
                                <Link className="flex space-x-2" href={'/professor/' + prof_info.prof_id}>
                                    <div className='font-bold text-3xl break-all'>{prof_info['prof_id']}</div>
                                    {/* <ChevronRightCircle size={16} strokeWidth={1.5} /> */}
                                </Link>
                                {(
                                    Number(process.env.IS_PREENROLLMENT_OPEN)==0 ?
                                        (is_offered ?
                                            <SparklesText className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow font-normal' sparklesCount={3}> Offered</SparklesText>
                                            : null
                                            // <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>
                                        )
                                        :
                                        null
                                )}
                            </div>
                            <div className='flex-row flex space-x-2'>
                                <Link href={'/submit/' + params.code + '/' + params.prof}>
                                    <Button className='text-sm px-2 hover:shadow-lg bg-white text-blue-800 hover:bg-gray-200'>
                                        <ClipboardEdit size={16} /><span> Submit Review</span>
                                    </Button>
                                </Link>

                                {
                                    is_offered ?
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button className='text-sm px-2 hover:shadow-lg  bg-white text-blue-800 hover:bg-gray-200'>
                                                    <CalendarRange size={16} /> <span>Timetable</span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-80">
                                                <TimetableCard timetable={timetable} code={code} prof={prof} />
                                            </PopoverContent>
                                        </Popover>
                                        :
                                        <></>
                                }
                            </div>
                            {/* <Toolbar course={course_info} prof={undefined} /> */}
                        </div>
                        <Card className='md:w-80 py-4 pb-0 md:m-0 mt-8'>
                            <CardContent className="h-full py-4">
                                <div className='space-y-2 flex flex-col h-full justify-between'>
                                    <div className='space-y-2 text-sm'>
                                        <div>
                                            總體 Overall
                                        </div>
                                        <Progress value={prof_info['result'] * 20} className='h-2' />
                                    </div>
                                    <div className='space-y-2 text-sm'>
                                        <div>
                                            成績 Grade
                                        </div>
                                        <Progress value={prof_info['grade'] * 20} className='h-2' />
                                    </div>
                                    <div className='space-y-2 text-sm'>
                                        <div>
                                            難度 Difficulty
                                        </div>
                                        <Progress value={prof_info['hard'] * 20} className='h-2' />
                                    </div>
                                    <div className='space-y-2 text-sm'>
                                        <div>
                                            實用性 Usefulness
                                        </div>
                                        <Progress value={prof_info['reward'] * 20} className='h-2' />
                                    </div>
                                    <p className='text-xs italic text-gray-500'>Based on the reviews from users.</p>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
            <BBSAd />
            <div>
                <div className='max-w-screen-xl mx-auto p-4'>
                    {/* <ReviewPagination code={code} prof={prof} page_num={page_num} total_page={Math.ceil(prof_info.comments / 10)} /> */}
                    <Comments comments={comments} course_id={course_info.id} vote_history={vote_history} />
                    <ReviewPagination code={code} prof={prof} page_num={page_num} total_page={Math.ceil(prof_info.comments / 20)} />
                </div>
            </div>
            <ReviewReload/>
            <ReviewNotice admin_note={prof_info.admin_note} admin_note_en={prof_info.admin_note_en}/>
        </>
    )
}

export default ReviewPage