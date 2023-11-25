'use client'
import { Fancybox } from "@fancyapps/ui";
import "@fancyapps/ui/dist/fancybox/fancybox.css";
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn, get_bg, get_gpa } from '@/lib/utils'
import { Angry, BadgeCheck, Flag, ThumbsDown, ThumbsUp } from 'lucide-react'
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useToast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useUser } from "@clerk/nextjs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

Fancybox.bind("[data-fancybox]", {
    compact: true,
    contentClick: 'close',
    contentDblClick: 'close',
});
const ReplyCard = ({ reply }: { reply: any }) => {
    console.log(reply)
    const [account, setAccount] = useState<any>(null)
    useEffect(() => {
        fetch(`/api/user?` + new URLSearchParams({ id: reply.verify_account })).then(res => res.json()).then(res => setAccount(res))
    }, [reply])

    if (account) {
        return (
            <div className="flex flex-row space-x-1">
                <div>
                <img
                    alt={account.fullName}
                    src={account.imageUrl}
                    className='rounded-full border-2 border-slate-100'
                    width={32}
                    height={32}
                />
                </div>
                <div>
                <div className="flex space-x-1">
                <div className='text-xs'>
                    {account.firstName} {account.lastName}
                </div>

                <div className='text-xs text-gray-400'>
                    {reply.pub_time.split('T')[0]}
                </div>
                </div>


                <div className='text-sm'>
                    {reply.content}
                </div>
                </div>
            </div>
        )
    }
    return (
        <div>
            Loading
        </div>
    )
}
const ReplySubmit = ({ comment }: { comment: any }) => {
    const { isSignedIn, user } = useUser();
    if (!isSignedIn) {
        <div>
            <div className='text-gray-400 text-xs'>
                Please login to reply
            </div>
        </div>
    }
    return (
        <div className=" space-y-1">
            <div className='text-gray-400 text-xs'>
                Reply as <span className=" text-blue-500">{user?.fullName}</span>
            </div>
            <div className=" space-y-1">
                <Textarea
                    placeholder="Reply this review" />
                <Button variant="outline" size='xs'>Reply</Button>
            </div>
        </div>
    )
}
const ReplyDialog = ({ comment, reply_comment }: { comment: any, reply_comment: any[] }) => {
    return (
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Review Detail</DialogTitle>
            </DialogHeader>
            <div>
                <CommentDetail comment={comment} env={'detail'} />
            </div>
            <div>
                <ReplySubmit comment={comment} />
            </div>
            <div className=" space-y-1">
                {reply_comment.map((reply, index) => {
                    return (
                        <ReplyCard reply={reply} key={index} />
                    )
                })}
            </div>
        </DialogContent>
    )
}

const CommentDetail = ({ comment, env }: { comment: any, env: string }) => {
    return (
        <div className='flex flex-col justify-between'>
            <p className='break-word'>
                {comment.content}
            </p>
            {
                comment.img ? (
                    env != 'review' ? (
                        <div className='w-fit py-2'>
                            <img
                                alt={comment.content}
                                src={comment.img}
                                className='rounded'
                            />
                        </div >
                    ) : (
                        <div className='w-fit'>
                            <a href={comment.img} data-fancybox={comment.img} data-caption={comment.content + env}>
                                <img
                                    alt={comment.content}
                                    src={comment.img}
                                    className='rounded'
                                />
                            </a>
                        </div >
                    )
                ) : null
            }
        </div >
    )
}

export const CommentCard = (
    { comment, reply_comment }: { comment: any, reply_comment: any[] }
) => {
    const { toast } = useToast()
    // console.log(comment)
    // console.log(reply_comment)
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
                <CommentDetail comment={comment} env={'review'} />
            </CardHeader>
            <CardContent>
                <Separator className='my-1' />
                <div className='flex flex-row text-xs font-semibold space-x-1 flex-wrap justify-between'>
                    <div>
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
                    {/* <div className='flex flex-row space-x-1 items-center'>
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
                    </div> */}

                </div>
                {/* Reply comment */}
                {
                    reply_comment.length > 0 ? (
                        <Dialog>
                            <DialogTrigger>
                                <div>
                                    <span className=" text-xs text-gray-800 hover:text-blue-500 hover:cursor-pointer">{`${reply_comment.length} ${reply_comment.length === 1 ? "Reply" : "Replies"}`}</span>
                                </div>
                            </DialogTrigger>
                            <ReplyDialog comment={comment} reply_comment={reply_comment} />
                        </Dialog>

                    ) : null
                }
            </CardContent>
        </Card>
    )
}