'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

// Historically the CS banner targeted CISC/ISOM only. CSCI is the new
// curriculum code for the same CS courses, so both generations must match.
const CS_COURSE_PREFIXES = ["CISC", "CSCI", "ISOM"]
const CS_CATALOG_PREFIXES = ["CISC", "CSCI", "CIS", "CSC", "ISOM"]

function startsWithAny(value: string | undefined, prefixes: string[]) {
    if (!value) return false
    const normalized = value.toUpperCase()
    return prefixes.some((prefix) => normalized.startsWith(prefix))
}

const CsBanner = () => {
    const pathname=usePathname()
    const [isCS, setIsCS] = useState(false)
    useEffect(() => {
        const path=pathname.split('/')
        if (path.length===3){
            setIsCS(startsWithAny(path[2], CS_COURSE_PREFIXES))
        }
        else if (path.length>=4){
            setIsCS(
                startsWithAny(path[2], CS_COURSE_PREFIXES)
                || startsWithAny(path[3], CS_CATALOG_PREFIXES)
            )
        }
        else{
            setIsCS(false)
        }
    }, [pathname])
    // if (!isCS) return null
    return (
        <div className='w-full px-1 py-2 flex justify-center items-center bg-muted text-foreground text-xs break-words flex-wrap'>
            如果你有興趣參與 <span className="font-semibold bg-gradient-to-r from-wordmark-from to-wordmark-to bg-clip-text text-transparent">What2Reg @ UM</span> 项目，歡迎 <Link href="https://github.com/UMHelper/Feedback-and-Join-Us" className=" underline">加入UMHelper Dev Group！</Link>我們使用 Next.js 和 Agent 進行全棧開發。
        </div>
    )
}

export default CsBanner