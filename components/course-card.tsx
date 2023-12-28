import {Card, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import Link from "next/link";
const CourseCard=({data}:{data:any})=>{
    return(
        <Link href={'/course/'+data.New_code}>
            <Card className='hover:cursor-pointer hover:shadow-lg mx-auto'>
                <CardHeader className='pb-2 flex-row flex justify-between align-middle'>
                    <div className=" space-y-1">
                        <CardTitle className='flex space-x-4'>

                                <div className="text-xl">
                                {data.New_code}
                                </div>
                                {
                                    parseInt(data.New_code[4])<=4 && (data.Is_Offered===1 ?
                                        <div className='text-white text-xs rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow'> Offered</div>
                                        :
                                        <div className='text-white text-xs rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>)
                                }
                            
                        </CardTitle>
                        <CardTitle className='text-base'>{data.courseTitleEng}</CardTitle>
                        <CardDescription>{data.courseTitleChi}</CardDescription>
                    </div>
                </CardHeader>
                <CardFooter className='bg-gray-50 pt-2 pb-3'>
                    <div className='flex flex-row text-sm space-x-2 mb-0'>
                        <div>
                            <div className='font-light text-gray-500 text-xs'>
                                Credits
                            </div>
                            <div>
                                {data.Credits}
                            </div>
                        </div>

                        {data.Offering_Department && (
                            <div>
                                <div className='font-light text-gray-500 text-xs'>
                                    Dept.
                                </div>
                                <div>
                                    {data.Offering_Department}
                                </div>
                            </div>
                        )}

                        <div>
                            <div className='font-light text-gray-500 text-xs'>
                                Faculty
                            </div>
                            <div>
                                {data.Offering_Unit}
                            </div>
                        </div>

                        <div>
                            <div className='font-light text-gray-500 text-xs'>
                                Language
                            </div>
                            <div>
                                {data.Medium_of_Instruction}
                            </div>
                        </div>
                    </div>
                </CardFooter>
            </Card>
        </Link>
    )
}

export default CourseCard