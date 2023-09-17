'use client'

import {useEffect, useState} from "react";

function CoursePage({params}:{params:{code:string}}){
    const code=params.code.toUpperCase()

    const [isCourseLoading, setIsCourseLoading]=useState(true)
    const [course, setCourse]=useState({})

    const [profList, setProfList]=useState([])
    const [isProfLoading, setIsProfLoading]=useState(true)

    useEffect(()=>{
        fetch('/api/course/?code=' + params.code )
            .then(r =>r.json())
            .then((data)=>{
                setCourse(data['course_info'])
                setIsCourseLoading(false)
                setProfList(data['prof_info'])
                setIsProfLoading(false)
            })
    })
    return(
        <>
            <div className='flex justify-center'>
                <div className='w-1/2'>
                    <div className='text-4xl font-bold'>{code}</div>
                    <div className='text-2xl font-bold'>{course['courseTitleEng']}</div>
                    <div className='text-xl font-bold'>{course['Credits']}</div>
                    <div className='text-xl font-bold'>{course['Offering_Department']}</div>
                </div>
            </div>

        </>
    )
}

export default CoursePage
