import CourseFilter from "@/components/course-filter";
import { fetchCourseFuzzySearch } from "@/lib/database/get-fuzzy-search";
import { Viewport } from "next";

export function generateMetadata(
    {params}:{params:any}) {
    const title = `Searching for ${params.code.toUpperCase()} | What2Reg @ UM 澳大選咩課`

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

async function CourseSearchPage({params}:{params:{code:string}}){
    const courseList:any[] = await fetchCourseFuzzySearch(params.code.toUpperCase())
    return(
        <div>
            <CourseFilter data={courseList}/>
        </div>
    )
}

export default CourseSearchPage