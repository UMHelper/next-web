import {Card, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import { TrackedItemLink } from "@/components/analytics/tracked-link";
import type { ItemListName } from "@/lib/analytics/events";


const CourseCard=({data, listName, position}:{data:any; listName: ItemListName; position: number})=>{
    return(
        <TrackedItemLink
            href={'/course/'+data.New_code}
            itemId={String(data.New_code ?? data.courseCode)}
            listName={listName}
            position={position}
            faculty={data.Offering_Unit ? String(data.Offering_Unit) : undefined}
        >
            <Card className='hover:cursor-pointer hover:shadow-lg mx-auto'>
                <CardHeader className='pb-2 flex-row flex justify-between align-middle'>
                    <div className=" space-y-1">
                        <CardTitle className='flex space-x-4'>

                                <div className="text-xl">
                                {data.New_code}
                                </div>
                                {
                                    parseInt(data.New_code[4])<=4 && (data.Is_Offered===1 ?
                                        <span className='text-success-foreground text-xs rounded-3xl bg-gradient-to-r from-success to-success h-fit py-0.5 px-2 shadow font-normal'> Offered</span>
                                        : null)
                                        // <div className='text-white text-xs rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>)
                                }
                            
                        </CardTitle>
                        <CardTitle className='text-base'>{data.courseTitleEng}</CardTitle>
                        <CardDescription>{data.courseTitleChi}</CardDescription>
                    </div>
                </CardHeader>
                <CardFooter className='bg-surface-subtle pt-2 pb-3'>
                    <div className='flex flex-row text-sm space-x-2 mb-0'>
                        <div>
                            <div className='font-light text-muted-foreground text-xs'>
                                Credits
                            </div>
                            <div>
                                {data.Credits}
                            </div>
                        </div>

                        {data.Offering_Department && (
                            <div>
                                <div className='font-light text-muted-foreground text-xs'>
                                    Dept.
                                </div>
                                <div>
                                    {data.Offering_Department}
                                </div>
                            </div>
                        )}

                        <div>
                            <div className='font-light text-muted-foreground text-xs'>
                                Faculty
                            </div>
                            <div>
                                {data.Offering_Unit}
                            </div>
                        </div>

                        <div>
                            <div className='font-light text-muted-foreground text-xs'>
                                Language
                            </div>
                            <div>
                                {data.Medium_of_Instruction}
                            </div>
                        </div>
                    </div>
                </CardFooter>
            </Card>
        </TrackedItemLink>
    )
}

export default CourseCard
