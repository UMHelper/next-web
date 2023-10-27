import {Cat} from "lucide-react";
import Link from "next/link";

const Footer = () => {
    return(
        <div className='bg-gray-300/10'>
            <div className='max-w-screen-xl mx-auto p-4 space-y-4 mb-4'>
                <div>
                    <div className="flex flex-wrap items-center justify-start">
                        <Cat size={24} strokeWidth={2} color='rgb(14 165 233)'/>
                        <Link href="/" className="flex items-center mr-10">
                            <span className="self-center text-2xl font-semibold whitespace-nowrap bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">What2Reg @UM</span>
                        </Link>
                    </div>
                </div>

                <div className='flex space-x-4 underline underline-offset-1 font-semibold text-sm'>
                    <Link href='/'>
                        GitHub
                    </Link>
                    <Link href='/'>
                        Terms of Service
                    </Link>
                    <Link href='/'>
                        Community Guidelines
                    </Link>
                    <Link href='/'>
                        Feedback 反饋
                    </Link>
                    <Link href='/'>
                        Sitemap
                    </Link>
                </div>
                <div className='text-gray-500 text-xs'>
                    Designed and built by the <Link className='text-black font-semibold underline underline-offset-1' href='/'>UMHelper</Link> team with the help of <Link className='text-black font-semibold underline underline-offset-1' href='/'>our contributors</Link>.
                </div>
                <div className='text-gray-500 text-xs'>
                    Latest update <Link className='text-black font-semibold underline underline-offset-1' href='/'>2023-08-27T17:38:44Z</Link> licensed under <Link className='text-black font-semibold underline underline-offset-1' href='/'>GNU General Public License v3.0</Link> .
                </div>
            </div>
            <div className="grid-cols-1 grid-cols-2 grid-cols-3">
            </div>

        </div>
    )
}

export default Footer