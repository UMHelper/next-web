'use client'
import React, {useState} from "react";
import {usePathname, useRouter} from "next/navigation";
import {Switch} from "@/components/ui/switch";
import {router} from "next/client";

export default function RootLayout({children,}: { children: React.ReactNode }) {
    const pathname = usePathname()
    const pathname_list=pathname.split('/')

    const [is_prof, setIsProf]=useState(pathname_list[2]==='instructor')

    const router = useRouter()

    const [keywords,setKeywords]=useState(pathname_list[3].toUpperCase())
    const handleOnCheckedChange=()=>{
        if (is_prof){
            pathname_list[2]='course'
        }
        else {
            pathname_list[2]='instructor'
        }

        setIsProf(!is_prof)
        const url=pathname_list.join('/')
        router.push(url)
    }
    return (
        <div className='max-w-screen-xl mx-auto p-4 space-y-4'>
            <div className='text-2xl font-semibold'>
                You are searching: {keywords}
            </div>
            <div className='flex space-x-2'>
                <Switch checked={is_prof} onCheckedChange={handleOnCheckedChange}/>
                <div className='text-gray-800'>
                    搜講師 Search by instructors
                </div>
            </div>
            {children}
        </div>
    )
}