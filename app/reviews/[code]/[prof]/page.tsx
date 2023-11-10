import Toolbar from "@/components/toolbar";
import {Card, CardContent} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {Button} from "@/components/ui/button";
import {CalendarRange, ChevronRightCircle, ClipboardEdit} from "lucide-react";
import { Masonry } from "@/components/masonry";
import { CommentCard } from "@/components/comment_card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TimetableCard } from "@/components/timetable-card";
import { getCommentList } from "@/lib/database/comment-list";
import { getProfInfo } from "@/lib/database/prof_info";
import { fuzzySearch } from "@/lib/database/fuzzy-search";
import Link from "next/link";

import {COMMENT} from "@/consant";

async function fetchData(code:string,prof:string) {
    const timetable=COMMENT['prof_info']['offer_info']['schedules'];
    const comment= await getCommentList(code,prof.replaceAll('$','/'));
    const prof_info=await getProfInfo(code,prof.replaceAll('$','/'));
    const is_offered=prof_info['is_offered'];
    const course_info=(await fuzzySearch(code,'course'))[0];

    return {
        timetable,
        comment,
        prof_info,
        is_offered,
        course_info
    }
}

const ReviewPage=async ({params}:{params:{code:string,prof:string}})=>{
    const {
        timetable,
        comment,
        prof_info,
        is_offered,
        course_info
    }=await fetchData(params.code,params.prof.replaceAll('$','/'));
    return(
        <>
            <div className='bg-gradient-to-r from-purple-400 to-rose-500 text-white p-4'>
                <div className='max-w-screen-xl mx-auto p-4'>
                
                        <div className='flex flex-col md:flex-row justify-between'>
                            <div>
                                <div className='text-sm'>{course_info['New_code']}</div>
                                <div className='text-sm'>{course_info["courseTitleEng"]}</div>
                                <div className='md:pb-2 flex-row flex space-x-2 mt-4'>
                                    <Link className="flex space-x-2" href={'/search/instructor/'+prof_info.prof_id}>
                                    <div className='font-bold text-3xl'>{prof_info['prof_id']}</div>
                                    <ChevronRightCircle size={16} strokeWidth={1.5} />
                                    </Link>
                                    {(
                                        is_offered?
                                            <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 h-fit py-0.5 px-2 shadow'> Offered</div>
                                            :
                                            <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>
                                    )}
                                </div>
                                <div className='flex-row flex space-x-2'>
                                    <Link href={'/submit/'+params.code+'/'+params.prof}>
                                        <Button className='text-sm px-2 hover:shadow-lg bg-white text-blue-800 hover:bg-gray-200'>
                                            <ClipboardEdit size={16}/> Submit Review
                                        </Button>
                                    </Link>
                                    
                                    {
                                        is_offered?
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button className='text-sm px-2 hover:shadow-lg  bg-white text-blue-800 hover:bg-gray-200' disabled>
                                                    <CalendarRange size={16}/> Timetable (Developing)
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-80">
                                                <TimetableCard timetable={timetable}/>
                                            </PopoverContent>
                                            </Popover>
                                        :
                                        <></>
                                    }
                                </div>
                                <Toolbar course={course_info} prof={undefined}/>
                            </div>
                            <Card className='md:w-80 py-4 pb-0 md:m-0 mt-8'>
                                <CardContent >
                                    <div className='space-y-4'>
                                        <div className='space-y-1 text-sm'>
                                            <div>
                                                總體 Overall
                                            </div>
                                            <Progress value={prof_info['result']*20} className='h-1 ' />
                                        </div>
                                        <div className='space-y-1 text-sm'>
                                            <div>
                                                成績 Grade
                                            </div>
                                            <Progress value={prof_info['grade']*20} className='h-1 ' />
                                        </div>
                                        <div className='space-y-1 text-sm'>
                                            <div>
                                                難度 Difficulty
                                            </div>
                                            <Progress value={prof_info['hard']*20} className='h-1 ' />
                                        </div>
                                        <div className='space-y-1 text-sm'>
                                            <div>
                                                收穫 Outcome
                                            </div>
                                            <Progress value={prof_info['reward']*20} className='h-1 ' />
                                        </div>
                                        <p className='text-xs italic text-gray-500'>Based on the reviews from users.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                

                </div>
            </div>

            <div>
                
                        <div className='max-w-screen-xl mx-auto p-4'>
                            <Masonry col={3} className="">
                                {comment.map((comment:any,index:number)=>{
                                    return (
                                        <div key={index}>
                                            <CommentCard comment={comment} prof={prof_info} course={course_info}/>
                                        </div>
                                    )
                                })}
                            </Masonry>
                        </div>

            </div>
        </>
    )
}

export default ReviewPage