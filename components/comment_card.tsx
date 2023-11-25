'use client'
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn, get_bg, get_gpa } from '@/lib/utils'
import { Angry, BadgeCheck, Flag, ThumbsDown, ThumbsUp } from 'lucide-react'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useToast } from "@/components/ui/use-toast"

Fancybox.bind("[data-fancybox]", {
    compact: true,
    contentClick: 'close',
    contentDblClick: 'close',
});

export const CommentCard = (
    { comment }: { comment: any}
) => {
    const { toast } = useToast()
    // console.log(comment)
    return (
        <Card className=' hover:shadow-lg mx-auto'>
            <CardHeader className='pb-0.5 pt-4'  >
                <div className='flex justify-between'>
                    <div className='text-gray-400 text-xs'>
                        {/* convert 2022-10-20T03:44:32.219061 to 2022-10-20 */}
                        {comment.pub_time.split('T')[0]}
                    </div>
                    {/* if comment.isCurrentUserVoted  show badge*/}
                    <TooltipProvider delayDuration={0}>
                        <Tooltip>
                            <TooltipTrigger>
                                <div className={
                                    comment.verified ?
                                        'text-green-600 text-xs flex' :
                                        'hidden'
                                }>
                                    <BadgeCheck size={16} strokeWidth={1.75} absoluteStrokeWidth />
                                    <div className='px-1 italic'>
                                        Verified
                                    </div>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p className='text-xs'>✌️Verified UM User(logged in)</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>


                </div>
                <div className='flex flex-col justify-between'>
                    {
                        comment.img ? (
                            <div className='w-fit'>
                                <a href={comment.img} data-fancybox={comment.img} data-caption={comment.content}>
                                    <img
                                        alt={comment.content}
                                        src={comment.img}
                                        className='rounded'
                                    />
                                </a>
                            </div>
                        ) : null
                    }
                    <p className='break-word'>
                        {comment.content}
                    </p>
                </div>
            </CardHeader>
            <CardContent>

                <Separator className='my-1' />
                <div className='flex flex-row text-xs font-semibold space-x-1 flex-wrap'>
                    <div className='pl-1'>
                        <div className='text-gray-400'>
                            Recommend
                        </div>
                        <div className={cn(get_bg(comment.recommend), 'bg-clip-text text-transparent')}>
                            {get_gpa(comment.recommend)}
                        </div>
                    </div>

                    <div>
                        <div className='text-gray-400'>
                            Difficulty
                        </div>
                        <div className={cn(get_bg(comment.hard), 'bg-clip-text text-transparent')}>
                            {get_gpa(comment.hard)}
                        </div>
                    </div>

                    <div>
                        <div className='text-gray-400'>
                            Outcome
                        </div>
                        <div className={cn(get_bg(comment.reward), 'bg-clip-text text-transparent')}>
                            {get_gpa(comment.reward)}
                        </div>
                    </div>

                    {/* Button to upvotw */}
                    <div className='flex flex-row space-x-1 items-center'>
                        {
                            comment.isCurrentUserVoted && comment.offset == -1 ?
                                <div className="text-gray-400">
                                    <ThumbsUp size={16} strokeWidth={1.75} absoluteStrokeWidth />
                                </div>
                                :
                                <div className={
                                    comment.isCurrentUserVoted && comment.offset == 1 ?
                                        'text-lime-600' :
                                        'hover:rotate-12 text-gray-400 hover:text-lime-600'
                                } onClick={() => {
                                    toast({
                                        title: "Thanks for your vote!",
                                        description: "👍",
                                        duration: 5000,
                                    })
                                }}>
                                    <ThumbsUp size={16} strokeWidth={1.75} absoluteStrokeWidth />
                                </div>

                        }
                        <div className='text-gray-400'>
                            {comment.upvote - comment.downvote}
                        </div>
                        {
                            comment.isCurrentUserVoted && comment.offset == 1 ?
                                <div className="text-gray-400">
                                    <ThumbsDown size={16} strokeWidth={1.75} absoluteStrokeWidth />
                                </div>
                                :
                                <div className={
                                    comment.isCurrentUserVoted && comment.offset == -1 ?
                                        'text-rose-600' :
                                        'hover:rotate-12 text-gray-400 hover:text-rose-600'
                                } onClick={() => {
                                    toast({
                                        title: "Thanks for your vote!",
                                        description: "👎",
                                        duration: 5000,
                                    })
                                }}>
                                    <ThumbsDown size={16} strokeWidth={1.75} absoluteStrokeWidth />
                                </div>
                        }
                        <div >
                            <TooltipProvider delayDuration={0}>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <div className='text-gray-400 px-2 hover:rotate-180 hover:text-red-600 duration-1000 ease-in-out' onClick={() => {
                                            toast({
                                                title: "Thanks for your report!",
                                                description: "👮‍♀️",
                                                duration: 5000,
                                            })
                                        }}>
                                            <Flag size={14} strokeWidth={1.75} absoluteStrokeWidth />
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className='text-xs font-normal'> 👮‍♀️ Report this comment.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>

                        </div>
                    </div>

                </div>


            </CardContent>
        </Card>
    )
}