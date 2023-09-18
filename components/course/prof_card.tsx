import {Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle} from "@/components/ui/card";
import {cn} from "@/lib/utils";
import React from "react";
import {Separator} from "@/components/ui/separator";

const ProfCard= ({data}:{data:any})=>{
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

    return(
        <Card className='hover:cursor-pointer hover:shadow-lg'>
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
            <Separator className='my-2'/>
            <CardContent>
                <div className='text-sm font-semibold'>
                    <div className='text-gray-400'>Overall</div>
                    <div className={cn(get_bg(data.result),'bg-clip-text text-transparent')}>
                        {data.result.toFixed(2)}
                    </div>
                </div>
                <Separator className='my-1'/>
                <div className='flex flex-row text-xs font-semibold space-x-2'>
                    <div>
                        <div className='text-gray-400'>
                            Grade
                        </div>
                        <div className={cn(get_bg(data.grade),'bg-clip-text text-transparent')}>
                            {data.grade.toFixed(2)}
                        </div>
                    </div>

                    <div>
                        <div className='text-gray-400'>
                            Easy
                        </div>
                        <div className={cn(get_bg(data.hard),'bg-clip-text text-transparent')}>
                            {data.hard.toFixed(2)}
                        </div>
                    </div>

                    <div>
                        <div className='text-gray-400'>
                            Outcome
                        </div>
                        <div className={cn(get_bg(data.reward),'bg-clip-text text-transparent')}>
                            {data.reward.toFixed(2)}
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

