'use client'

import React, {useEffect, useState} from "react";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {ArrowUpRightSquare} from "lucide-react";
import UseAnimations from "react-useanimations";
import infinity from "react-useanimations/lib/infinity"
import activity from "react-useanimations/lib/activity"
import ProfCard from "@/components/course/prof_card";
import Toolbar from "@/components/toolbar";

function CoursePage({params}:{params:{code:string}}){
    const code=params.code.toUpperCase()

    const [isCourseLoading, setIsCourseLoading]=useState(true)
    const [course, setCourse]=useState({} as any)


    const [profList, setProfList]=useState<Array<any>>([])
    const [isProfLoading, setIsProfLoading]=useState(true)

    const [isOffer, setIsOffer]=useState(false)


    useEffect(()=>{
        fetch('/api/course/?code=' + params.code.toUpperCase() )
            .then(r =>r.json())
            .then((data)=>{
                // setCourse(data['course_info'])
                // setIsCourseLoading(false)
                setProfList(data['prof_info'])
                setIsProfLoading(false)
                for (const prof of data['prof_info']){
                    if (prof['offer_info']['is_offer']){
                        setIsOffer(true)
                        break
                    }
                }
            })

    },[params])

    useEffect(()=>{
        fetch('https://api.data.um.edu.mo/service/academic/course_catalog/v1.0.0/all?course_code='+params.code.toUpperCase(),{
            headers: {
                Authorization: 'Bearer bfa9b6c0-3f4f-3b1f-92c4-1bdd885a1ca2',
            }
        })
            .then(r=>r.json())
            .then((data)=>{
                if (data['_embedded'].length===1){
                    setCourse(data['_embedded'][0])
                    setIsCourseLoading(false)
                }
            })
    },[params])

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
                                <div className='md:pb-2 flex-row flex space-x-1'>
                                    <div className='text-3xl font-bold'>{course['courseCode']}</div>
                                    {isProfLoading?"":(
                                        isOffer?
                                            <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 h-fit py-0.5 px-2 shadow'> Offered</div>
                                            :
                                            <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>
                                    )}
                                </div>
                                <div className='text-xl font-semibold'>{course["courseTitle"]}</div>
                                <div className='text-sm'>{course['offeringProgLevel']+' Course, Year '+course['suggestedYearOfStudy']}</div>
                                <Toolbar course={course}/>
                            </div>
                            <div className='space-y-4'>
                                <div className='space-y-1'>
                                    <div className='flex-row flex space-x-4'>
                                        <div>
                                            <div className='text-xs font-light'>Credits</div>
                                            <div className='text-sm'>{course['credits']}</div>
                                        </div>
                                        <div>
                                            <div className='text-xs font-light'>Dept</div>
                                            <div className='text-sm'>{course['offeringDept']}</div>
                                        </div>
                                        <div>
                                            <div className='text-xs font-light'>Faculty</div>
                                            <div className='text-sm'>{course['offeringUnit']}</div>
                                        </div>
                                        <div>
                                            <div className='text-xs font-light'>Language</div>
                                            <div className='text-sm'>{course['mediumOfInstruction']}</div>
                                        </div>
                                    </div>
                                    <div className='flex-row flex space-x-4'>
                                        <div>
                                            <div className='text-xs font-light'>Grading</div>
                                            <div className='text-sm'>{course['gradingSystem']}</div>
                                        </div>

                                        <div>
                                            <div className='text-xs font-light'>Course Type</div>
                                            <div className='text-sm'>{course['courseType']}</div>
                                        </div>
                                        <div>
                                            <div className='text-xs font-light'>Duration</div>
                                            <div className='text-sm'>{course['duration']}</div>
                                        </div>
                                    </div>

                                </div>

                                <div className='hover:cursor-pointer'>
                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <div className='flex flex-row space-x-1'>
                                                <div className='text-sm'>
                                                    Course Description
                                                </div>
                                                <ArrowUpRightSquare size={12}/>
                                            </div>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader>
                                                <DialogTitle>Course Description</DialogTitle>
                                            </DialogHeader>
                                            <div className="py-4 text-sm">
                                                {course['courseDescription']}
                                            </div>
                                            <DialogFooter>
                                                <div className='text-xs italic mt-3'>Data Source: reg.um.edu.mo</div>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>

                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <div className='flex flex-row space-x-1'>
                                                <div className='text-sm'>
                                                    Intended Learning Outcomes
                                                </div>
                                                <ArrowUpRightSquare size={12}/>
                                            </div>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader>
                                                <DialogTitle>Course Description</DialogTitle>
                                            </DialogHeader>
                                            <div className="py-4 text-sm">
                                                {course['ilo']}
                                            </div>
                                            <DialogFooter>
                                                <div className='text-xs italic mt-3'>Data Source: reg.um.edu.mo</div>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <div className='text-xs italic'>Data Source: reg.um.edu.mo</div>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {isProfLoading? (
                <div className='flex justify-center mt-8'>
                    <div className='rounded-full'>
                        <UseAnimations animation={activity} size={48}/>
                    </div>
                </div>
                ):(
                <div className='max-w-screen-xl mx-auto p-4'>
                    <div className='columns-1 md:columns-3 md:gap-3 space-y-4'>
                        {profList.map((data,index)=>{
                            return (
                                <ProfCard key={index} data={data}/>
                            )
                        })}
                    </div>
                </div>
            )}

        </>
    )
}

export default CoursePage
