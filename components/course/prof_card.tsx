import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import React from "react";
import {Separator} from "@/components/ui/separator";
import {useRouter} from "next/navigation";

const ProfCard= ({data,code}:{data:any,code:any})=>{
    const get_bg=(n:number)=>{
        let result_bg="bg-gradient-to-r from-amber-500 to-orange-500"
        if (n>=6){
            result_bg='bg-gradient-to-r from-green-400 to-emerald-500'
        }
        if (n<=3){
            result_bg='bg-gradient-to-r from-rose-900 to-fuchsia-800'
        }
        return result_bg
    }

    const get_gpa=(n:number)=>{
        if (n>=8){
            return 'A'
        }
        if (n>=7.4){
            return 'A-'
        }
        if (n>=6.6){
            return 'B+'
        }
        if (n>=6){
            return 'B'
        }
        if (n>=5.4){
            return 'B-'
        }
        if (n>=4.6){
            return 'C+'
        }
        if (n>=4){
            return 'C'
        }
        if (n>=3.4){
            return 'C-'
        }
        if (n>=2.6){
            return 'D+'
        }
        if (n>=2){
            return 'D'
        }
        return 'F'
    }
    const route=useRouter()
    const onclick=()=>{
        route.push('/review/'+code+'/'+data.name)
    }

    return(
        <Card className='hover:cursor-pointer hover:shadow-lg' onClick={onclick}>
            <CardHeader className='pb-0.5'>
                <div className='flex flex-row justify-between'>
                    <div>
                        {data.name}
                    </div>
                    <div className='text-white flex flex-col'>
                        {
                            data.offer_info.is_offer?
                                <div className='text-xs font-semibold rounded-3xl bg-gradient-to-r from-indigo-600 to-purple-600 h-fit py-0.5 px-2 shadow'> Offered</div>
                                :
                                <div className='text-xs font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>
                        }
                    </div>
                </div>
            </CardHeader>
            {/*<Separator className='my-2'/>*/}
            <CardContent>
                <div className='text-sm font-semibold'>
                    <div className='text-gray-400 text-xs'>Overall</div>
                    <div className={cn(get_bg(data.result),'bg-clip-text text-transparent')}>
                        {get_gpa(data.result)}
                    </div>
                </div>
                <Separator className='my-1'/>
                <div className='flex flex-row text-xs font-semibold space-x-2'>
                    <div>
                        <div className='text-gray-400'>
                            Grade
                        </div>
                        <div className={cn(get_bg(data.grade),'bg-clip-text text-transparent')}>
                            {get_gpa(data.grade)}
                        </div>
                    </div>

                    <div>
                        <div className='text-gray-400'>
                            Easy
                        </div>
                        <div className={cn(get_bg(data.hard),'bg-clip-text text-transparent')}>
                            {get_gpa(data.hard)}
                        </div>
                    </div>

                    <div>
                        <div className='text-gray-400'>
                            Outcome
                        </div>
                        <div className={cn(get_bg(data.reward),'bg-clip-text text-transparent')}>
                            {get_gpa(data.reward)}
                        </div>
                    </div>

                    <div>
                        <div className='text-gray-400'>
                            Comments
                        </div>
                        <div className='text-black'>
                            {data.num}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>

    )
}
export default ProfCard

