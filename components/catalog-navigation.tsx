'use client'
import { faculty } from "@/lib/consant"
import Link from "next/link"
import { usePathname } from 'next/navigation'

const CatalogNavigation = () => {
    const pathname = usePathname()
    const currentFaculty = pathname.split('/')[2]
    return (
        <div className="flex flex-col md:flex-row md:space-x-2 space-y-2 md:space-y-0">
            {faculty.map((fac, index) => {
                return (
                    <div key={index} className={fac===currentFaculty?"text-blue-700 px-1 rounded bg-gray-200":
                    "text-gray-900 hover:bg-gray-100 hover:text-blue-500 px-1 rounded"}>
                        <Link href={`/catalog/${fac}`}>{fac}</Link>
                    </div>
                )
            })}
        </div>
    )
}

export default CatalogNavigation