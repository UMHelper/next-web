'use client'
import { faculty } from "@/lib/consant"
import Link from "next/link"
import { usePathname } from 'next/navigation'

const CatalogNavigation = () => {
    const pathname = usePathname()
    const currentFaculty = pathname.split('/')[2]
    return (
        <div className="flex flex-col md:flex-row md:space-x-2 space-y-2 md:space-y-0">
            {faculty.map((faculty, index) => {
                return (
                    <div key={index} className={faculty===pathname?"text-blue-700 px-1 rounded":
                    "text-gray-900 hover:bg-gray-100 hover:text-blue-500 px-1 rounded"}>
                        <Link href={`/catalog/${faculty}`}>{faculty}</Link>
                    </div>
                )
            })}
        </div>
    )
}

export default CatalogNavigation