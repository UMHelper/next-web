'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

const CsBanner = () => {
    const pathname=usePathname()
    const [isCS, setIsCS] = useState(false)
    useEffect(() => {
        // console.log(pathname.split('/')[1],pathname.split('/')[2])
        const path=pathname.split('/')
        if (path.length===3){
            setIsCS(path[2].startsWith('CISC'))
        }
        else if (path.length>=4){
            setIsCS(path[3].startsWith('CISC')||path[2].startsWith('CISC')||path[3].startsWith('CIS'))
        }
        else{
            setIsCS(false)
        }
    }, [pathname])
    if (!isCS) return null
    return (
        <div className='w-full p-1 flex justify-center items-center bg-slate-100 text-black text-xs break-all flex-wrap'>
            💻 如果你喜歡coding，有興趣為 <span className="font-semibold bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">What2Reg @ UM</span> 出一分力，歡迎你<Link href="https://github.com/UMHelper/Feedback-and-Join-Us" className=" underline">加入我們</Link>！💻
        </div>
    )
}

export default CsBanner