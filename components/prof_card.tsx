import {Card, CardContent, CardHeader} from "@/components/ui/card";
import {cn, get_bg, get_gpa} from "@/lib/utils";
import {Separator} from "@/components/ui/separator";
import Link from "next/link";
import { getCommentNumber } from "@/lib/database/get-comment-list";

const ProfCard= async ({data,code}:{data:any,code:any})=>{

    return(
        <Link href={'/reviews/'+code+'/'+data.prof_id}>
            <Card className='hover:cursor-pointer hover:shadow-lg'>
                <CardHeader className='pb-0.5'>
                    <div className='flex flex-row justify-between'>
                        <div className="break-word">
                            {data.prof_id}
                        </div>
                        <div className='text-white flex flex-col'>
                            {
                                parseInt(code[4])<=4 && (data.is_offered?
                                    <div className='text-xs font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow'> Offered</div>
                                    :
                                    <div className='text-xs font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>)
                            }
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className='text-sm font-semibold'>
                        <div className='text-gray-400 text-xs'>Overall</div>
                        <div className={cn(get_bg(data.result),'bg-clip-text text-transparent')}>
                            {get_gpa(data.result)}
                        </div>
                    </div>
                    <Separator className='my-1'/>
                    <div className='flex flex-row text-xs font-semibold space-x-2'>
                        <div>
                            <div className='text-gray-400'>
                                Grade
                            </div>
                            <div className={cn(get_bg(data.grade),'bg-clip-text text-transparent')}>
                                {get_gpa(data.grade)}
                            </div>
                        </div>

                        <div>
                            <div className='text-gray-400'>
                                Easy
                            </div>
                            <div className={cn(get_bg(data.hard),'bg-clip-text text-transparent')}>
                                {get_gpa(data.hard)}
                            </div>
                        </div>

                        <div>
                            <div className='text-gray-400'>
                                Outcome
                            </div>
                            <div className={cn(get_bg(data.reward),'bg-clip-text text-transparent')}>
                                {get_gpa(data.reward)}
                            </div>
                        </div>

                        <div>
                            <div className='text-gray-400'>
                                Comments
                            </div>
                            <div className='text-black'>
                                {await getCommentNumber(code,data.prof_id)}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>    

    )
}

export const ProfCourseCard= async ({data,code}:{data:any,code:any})=>{
    return(
        <Link href={'/reviews/'+code+'/'+data.prof_id}>
            <Card className='hover:cursor-pointer hover:shadow-lg'>
                <CardHeader className='pb-0.5'>
                    <div className='flex flex-row justify-between'>
                        <div className="break-word">
                            {data.course_id}
                        </div>
                        <div className='text-white flex flex-col'>
                            {
                                parseInt(code[4])<=4 && (data.is_offered?
                                    <div className='text-xs font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow'> Offered</div>
                                    :
                                    <div className='text-xs font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>)
                            }
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className='text-sm font-semibold'>
                        <div className='text-gray-400 text-xs'>Overall</div>
                        <div className={cn(get_bg(data.result),'bg-clip-text text-transparent')}>
                            {get_gpa(data.result)}
                        </div>
                    </div>
                    <Separator className='my-1'/>
                    <div className='flex flex-row text-xs font-semibold space-x-2'>
                        <div>
                            <div className='text-gray-400'>
                                Grade
                            </div>
                            <div className={cn(get_bg(data.grade),'bg-clip-text text-transparent')}>
                                {get_gpa(data.grade)}
                            </div>
                        </div>

                        <div>
                            <div className='text-gray-400'>
                                Easy
                            </div>
                            <div className={cn(get_bg(data.hard),'bg-clip-text text-transparent')}>
                                {get_gpa(data.hard)}
                            </div>
                        </div>

                        <div>
                            <div className='text-gray-400'>
                                Outcome
                            </div>
                            <div className={cn(get_bg(data.reward),'bg-clip-text text-transparent')}>
                                {get_gpa(data.reward)}
                            </div>
                        </div>

                        <div>
                            <div className='text-gray-400'>
                                Comments
                            </div>
                            <div className='text-black'>
                                {await getCommentNumber(code,data.prof_id)}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>    

    )
}

export default ProfCard

