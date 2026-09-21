import React, { Suspense } from "react";

import CourseFilter from "@/components/course-filter";
import { CatalogGridSkeleton } from "@/components/loading-skeletons";
import { fetchCourseFuzzySearch } from "@/lib/database/get-fuzzy-search";

export function generateMetadata(
    {params}:{params:any}) {
    const title = `Searching for ${params.code.toUpperCase()} | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
        robots: { index: false, follow: true },
    }

}

async function CourseSearchResults({ code }: { code: string }) {
    const courseList:any[] = await fetchCourseFuzzySearch(code)
    return(
        <div>
            <CourseFilter data={courseList}/>
        </div>
    )
}

function CourseSearchPage({params}:{params:{code:string}}){
    const code = params.code.toUpperCase()

    return (
        <Suspense fallback={<CatalogGridSkeleton count={6} />}>
            <CourseSearchResults code={code} />
        </Suspense>
    )
}

export default CourseSearchPage
