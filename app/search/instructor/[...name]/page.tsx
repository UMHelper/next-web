import CourseCard from "@/components/course-card"
import { Masonry } from "@/components/masonry"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { fetchInstructorFuzzySearch } from "@/lib/database/get-fuzzy-search"
import { Viewport } from "next"

export function generateMetadata(
    {params}:{params:any}) {
    const name=decodeURI(params.name.join('/')).toUpperCase()
    const title = `Searching for ${name} | What2Reg @ UM 澳大選咩課`

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


async function InstructorSearchPage({ params }: { params: { name: string[] } }) {
    const data = await fetchInstructorFuzzySearch(decodeURI(params.name.join('/')).toUpperCase())
    if (data.length === 0) {
        return (
            <div className="mt-20">
                <div className="text-xl font-semibold">No result found :(</div>
            </div>
        )
    }    
    return (
        <Accordion type="single" collapsible className="w-full">
            {
                data.map(({ prof_name, course_list }: { prof_name: any, course_list: any }, index: any) => {
                    return (
                        <AccordionItem value={prof_name + index} key={prof_name + index}>
                            <AccordionTrigger className="breal-all">{prof_name}</AccordionTrigger>
                            <AccordionContent asChild>
                                <Masonry col={3} className="mx-auto">
                                    {course_list.map((course: any, index: any) => {
                                        return <CourseCard data={course} key={index} />
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

export default InstructorSearchPage