import { Radar, Github, Quote, UserPlus, ArrowUpRightSquare, Cat } from "lucide-react";
import Link from "next/link";
import CommentBank from "@/components/comment-bank";
import { Card } from "@/components/ui/card";
import SearchComp from "@/components/search";

async function HomePage() {
    return (
        <>
            <SearchComp />

            <div className='max-w-screen-xl mx-auto p-4'>
                <div className='grid grid-cols-1 md:grid-cols-2 mx-4 py-8 gap-y-8 gap-x-16'>
                    <div className='flex flex-col justify-center space-y-8 items-center md:items-start'>
                        <div className='text-2xl font-bold'>
                            Suggesstions or feedback?
                        </div>
                        <Card className="flex items-center space-x-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full justify-between ">
                            <div className="flex items-center space-x-4 " >
                                <Quote size={40} strokeWidth={1.75} />
                                <div >
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">Report and Feedback</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Report problems, bugs, and suggestions.
                                    </p>
                                </div>
                            </div>
                            <div className="p-2 rounded hover:shadow bg-zinc-200 text-center">
                                <Link href='https://docs.google.com/forms/d/1_HrH0jJ9Fyxu_dmW1xGsn9Hq1ZtN9nFG-Jangj_BNVk/'>
                                    Report Form
                                </Link>
                            </div>
                        </Card>
                        <Card className="flex items-center space-x-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full justify-between ">
                            <div className="flex items-center space-x-4 " >
                                <Radar size={40} strokeWidth={1.75} />
                                <div >
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">Our Community</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Be part of our community.
                                    </p>
                                </div>
                            </div>
                            <div className="p-2 rounded hover:shadow bg-zinc-200 text-center">
                                <Link href='https://discord.gg/y8RsDQbw'>
                                    Discord Server
                                </Link>
                            </div>
                        </Card>
                    </div>
                    <div className='flex flex-col justify-center space-y-8 items-center md:items-start'>
                        <div className='text-2xl font-bold'>
                            We are open sourced!
                        </div>


                        <Card className="flex items-center space-x-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full justify-between ">
                            <div className="flex items-center space-x-4 " >
                                <UserPlus size={40} strokeWidth={1.75} />
                                <div >
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">UMHelper Dev Group</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Join us and contribute together.
                                    </p>
                                </div>
                            </div>
                            <div className="p-2 rounded hover:shadow bg-zinc-200 text-center">
                                <Link className="p-1" href="https://github.com/UMHelper/Feedback-and-Join-Us/blob/master/Join.md">
                                    Join us
                                </Link>
                            </div>
                        </Card>

                        <Card className="flex items-center space-x-4 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-md w-full justify-between ">
                            <div className="flex items-center space-x-4 " >
                                <Github size={40} strokeWidth={1.75} />
                                <div >
                                    <h2 className="text-base font-bold text-gray-900 dark:text-white">What2Reg Ver. &quot;Next&quot;</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-300">
                                        Check out this project on GitHub.
                                    </p>
                                </div>
                            </div>
                            <div className="p-2 rounded hover:shadow bg-zinc-200 text-center">
                                <Link className="p-1" href="https://github.com/UMHelper/next-web/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22+">
                                    Fix Bugs Now
                                </Link>
                            </div>
                        </Card>
                    </div>

                </div>
            </div>

            <div className='max-w-screen-xl mx-auto p-4'>
                <div className="py-8">
                    <div className="text-center text-2xl font-bold pb-8">
                        Our Comment Bank
                    </div>
                    <CommentBank />
                </div>
            </div>
        </>

    )
}

export default HomePage