import React, { Suspense } from "react";

import CourseFilter from "@/components/course-filter";
import { CatalogGridSkeleton } from "@/components/loading-skeletons";
import { createAdConfig } from "@/lib/ads/ad-config-server";
import { fetchCourseFuzzySearch } from "@/lib/database/get-fuzzy-search";

type CourseSearchPageProps = {
    params: Promise<{ code: string }>;
};

export async function generateMetadata(
    { params }: CourseSearchPageProps) {
    const { code } = await params
    const title = `Searching for ${code.toUpperCase()} | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
        robots: { index: false, follow: true },
    }

}

async function CourseSearchResults({ code }: { code: string }) {
    const courseList:any[] = await fetchCourseFuzzySearch(code)
    const ads = createAdConfig()
    return(
        <div>
            <CourseFilter
                data={courseList}
                ads={ads}
                listName="search_course"
                trackResults={{ term: code, scope: "course" }}
            />
        </div>
    )
}

async function CourseSearchPage({params}:CourseSearchPageProps){
    const { code: rawCode } = await params
    const code = rawCode.toUpperCase()

    return (
        <Suspense fallback={<CatalogGridSkeleton count={6} />}>
            <CourseSearchResults code={code} />
        </Suspense>
    )
}

export default CourseSearchPage
