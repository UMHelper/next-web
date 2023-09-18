import {Cat} from "lucide-react";
import Link from "next/link";

const Footer = () => {
    return(
        <div className='bg-gray-500/10'>
            <div className='max-w-screen-xl mx-auto p-4'>
                <div className="flex flex-wrap items-center justify-start">
                    <Cat size={24} strokeWidth={2} color='rgb(14 165 233)'/>
                    <Link href="/" className="flex items-center mr-10">
                        <span className="self-center text-2xl font-semibold whitespace-nowrap bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">What2Reg @UM</span>
                    </Link>
                </div>
                <div className="flex flex-wrap items-center justify-start">
                    <Link href="/" className="flex items-center mr-10">
                        <span className="self-center text-base font-semibold whitespace-nowrap bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">Built by UMHelper</span>
                    </Link>
                </div>
            </div>
        </div>
    )
}

export default Footer