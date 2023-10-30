'use client'
import React, {useEffect, useState} from "react";
import UseAnimations from "react-useanimations";
import infinity from "react-useanimations/lib/infinity";
import loading2 from "react-useanimations/lib/loading2";
import Toolbar from "@/components/toolbar";
import {Card, CardContent} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {Button} from "@/components/ui/button";
import {CalendarRange, ClipboardEdit} from "lucide-react";
import { Masonry } from "@/components/masonry";
import { CommentCard } from "@/components/comment_card";
import { useRouter } from "next/navigation";

const ReviewPage=({params}:{params:{code:string,prof:string}})=>{
    const [course,setCourse]=useState({} as any)
    const [isCourseLoading,setIsCourseLoading]=useState(true)
    const [prof,setProf]=useState({} as any)
    const [isProfLoading,setIsProfLoading]=useState(true)
    const [comments, setComments]=useState([] as any)
    const [isCommentLoading,setIsCommentLoading]=useState(true)
    const [timetable,setTimetable]=useState({} as any)
    const [isOffer,setIsOffer]=useState(false)
    const [isOfferLoading,setIsOfferLoading]=useState(true)

    const [result,setResult]=useState(0)
    const [grade,setGrade]=useState(0)
    const [hard,setHard]=useState(0)
    const [reward,setReward]=useState(0)

    const route=useRouter()

    useEffect(()=>{
        fetch('/api/comment/?code='+params.code+'&prof='+params.prof)
            .then(r=>r.json())
            .then((data)=>{
                setCourse(data['course_info'])
                setIsCourseLoading(false)

                setProf(data['prof_info'])
                setIsProfLoading(false)

                setComments(data['comments'])
                setIsCommentLoading(false)

                setIsOffer(data['prof_info']['offer_info']['is_offer'])
                setIsOfferLoading(false)
            })
    },[])

    useEffect(() => {
        const interval=800
        let resultTimer:any=undefined
        let gradeTimer:any=undefined
        let hardTimer:any=undefined
        let rewardTimer:any=undefined
        if (!isProfLoading){
            resultTimer=setTimeout(()=>{setResult(prof['result']*20)},interval)
            gradeTimer=setTimeout(()=>{setGrade(prof['grade']*20)},interval)
            hardTimer=setTimeout(()=>{setHard(prof['hard']*20)},interval)
            rewardTimer=setTimeout(()=>{setReward(prof['reward']*20)},interval)
        }

        return ()=>{
            clearTimeout(resultTimer)
            clearTimeout(gradeTimer)
            clearTimeout(hardTimer)
            clearTimeout(rewardTimer)
        }
    }, [isProfLoading]);

    return(
        <>
            <div className='bg-gradient-to-r from-purple-400 to-rose-500 text-white p-4'>
                <div className='max-w-screen-xl mx-auto p-4'>
                    {isCourseLoading?(
                        <div className='flex justify-center'>
                            <div className='bg-gradient-to-r from-gray-100 to-gray-100 p-4 rounded-full'>
                                <UseAnimations animation={infinity} size={48}/>
                            </div>
                        </div>
                    ):(
                        <div className='flex flex-col md:flex-row justify-between'>
                            <div>
                                <div className='text-sm'>{course['New_code']}</div>
                                <div className='text-sm'>{course["courseTitleEng"]}</div>
                                <div className='md:pb-2 flex-row flex space-x-1 mt-4'>
                                    <div className='font-bold text-3xl'>{prof['name']}</div>
                                    {isOfferLoading?"":(
                                        isOffer?
                                            <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 h-fit py-0.5 px-2 shadow'> Offered</div>
                                            :
                                            <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>
                                    )}
                                </div>
                                <div className='flex-row flex space-x-2'>
                                    <Button className='text-sm px-2 hover:shadow-lg bg-white text-blue-800 hover:bg-gray-200' onClick={()=>{
                                        route.push('/submit/'+params.code+'/'+params.prof)
                                    }}>
                                        <ClipboardEdit size={16}/> Submit Review
                                    </Button>

                                    <Button className='text-sm px-2 hover:shadow-lg  bg-white text-blue-800 hover:bg-gray-200'>
                                        <CalendarRange size={16}/> Timetable
                                    </Button>
                                </div>
                                <Toolbar course={course} prof={undefined}/>
                            </div>
                            <Card className='md:w-80 py-4 pb-0 md:m-0 mt-8'>
                                <CardContent >
                                    <div className='space-y-4'>
                                        <div className='space-y-1 text-sm'>
                                            <div>
                                                總體 Overall
                                            </div>
                                            <Progress value={result} className='h-1 ' />
                                        </div>
                                        <div className='space-y-1 text-sm'>
                                            <div>
                                                成績 Grade
                                            </div>
                                            <Progress value={grade} className='h-1 ' />
                                        </div>
                                        <div className='space-y-1 text-sm'>
                                            <div>
                                                輕鬆 Easy
                                            </div>
                                            <Progress value={hard} className='h-1 ' />
                                        </div>
                                        <div className='space-y-1 text-sm'>
                                            <div>
                                                收穫 Outcome
                                            </div>
                                            <Progress value={reward} className='h-1 ' />
                                        </div>
                                        <p className='text-xs italic text-gray-500'>Based on the reviews from users.</p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                </div>
            </div>

            <div>
                {
                    isCommentLoading?(
                        <div className='flex justify-center mt-4'>
                            <div className='bg-gradient-to-r from-violet-300 to-fuchsia-300 p-4 rounded-full'>
                                <UseAnimations animation={loading2} size={48} fillColor="#fff"/>
                            </div>
                        </div>
                    ):(
                        <div className='max-w-screen-xl mx-auto p-4'>
                            <Masonry col={3} className="">
                                {comments.map((comment:any,index:number)=>{
                                    return (
                                        <div key={index}>
                                            <CommentCard comment={comment} prof={prof} course={course}/>
                                        </div>
                                    )
                                })}
                            </Masonry>
                        </div>
                    )

                }
            </div>
        </>
    )
}

export default ReviewPage