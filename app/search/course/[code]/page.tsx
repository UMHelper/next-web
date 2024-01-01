import CourseFilter from "@/components/course-filter";
import { fetchCourseFuzzySearch } from "@/lib/database/get-fuzzy-search";

export function generateMetadata(
    {params}:{params:any}) {
    const title = `Searching for ${params.code.toUpperCase()} | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
        viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
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