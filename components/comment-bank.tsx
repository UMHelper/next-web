import { BookMarked, Bot, CircleDollarSign, Microscope, Newspaper, Scale, School } from "lucide-react";
import { Card } from "./ui/card";
import { getStatistics } from "@/lib/database/ statistics";

export default async function CommentBank() {
    const statistics = await getStatistics();
    return (
        <div className="flex flex-wrap justify-center	">
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%]">
                <Newspaper size={80} strokeWidth={1} className="pb-3 " />
                <div className="text-lg">
                    FAH
                </div>
                <div className="text-sm">
                    {statistics[0].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[0].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%]">
                <CircleDollarSign size={80} strokeWidth={1} className="pb-3 " />
                <div className="text-lg">
                    FBA
                </div>
                <div className="text-sm">
                    {statistics[1].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[1].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%]">
                <School size={80} strokeWidth={1} className="pb-3" />
                <div className="text-lg">
                    FED
                </div>
                <div className="text-sm">
                    {statistics[2].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[2].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%]">
                <Microscope size={80} strokeWidth={1} className="pb-3" />
                <div className="text-lg">
                    FHS
                </div>
                <div className="text-sm">
                    {statistics[3].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[3].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%]">
                <Scale size={80} strokeWidth={1} className="pb-3" />
                <div className="text-lg">
                    FLL
                </div>
                <div className="text-sm">
                    {statistics[4].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[4].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%]">
                <BookMarked size={80} strokeWidth={1} className="pb-3" />
                <div className="text-lg">
                    FSS
                </div>
                <div className="text-sm">
                    {statistics[5].course_num} courses
                </div>
                <div className="text-sm">
                    {statistics[5].comment_num} comments
                </div>
            </Card>
            <Card className="flex flex-col items-center p-4 m-2 min-w-[20%]">
                <Bot size={80} strokeWidth={1} className="pb-3" />
                <div className="text-lg">
                    FST
                </div>
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