import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn, get_bg, get_gpa } from '@/lib/utils'
import { BadgeCheck, ThumbsDown, ThumbsUp } from 'lucide-react'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
export const CommentCard = (
    {comment}:{comment:any}
    ) => {
        console.log(comment.upvote-comment.downvote)
        return(
            <Card className='hover:cursor-pointer hover:shadow-lg mx-auto' onClick={()=>{}}>
                
                <CardHeader className='pb-0.5 pt-4'>
                    <div className='flex justify-between'>
                        <div className='text-gray-400 text-xs'>
                            {comment.pub_time}
                        </div>
                        {/* if comment.isCurrentUserVoted  show badge*/}
                        <TooltipProvider delayDuration={0}>
                            <Tooltip>
                                <TooltipTrigger>
                                    <div className={
                                        comment.verified?
                                        'text-green-600 text-xs flex':
                                        'hidden'
                                        }>
                                        <BadgeCheck size={16} strokeWidth={1.75} absoluteStrokeWidth/> 
                                        <div className='px-1'>
                                            Verified
                                        </div>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>✌️Verified UM User(logged in)</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        

                    </div>
                    <div className='flex flex-row justify-between'>
                        <div>
                            {comment.content}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>

                    <Separator className='my-1'/> 
                    <div className='flex flex-row text-xs font-semibold space-x-2'>
                        <div>
                            <div className='text-gray-400'>
                                Recommend
                            </div>
                            <div className={cn(get_bg(comment.recommend),'bg-clip-text text-transparent')}>
                                {get_gpa(comment.recommend)}
                            </div>
                        </div>

                        <div>
                            <div className='text-gray-400'>
                                Easy
                            </div>
                            <div className={cn(get_bg(comment.hard),'bg-clip-text text-transparent')}>
                                {get_gpa(comment.hard)}
                            </div>
                        </div>

                        <div>
                            <div className='text-gray-400'>
                                Outcome
                            </div>
                            <div className={cn(get_bg(comment.reward),'bg-clip-text text-transparent')}>
                                {get_gpa(comment.reward)}
                            </div>
                        </div>

                        {/* Button to upvotw */}
                        <div className='flex flex-row space-x-1 items-center'>
                            {
                                comment.isCurrentUserVoted&&comment.offset==-1?
                                <div className="text-gray-400">
                                    <ThumbsUp size={16} strokeWidth={1.75} absoluteStrokeWidth />
                                </div>
                                :
                                <div className={
                                    comment.isCurrentUserVoted&&comment.offset==1?
                                    'text-green-600':
                                    'hover:rotate-12 text-gray-400 hover:text-gray-800'
                                    }>
                                    <ThumbsUp size={16} strokeWidth={1.75} absoluteStrokeWidth />
                                </div>
                                
                            }
                            <div className='text-gray-400'>
                                {comment.upvote-comment.downvote}
                            </div>
                            {
                                comment.isCurrentUserVoted&&comment.offset==1?
                                <div className="text-gray-400">
                                    <ThumbsDown size={16} strokeWidth={1.75} absoluteStrokeWidth />
                                </div>
                                :
                                <div className={
                                    comment.isCurrentUserVoted&&comment.offset==-1?
                                    'text-red-600':
                                    'hover:-rotate-12 text-gray-400 hover:text-gray-800'
                                    }>
                                    <ThumbsDown size={16} strokeWidth={1.75} absoluteStrokeWidth />
                                </div>
                            }
                        </div>
                    </div>


            </CardContent>
        </Card>
        )
}