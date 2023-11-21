import { BookMarked, Bot, CircleDollarSign, Microscope, Newspaper, Scale, School } from "lucide-react";
import { Card } from "./ui/card";
import { getStatistics } from "@/lib/database/get-statistics";
import Link from "next/link";

export default async function CommentBank() {
    const statistics:any = await getStatistics();
    return (
        <div className="flex flex-wrap justify-center	">
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%] dark:bg-gray-800 rounded-lg shadow-md ">
                <Newspaper size={80} strokeWidth={1} className="pb-3" />
                <Link href="https://www.umeh.top/catalog/FAH" className="text-lg">
                    FAH
                </Link>
                <div className="text-sm">
                    {statistics[0].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[0].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%] dark:bg-gray-800 rounded-lg shadow-md ">
                <CircleDollarSign size={80} strokeWidth={1} className="pb-3 " />
                <Link href="https://www.umeh.top/catalog/FBA" className="text-lg">
                    FBA
                </Link>
                <div className="text-sm">
                    {statistics[1].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[1].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%] dark:bg-gray-800 rounded-lg shadow-md ">
                <School size={80} strokeWidth={1} className="pb-3 " />
                <Link href="https://www.umeh.top/catalog/FED" className="text-lg">
                    FED
                </Link>
                <div className="text-sm">
                    {statistics[2].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[2].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%] dark:bg-gray-800 rounded-lg shadow-md ">
                <Microscope size={80} strokeWidth={1} className="pb-3 " />
                <Link href="https://www.umeh.top/catalog/FHS" className="text-lg">
                    FHS
                </Link>
                <div className="text-sm">
                    {statistics[3].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[3].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%] dark:bg-gray-800 rounded-lg shadow-md ">
                <Scale size={80} strokeWidth={1} className="pb-3 " />
                <Link href="https://www.umeh.top/catalog/FLL" className="text-lg">
                    FLL
                </Link>
                <div className="text-sm">
                    {statistics[4].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[4].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%] dark:bg-gray-800 rounded-lg shadow-md ">
                <BookMarked size={80} strokeWidth={1} className="pb-3 " />
                <Link href="https://www.umeh.top/catalog/FSS" className="text-lg">
                    FSS
                </Link>
                <div className="text-sm">
                    {statistics[5].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[5].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%] dark:bg-gray-800 rounded-lg shadow-md ">
                <Bot size={80} strokeWidth={1} className="pb-3 " />
                <Link href="https://www.umeh.top/catalog/FST" className="text-lg">
                    FST
                </Link>
                <div className="text-sm">
                    {statistics[6].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[6].comment_num} comments
                </div>
            </Card>
        </div>
    );
}