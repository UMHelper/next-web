import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn, get_bg, get_gpa } from '@/lib/utils'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
export const CommentCard = (
    {comment}:{comment:any}
    ) => {
        return(
            <Card className='hover:cursor-pointer hover:shadow-lg mx-auto' onClick={()=>{}}>
            <CardHeader className='pb-0.5'>
                <div className='flex flex-row justify-between'>
                    <div>
                        {comment.content}
                    </div>
                </div>
            </CardHeader>
            {/*<Separator className='my-2'/>*/}
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
                    <ThumbsUp size={16} color="rgb(156 163 175)" strokeWidth={1.75} absoluteStrokeWidth />
                    <div className='text-gray-400'>
                        {comment.upvote-comment.downvote}
                    </div>
                    <ThumbsDown size={16} color="rgb(156 163 175)" strokeWidth={1.75} absoluteStrokeWidth />
                    </div>
                </div>
            </CardContent>
        </Card>
        )
}