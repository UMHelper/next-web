'use client'

import axios from "axios";
import { Card } from "./ui/card";
import { Badge } from "@/components/ui/badge"
import { ArrowUpRightSquare, Cat, Eye, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Separator } from "@/components/ui/separator";

async function fetchBbsUpdates(count: number) {
    return axios
        .get('https://whole.umeh.top/public/api/discussions?include=user%2ClastPostedUser%2Ctags%2Ctags.parent%2CfirstPost&filter%5Btag%5D=umeh-notes&sort&page%5Boffset%5D=0')
        .then(async response => {
            if (response.data.data[0] != undefined)
                return (response.data.data.slice(0, count).map((item: any) => ({
                    'url': item.attributes.shareUrl,
                    'title': item.attributes.title,
                    'commentCount': item.attributes.commentCount,
                    'viewCount': item.attributes.viewCount,
                    'date': item.attributes.createdAt.substring(0, 10)
                })))

            else
                throw Error('No update data found in Whole.');
        })
        .catch(function (error) {
            return ([{
                'url': 'https://whole.umeh.top',
                'title': 'Cannot fetching data. Please contact us',
                'commentCount': 0,
                'viewCount': 0,
                'date': 'Error'
            }, {
                'url': 'https://whole.umeh.top',
                'title': String(error),
                'commentCount': 0,
                'viewCount': 0,
                'date': 'Message'
            }])
        });
}


export default function BbsUpdates() {
    const [data, setData] = useState([{
        'url': 'https://whole.umeh.top',
        'title': 'Loading update data from Whole API',
        'commentCount': 0,
        'viewCount': 0,
        'date': 'One second...'
    }])
    useEffect(() => {
        fetchBbsUpdates(3).then((data) => {
            setData(data)
        })
    }, [])

    return (

        <div className='max-w-screen-xl mx-auto p-4'>
            <div className='md:flex mx-4 my-4 py-8'>
                <div className='w-full md:w-2/5 space-y-3 py-4'>

                    <div className="flex flex-wrap items-center justify-start pb-2">
                        <Cat size={24} strokeWidth={2} color='rgb(14 165 233)' className="me-2" />
                        <Link href="https://whole.umeh.top" className="flex mr-10">
                            <span className="self-center text-2xl font-bold font-black whitespace-nowrap bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">WHOLE</span>
                            <ArrowUpRightSquare className="ms-2 text-indigo-600" size={14} />
                        </Link>
                    </div>

                    <div className='text-xl bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent'>
                        Student Community @UM
                    </div><br></br>

                    <div className='hidden md:block text-base text-slate-800	'>
                        Anonymous and free discussions
                    </div>
                    <div className='hidden md:block text-base text-slate-800	'>
                        識朋友，揾同好，傾學業✅ <br />
                        快來加入我哋嘅 <Link
                            href="https://whole.umeh.top" className="text-sky-800"> Whole @UM 社群 </Link>
                    </div>
                </div>
                <div className='w-full md:w-3/5'>

                    <div className="columns-1 border shadow-md rounded-lg">
                        {
                            data.map((item: any) => (
                                <div key={item.url}>
                                    <Link href={item.url}>
                                        <div className="bg-white w-full space-y-1 mt-2 px-4 py-1">
                                            <div className="flex w-full justify-between items-center" >
                                                <div className="text-sm text-slate-700">{item.date} </div>
                                                <div >
                                                    <Badge className="py-0.5 px-1.5 mx-1 bg-gradient-to-r from-blue-600 to-indigo-500"><Eye size={12} className="me-1" />{item.viewCount}</Badge>
                                                    <Badge className="py-0.5 px-1.5 mx-1 bg-gradient-to-r from-blue-600 to-indigo-500"><MessageCircle size={12} className="me-1" />{item.commentCount}</Badge>
                                                </div>

                                            </div>
                                            <div >
                                                {item.title}
                                            </div>
                                        </div>
                                    </Link>
                                    <Separator className="mt-2" />
                                </div>

                            ))}
                    </div>
                </div>
            </div>
        </div>

    );
}