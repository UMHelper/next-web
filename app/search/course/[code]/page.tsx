import CourseFilter from "@/components/course_filter";
import { fetchCourseFuzzySearch } from "@/lib/database/get-fuzzy-search";

export function generateMetadata(
    {params}:{params:any}) {
    const title = `Searching for ${params.code.toUpperCase()} | What2Reg @ UM 澳大選咩課 @UM`

    return {
        title: title,
    }

}

async function CourseSearchPage({params}:{params:{code:string}}){
    const courseList:any[] = await fetchCourseFuzzySearch(params.code.toUpperCase())
    return(
        <div>
            <CourseFilter data={courseList}/>
        </div>
    )
}

export default CourseSearchPage