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
            setIsCS(path[2].startsWith('CISC')|| path[2].startsWith('ISOM'))
        }
        else if (path.length>=4){
            setIsCS(path[3].startsWith('CISC')||path[2].startsWith('CISC')||path[3].startsWith('CIS')||path[3].startsWith('ISOM')||path[2].startsWith('ISOM'))
        }
        else{
            setIsCS(false)
        }
    }, [pathname])
    return null
    if (!isCS) return null
    return (
        <div className='w-full px-1 py-2 flex justify-center items-center bg-slate-100 text-black text-xs break-words flex-wrap'>
            💻 如果你有興趣參與 <span className="font-semibold bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">What2Reg @ UM</span> 開發中，歡迎你 <Link href="https://github.com/UMHelper/Feedback-and-Join-Us" className=" underline">加入UMHelper Dev Group</Link>！我們使用 Next.js 進行全棧開發 💻
        </div>
    )
}

export default CsBanner