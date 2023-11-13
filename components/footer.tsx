import { Cat } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
async function fetchGitData() {
    const response = await fetch("https://api.github.com/repos/UMHelper/next-web/branches/main",
        {
            next: {
                revalidate: 3600, // 1 hour
            }
        })
    const data = await response.json()
    return data
}
const Footer = async () => {
    const git = await fetchGitData();
    return (
        <div className='bg-gray-300/10'>
            <div className='max-w-screen-xl mx-auto px-6 py-10 space-y-4 '>
                <div className="flex flex-wrap items-center justify-start pb-2">
                    <Cat size={24} strokeWidth={2} color='rgb(14 165 233)' className="me-2"/>
                    <Link href="/" className="flex items-center mr-10">
                        <span className="self-center text-2xl font-semibold whitespace-nowrap bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">What2Reg @UM</span>
                    </Link>
                </div>

                <div className='flex md:space-x-4 underline underline-offset-1 font-semibold text-xs flex-col md:flex-row space-y-2 md:space-y-0'>
                    <Link href='https://github.com/UMHelper/next-web/issues?q=is%3Aopen+is%3Aissue+label%3A%22help+wanted%22+'>
                        GitHub
                    </Link>
                    <Link href='https://whole.umeh.top/public/p/2-terms-of-service'>
                        Terms of Service
                    </Link>
                    <Link href='https://docs.google.com/forms/d/1_HrH0jJ9Fyxu_dmW1xGsn9Hq1ZtN9nFG-Jangj_BNVk/'>
                        Feedback
                    </Link>
                    <Link href='./sitemap.xml'>
                        Sitemap
                    </Link>
                </div>
                <div className='text-gray-500 text-xs'>
                    Designed and built by the <Link className='text-black font-semibold underline underline-offset-1' href='https://github.com/UMHelper/Feedback-and-Join-Us/blob/master/Join.md'>UMHelper</Link> team with the help of our contributors.
                </div>
                <div className='text-gray-500 text-xs'>
                    Version &quot;Next&quot;. Latest update <Link className='text-black font-semibold underline underline-offset-1' href={git['commit']['html_url']}>{git['commit']['commit']['author']['date']}</Link> licensed under <Link className='text-black font-semibold underline underline-offset-1' href='/'>GNU General Public License v3.0</Link> .
                </div>
            </div>
            <div className="grid-cols-1">
                <div className="grid-cols-2">
                    <div className="grid-cols-3"></div>
                </div>
            </div>

        </div>
    )
}

export default Footer