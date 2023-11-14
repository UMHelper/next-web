import { Radar, Github, Quote, UserPlus, ArrowUpRightSquare } from "lucide-react";
import Link from "next/link";
import CommentBank from "@/components/comment-bank";
import { Card } from "@/components/ui/card";
import SearchComp from "@/components/search";
import BbsUpdates from "@/components/bbs-updates";

async function HomePage() {
    return (
        <>
            <SearchComp />

            <div className='max-w-screen-xl mx-auto p-4'>
                <div className='md:flex mx-4 my-4 py-8'>
                    <div className='w-full md:w-2/5 space-y-3 py-4'>
                        <div className="flex">

                            <Link href="https://whole.umeh.top" className="bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent space-x-1">
                                {/* <img src="./whole-icon.png" className="w-48 -ms-2" /> */}
                                <span className="text-3xl font-bold font-black me-2">WHOLE</span>
                            </Link>

                            <ArrowUpRightSquare className="text-indigo-600" size={14} />
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
                        <BbsUpdates />
                    </div>
                </div>
            </div>

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