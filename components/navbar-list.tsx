'use client'
import { Cat } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { menuList as menu } from "@/lib/consant";

import { Badge } from "@/components/ui/badge"
import { useLocalStorage } from 'usehooks-ts'

export default function NavbarList() {
    const pathname = usePathname()
    const menuList = menu
    const [timetableCart, setTimetableCart] = useLocalStorage<any[]>('timetableCart', [])

    return (
        <div className="flex flex-wrap items-center justify-start ">
                <Link href="/" className="flex items-center mr-10">
                    <Cat size={24} strokeWidth={2} color='rgb(14 165 233)' className="me-2"/>
                    <span className="hidden md:flex self-center text-lg md:text-2xl font-semibold whitespace-nowrap bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">What2Reg @UM</span>
                </Link>
            <div className="hidden w-full md:block md:w-auto">
                <div className="font-medium flex flex-col p-4 md:p-0 mt-4 border border-gray-100 rounded-lg bg-gray-50 md:flex-row md:space-x-8 md:mt-0 md:border-0 md:bg-white">
                    {menuList.map((menu: MenuItem) => {
                        return (
                            <div className="flex flex-row items-center justify-start space-x-0.5" key={menu.href}>
                            <Link href={menu.href}
                                className={menu.href === pathname ? "text-blue-700 px-1 rounded" :
                                    "text-gray-900 hover:bg-gray-100 hover:text-blue-500 px-1 rounded"}
                                key={menu.href}
                            >
                                {menu.name}

                            </Link>
                                {menu.name==="Timetable" && timetableCart.length!=0 ? <Badge variant={'umeh'}>{timetableCart.length}</Badge>: null}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}