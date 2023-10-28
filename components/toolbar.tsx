import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from "@/components/ui/tooltip";
import React from "react";
import {Bug, Send} from "lucide-react";

const Toolbar = ({course,prof}:{course:any,prof:any|undefined}) => {
    const share=()=>{
        navigator.share({
            title: course['courseCode']+' - What2Reg @UM',
            text: course['courseTitle'],
            url: window.location.href,
        } as any)
    }

    return(
        <div className='mt-4 flex flex-row justify-start space-x-2'>
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger>
                        <div className='p-1 rounded bg-gray-600 bg-opacity-40' onClick={share}>
                            <Send size={18}/>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p className="text-xs">Share with your friends now! 👀</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger>
                        <div className='p-1 rounded bg-gray-600 bg-opacity-40' onClick={share}>
                            <Bug  size={18}/>
                        </div>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p className="text-xs">Report bugs in this page to UMHelper💕</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

        </div>
    )
}
export default Toolbar