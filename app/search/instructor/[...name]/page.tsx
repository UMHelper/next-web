import CourseCard from "@/components/course_card"
import { Masonry } from "@/components/masonry"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { fuzzySearch } from "@/lib/database/fuzzy-search"

export function generateMetadata(
    {params}:{params:any}) {
    const name=decodeURI(params.name.join('/')).toUpperCase()
    const title = `Searching for ${name} | What2Reg @ UM 澳大選咩課 @UM`

    return {
        title: title,
    }

}

const fetchData = async (code: string) => {
    const data: any = await fuzzySearch(code, 'instructor')
    return data
}

async function InstructorSearchPage({ params }: { params: { name: string[] } }) {
    const data = await fetchData(decodeURI(params.name.join('/')).toUpperCase())
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