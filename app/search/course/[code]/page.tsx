import {Masonry} from "@/components/masonry";
import CourseCard from "@/components/course_card";
import { fuzzySearch } from "@/lib/database/fuzzy-search";

const fetchData = async (code:string) => {
    const data:any=await fuzzySearch(code,'course')
    return data
}

async function CourseSearchPage({params}:{params:{code:string}}){
    const courseList:any[] = await fetchData(params.code)
    return(
        <div>
            <Masonry col={3} className="mx-auto">
                {courseList.map((course,index)=>{
                    return <CourseCard data={course} key={index}/>
                })}
            </Masonry>
        </div>
    )
}

export default CourseSearchPage