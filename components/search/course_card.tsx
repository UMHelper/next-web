import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import UseAnimations from "react-useanimations";
import arrowRightCircle from'react-useanimations/lib/arrowRightCircle'
import {useRouter} from "next/navigation";
const CourseCard=({data}:{data:CourseInfo})=>{
    const router=useRouter()
    const handlerClick=()=>{
        console.log(data.New_code,'click')
        router.push('/course/'+data.New_code)
    }
    return(
        <Card className='hover:cursor-pointer' onClick={handlerClick}>
            <CardHeader className='pb-2 flex-row flex justify-between align-middle'>
                <div>
                    <CardTitle className='text-base'>{data.New_code}</CardTitle>
                    <CardTitle className='text-base'>{data.courseTitleEng}</CardTitle>
                    <CardDescription>{data.courseTitleChi}</CardDescription>
                </div>
                {/*<div>*/}
                {/*    <UseAnimations animation={arrowRightCircle} loop={true}/>*/}
                {/*</div>*/}
            </CardHeader>
            {/*<CardContent>*/}
            {/*    <p>Card Content</p>*/}
            {/*</CardContent>*/}
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
    )
}

export default CourseCard