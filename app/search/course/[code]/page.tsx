import CourseFilter from "@/components/course-filter";
import { fetchCourseFuzzySearch } from "@/lib/database/get-fuzzy-search";
import { Viewport } from "next";

export async function generateMetadata(props:{params:any}) {
    const params = await props.params
    const code = params?.code ? String(params.code).toUpperCase() : 'Search'

    return {
        title: `Searching for ${code} | What2Reg @ UM 澳大選咩課`,
    }

}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

async function CourseSearchPage(props:{params:any}){
    const params = await props.params
    const code = params?.code ? String(params.code).toUpperCase() : ''
    const courseList:any[] = await fetchCourseFuzzySearch(code)
    return(
        <div>
            <CourseFilter data={courseList}/>
        </div>
    )
}

export default CourseSearchPage