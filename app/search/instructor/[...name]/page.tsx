import React, { Suspense } from "react";

import CourseCard from "@/components/course-card"
import { CourseGridSkeleton } from "@/components/loading-skeletons"
import { Masonry } from "@/components/masonry"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { createAdConfig } from "@/lib/ads/ad-config-server"
import { withAdSlots } from "@/lib/ads/ad-slots"
import { fetchInstructorFuzzySearch } from "@/lib/database/get-fuzzy-search"

export function generateMetadata(
    {params}:{params:any}) {
    const name=decodeURI(params.name.join('/')).toUpperCase()
    const title = `Searching for ${name} | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
        robots: { index: false, follow: true },
    }

}

async function InstructorSearchResults({ name }: { name: string }) {
    const data = await fetchInstructorFuzzySearch(name)
    if (data.length === 0) {
        return (
            <div className="mt-20">
                <div className="text-xl font-semibold">No result found :(</div>
            </div>
        )
    }

    const ads = createAdConfig()

    return (
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
                                            <CourseCard data={course} key={index} />
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
    )
}

function InstructorSearchPage({ params }: { params: { name: string[] } }) {
    const name = decodeURI(params.name.join('/')).toUpperCase()

    return (
        <Suspense fallback={<CourseGridSkeleton count={6} />}>
            <InstructorSearchResults name={name} />
        </Suspense>
    )
}

export default InstructorSearchPage
