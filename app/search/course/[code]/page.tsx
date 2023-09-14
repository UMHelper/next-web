'use client'
import {useEffect, useState} from "react";
import {Masonry, MasonryCol} from "@/components/masonry";

function CourseSearchPage({params}:{params:{code:string}}){
    const [isLoading, setIsLoading]=useState(true)

    const [courseList, setCourseList]=useState([])

    useEffect(()=>{
        fetch('/api/fuzzy_search/?text=' + params.code + '&type=course')
            .then(r =>r.json())
            .then((data)=>{
                setCourseList(data['course_info'])
                setIsLoading(false)
            })
    })

    return(
        <div>
            {isLoading?(
                <div>
                    Loading
                </div>
            ):(
                <div>
                    Result
                    <Masonry col={3} className='w-20 break-words bg-blue-500'>
                        <div>
                            1.hhhhhhhhhhhhhhhhhhhh
                        </div>
                        <div>2.hh</div>
                        <div>3.hh</div>
                        <div>4.hh</div>
                        <div>5.hh</div>
                        <div>6.hh</div>
                        <div>7.hh</div>
                        <div>8.hh</div>
                        <div>9.hh</div>
                        <div>10.hh</div>
                    </Masonry>
                </div>
            )}
        </div>
    )
}

export default CourseSearchPage