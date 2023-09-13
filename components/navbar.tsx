'use client'

import Link from "next/link";
import {usePathname} from "next/navigation";

interface MenuItem{
    name:string,
    href:string
}
const Navbar=()=>{
    const pathname=usePathname()
    const menuList:MenuItem[]=[
        {
            name:'Home',
            href:"/"
        },
        {
            name:'Catalog',
            href:"/catalog"
        },
        {
            name:'Timetable',
            href:"/timetable"
        },
        {
            name:'Feedback',
            href:"/feedback"
        },
        {
            name:'Whole @UM',
            href:"/whole"
        }
    ]
    return(
        <div className="bg-white border-gray-200">
            <div className="flex flex-wrap items-center justify-start">
                <Link href="/" className="flex items-center mr-10">
                    <span className="self-center text-2xl font-semibold whitespace-nowrap">What2Reg @UM</span>
                </Link>
                <div className="hidden w-full md:block md:w-auto">
                    <div className="font-medium flex flex-col p-4 md:p-0 mt-4 border border-gray-100 rounded-lg bg-gray-50 md:flex-row md:space-x-8 md:mt-0 md:border-0 md:bg-white">
                        {menuList.map((menu:MenuItem)=>{
                            return (
                                <Link href={menu.href}
                                    className={menu.href===pathname?"text-blue-700 px-1 rounded":
                                        "text-gray-900 hover:bg-gray-100 hover:text-blue-500 px-1 rounded"}
                                    key={menu.href}
                                >
                                    {menu.name}
                                </Link>
                            )
                        })}
                    </div>
                </div>
            </div>
            <div className='text-xs text-gray-400'>
                Built by UMHelper
            </div>
        </div>
    )
}

export default Navbar