'use client'

import axios from "axios";
import { Card, CardContent, CardFooter, CardHeader } from "./ui/card";
import { Badge } from "@/components/ui/badge"
import { ArrowUpRightSquare, Cat, ClipboardEdit, Eye, MessageCircle, MessageSquare, Reply, SmilePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "./ui/carousel";
import { Avatar, AvatarFallback } from "@radix-ui/react-avatar";
import { Popover, PopoverTrigger, PopoverContent } from "@radix-ui/react-popover";
import { comment } from "postcss";
import { AVATAR_EMOJI_LIST } from "@/lib/consant";
import Link from "next/link";
import { Button } from "./ui/button";

async function fetchBbsUpdates() {
    return axios
        .get('https://whole.umeh.top/api/top-posts')
        .then(async response => {
            return response.data
        })
}

const HashEmojiAvatar = ({ user_id }: { user_id: string }) => {

    let hash = 0;

    if (user_id.length == 0) return hash;

    for (let i = 0; i < user_id.length; i++) {
        let char = user_id.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }

    hash = ((hash % AVATAR_EMOJI_LIST.length) + AVATAR_EMOJI_LIST.length) % AVATAR_EMOJI_LIST.length
    // console.log(user_id + ', ' + hash + ', '+AVATAR_EMOJI_LIST[hash])
    return (AVATAR_EMOJI_LIST[hash])

}

const convertIsoTimeToMacauTime = (isoTime: string) => {
    const today = new Date(isoTime);
    today.setHours(today.getHours() + 8);
    return today.toISOString().slice(0, 16).replace('T', ' · ')
}

export default function BbsTopPosts() {
    const [data, setData] = useState({ "data": [{ "id": 1, "content": "One second...", "verify_account": "placeholder", "title": "Loading", "pub_time": "1985-01-01T00:00:01" }], "code": 1 })
    useEffect(() => {
        fetchBbsUpdates().then((data) => {
            setData(data)
        })
    }, [])

    return (
        <div className='max-w-screen-xl mx-auto p-4'>
            <div className='mx-4 my-4 py-8'>
                <div className='flex flex-row w-full py-8 justify-between'>

                    <div className="flex flex-wrap items-center justify-start mb-2">
                        <Cat size={24} strokeWidth={2} color='rgb(14 165 233)' className="me-2" />
                        <a href="https://whole.umeh.top" className="flex mr-10">
                            <span className="self-center text-2xl font-bold font-black whitespace-nowrap bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">WHOLE</span>
                            <ArrowUpRightSquare className="ms-2 text-indigo-600" size={14} />
                        </a>

                        <span className='text-xl bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent '>
                            Student Community @UM
                        </span>
                    </div>


                    <div className='pb-2 content-center'>
                        <Link href={"https://whole.umeh.top"}>
                            <Button className='hidden md:flex text-sm px-2 hover:shadow-lg bg-gradient-to-r from-blue-600 to-indigo-500 '>
                                <ClipboardEdit size={16} /><span> 發表主題 New Post</span>
                            </Button>
                        </Link>
                    </div>
                </div>


                <div className="md:px-8">
                    <Carousel>
                        <CarouselContent>

                            {
                                data.data.map((comment: any) => (

                                    <CarouselItem className="basis-2/3 md:basis-2/5 lg:basis-1/3">

                                        <Link href={"https://whole.umeh.top"}>
                                            <Card className=' hover:shadow-lg mx-auto'>
                                                <CardHeader className='pb-2 pt-4'  >
                                                    <div className='flex justify-between'>

                                                        <div className='flex space-x-2 items-center'>
                                                            <div>
                                                                <Avatar className="w-8 h-8">
                                                                    <AvatarFallback className="text-sm">{HashEmojiAvatar({ user_id: comment.verify_account })}</AvatarFallback>
                                                                </Avatar>
                                                            </div>

                                                            <div className='text-sm font-semibold text-gray-500'>Post #{
                                                                comment.id
                                                            }</div>
                                                        </div>

                                                        {/* if comment.isCurrentUserVoted  show badge*/}
                                                        <Popover>
                                                            <PopoverTrigger className="inline-flex items-center">

                                                                <span className='text-gray-400 text-xs'>
                                                                    {
                                                                        convertIsoTimeToMacauTime(comment.pub_time + 'Z')
                                                                    }
                                                                </span>

                                                            </PopoverTrigger>
                                                        </Popover>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className='pt-1 p3-1'>

                                                    <div className='flex flex-col justify-between max-h-[500px] overflow-y-auto'>
                                                        {comment.title ?
                                                            <p className='break-words font-semibold my-2'>
                                                                {comment.title}
                                                            </p> : null}

                                                        <p className='break-words '>
                                                            {comment.content}
                                                        </p>
                                                    </div >

                                                    <div className="flex flex-wrap justify-start my-2 items-center text-xs">

                                                        <div className='flex items-center me-2 my-1 px-2 py-1 rounded-full bg-gray-100 text-gray-800 border-gray-300 border hover:bg-gray-300'>
                                                            <SmilePlus size={12} strokeWidth={2.5} />
                                                        </div>
                                                    </div>
                                                </CardContent>

                                                <CardFooter className='block bg-gray-50 py-1 pl-5'>

                                                    <div>
                                                        <div className="flex justify-between mt-3 mb-2 pl-1">
                                                            <div className='text-xs hover:text-blue-500 hover:cursor-pointer flex space-x-1 items-center text-gray-800'
                                                            >
                                                                <MessageSquare size={12} strokeWidth={2.5} />
                                                                <div>
                                                                    Replies
                                                                </div>
                                                            </div>
                                                            <div
                                                                className=" text-xs hover:text-blue-500 hover:cursor-pointer flex space-x-1 items-center text-blue-500"
                                                            >
                                                                <Reply size={14} strokeWidth={2.5} />
                                                                <div>
                                                                    Reply
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </div>
                                                </CardFooter>
                                            </Card>
                                        </Link>
                                    </CarouselItem>


                                ))}

                        </CarouselContent>
                        <CarouselPrevious className="hidden md:flex" />
                        <CarouselNext className="hidden md:flex" />
                    </Carousel>
                </div>
            </div>
        </div>
    );
}

// export function BbsUpdates() {
//     const [data, setData] = useState([{
//         'url': 'https://whole.umeh.top',
//         'title': 'Loading update data from Whole API',
//         'commentCount': 0,
//         'viewCount': 0,
//         'date': 'One second...'
//     }])
//     useEffect(() => {
//         fetchBbsUpdates(3).then((data) => {
//             setData(data)
//         })
//     }, [])

//     return (

//         <div className='max-w-screen-xl mx-auto p-4'>
//             <div className='md:flex mx-4 my-4 py-8'>
//                 <div className='w-full md:w-2/5 space-y-3 py-4'>

//                     <div className="flex flex-wrap items-center justify-start pb-2">
//                         <Cat size={24} strokeWidth={2} color='rgb(14 165 233)' className="me-2" />
//                         <a href="https://whole.umeh.top" className="flex mr-10">
//                             <span className="self-center text-2xl font-bold font-black whitespace-nowrap bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">WHOLE</span>
//                             <ArrowUpRightSquare className="ms-2 text-indigo-600" size={14} />
//                         </a>
//                     </div>

//                     <div className='text-xl bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent'>
//                         Student Community @UM
//                     </div><br></br>

//                     <div className='hidden md:block text-base text-slate-800	'>
//                         Anonymous and free discussions
//                     </div>
//                     <div className='hidden md:block text-base text-slate-800	'>
//                         識朋友，揾同好，傾學業✅ <br />
//                         快來加入我哋嘅 <a
//                             href="https://whole.umeh.top" className="text-sky-800"> Whole @UM 社群 </a>
//                     </div>
//                 </div>
//                 <div className='w-full md:w-3/5'>

//                     <div className="columns-1 border shadow-md rounded-lg">
//                         {
//                             data.map((item: any) => (
//                                 <div key={item.url}>
//                                     <a href={item.url}>
//                                         <div className="bg-white w-full space-y-1 mt-2 px-4 py-1">
//                                             <div className="flex w-full justify-between items-center" >
//                                                 <div className="text-sm text-slate-700">{item.date} </div>
//                                                 <div >
//                                                     <Badge className="py-0.5 px-1.5 mx-1 bg-gradient-to-r from-blue-600 to-indigo-500"><Eye size={12} className="me-1" />{item.viewCount}</Badge>
//                                                     <Badge className="py-0.5 px-1.5 mx-1 bg-gradient-to-r from-blue-600 to-indigo-500"><MessageCircle size={12} className="me-1" />{item.commentCount}</Badge>
//                                                 </div>

//                                             </div>
//                                             <div >
//                                                 {item.title}
//                                             </div>
//                                         </div>
//                                     </a>
//                                     <Separator className="mt-2" />
//                                 </div>

//                             ))}
//                     </div>
//                 </div>
//             </div>
//         </div>

//     );
// }

export const BBSAd = () => {
    return null
    return (
        <div className='w-full px-1 py-2 flex justify-center items-center bg-slate-100 text-slate-500 text-xs'>
            <span>對課程有疑問？歡迎前往 <a href="https://whole.umeh.top" className=" self-center font-semibold whitespace-nowrap bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent px-1">
                WHOLE @UM
            </a>討論區提問</span>
        </div>
    )
}
