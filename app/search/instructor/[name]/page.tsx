import CourseCard from "@/components/course_card"
import { Masonry } from "@/components/masonry"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { fuzzySearch } from "@/lib/database/fuzzy-search"

const fetchData = async (code: string) => {
    const data: any = await fuzzySearch(code, 'instructor')
    return data
}

async function InstructorSearchPage({ params }: { params: { name: string } }) {
    const data = await fetchData(params.name)
    return (
        <Accordion type="multiple" className="w-full">
            {
                data.map(({ prof_name, course_list }: { prof_name: any, course_list: any }, index: any) => {
                    return (
                        <AccordionItem value={prof_name + index} key={prof_name + index}>
                            <AccordionTrigger>{prof_name}</AccordionTrigger>
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