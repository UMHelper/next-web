import axios from "axios";
import { Card } from "./ui/card";
import { Badge } from "@/components/ui/badge"
import { Eye, MessageCircle } from "lucide-react";
import Link from "next/link";

async function fetchBbsUpdates(count: number) {
    return await axios
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


export default async function BbsUpdates() {
    const updates: any = await fetchBbsUpdates(3);

    return (

        <div className="columns-1">
            {
                updates.map((item: any) => (
                    <Link href={item.url}>
                        <Card className="px-4 py-3 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full  ">
                            <div className="flex w-full justify-between " >
                                <div className="text-sm text-slate-700">{item.date} </div>
                                <div >
                                    <Badge className="py-0.5 px-1.5 mx-1 bg-gradient-to-r from-blue-600 to-indigo-500"><Eye size={12} className="me-1" />{item.viewCount}</Badge>
                                    <Badge className="py-0.5 px-1.5 mx-1 bg-gradient-to-r from-blue-600 to-indigo-500"><MessageCircle size={12} className="me-1" />{item.commentCount}</Badge>
                                </div>

                            </div>
                            <div >
                                {item.title}
                            </div>
                        </Card>
                    </Link>

                ))}
        </div>
    );
}