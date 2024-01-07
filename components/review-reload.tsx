'use client'
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from "react"

export const ReviewReload=()=>{
    const route = useRouter()
    const searchParams = useSearchParams();
    const pathname = usePathname()
    useEffect(() => {
        if (searchParams.get('reload') === '1') {
            route.refresh()
            route.replace(pathname)
        }
    }, [searchParams, route, pathname])
    return null
}