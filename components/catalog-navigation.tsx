'use client'
import { faculty } from "@/lib/consant"
import Link from "next/link"
import { usePathname } from 'next/navigation'

const CatalogNavigation = () => {
    const pathname = usePathname()
    const currentFaculty = pathname.split('/')[2]
    return (
        <div className="flex flex-row flex-wrap py-2">
            {faculty.map((fac, index) => {
                return (
                    <div key={index} className={(fac===currentFaculty?"text-blue-700 bg-gray-200":
                    "text-gray-900 hover:bg-gray-100 hover:text-blue-500") + " py-2 px-3 me-3 my-1 rounded" } >
                        <Link href={`/catalog/${fac}`}>{fac}</Link>
                    </div>
                )
            })}
        </div>
    )
}

export default CatalogNavigation