import React, { Suspense } from "react";

import CourseCard from "@/components/course-card"
import { TrackSearchResults } from "@/components/analytics/track-search-results"
import { CourseGridSkeleton } from "@/components/loading-skeletons"
import { Masonry } from "@/components/masonry"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { createAdConfig } from "@/lib/ads/ad-config-server"
import { withAdSlots } from "@/lib/ads/ad-slots"
import { fetchInstructorFuzzySearch } from "@/lib/database/get-fuzzy-search"

type InstructorSearchPageProps = {
    params: Promise<{ name: string[] }>;
};

export async function generateMetadata(
    { params }: InstructorSearchPageProps) {
    const { name } = await params
    const instructorName = decodeURI(name.join('/')).toUpperCase()
    const title = `Searching for ${instructorName} | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
        robots: { index: false, follow: true },
    }

}

async function InstructorSearchResults({ name }: { name: string }) {
    const data = await fetchInstructorFuzzySearch(name)
    const trackResults = (
        <TrackSearchResults term={name} scope="instructor" resultCount={data.length} />
    )

    if (data.length === 0) {
        return (
            <div className="mt-20">
                {trackResults}
                <div className="text-xl font-semibold">No result found :(</div>
            </div>
        )
    }

    const ads = createAdConfig()

    return (
        <>
            {trackResults}
            <Accordion type="single" collapsible className="w-full">
                {
                    data.map(({ prof_name, course_list }: { prof_name: any, course_list: any }, index: any) => {
                        return (
                            <AccordionItem value={prof_name + index} key={prof_name + index}>
                                <AccordionTrigger className="breal-all">{prof_name}</AccordionTrigger>
                                <AccordionContent asChild>
                                    <Masonry col={3} className="mx-auto">
                                        {withAdSlots(course_list, {
                                            getKey: (course: any, index: number) =>
                                                String(course.courseCode ?? course.New_code ?? index),
                                            renderItem: (course: any, index: number) => (
                                                <CourseCard data={course} key={index} listName="search_instructor" position={index} />
                                            ),
                                            ads,
                                        })}
                                    </Masonry>
                                </AccordionContent>
                            </AccordionItem>

                        )
                    })
                }
            </Accordion>
        </>
    )
}

async function InstructorSearchPage({ params }: InstructorSearchPageProps) {
    const { name } = await params
    const instructorName = decodeURI(name.join('/')).toUpperCase()

    return (
        <Suspense fallback={<CourseGridSkeleton count={6} />}>
            <InstructorSearchResults name={instructorName} />
        </Suspense>
    )
}

export default InstructorSearchPage
