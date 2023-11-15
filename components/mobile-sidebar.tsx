'use client'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/ui/sheet"
import {AlignJustify} from "lucide-react";
import {menuList as menu} from "@/lib/consant";
import {usePathname} from "next/navigation";
import Link from "next/link";
import TimetableCart from "@/components/timetable-cart";
import NavbarAvatar from "@/components/navbar-avatar";

const MobileSidebar=()=>{
    const pathname=usePathname()
    const menuList=menu
    return(
        <div className='md:hidden w-full h-full flex justify-center items-center'>
            <Sheet>
                <SheetTrigger>
                    <div>
                        <AlignJustify />
                    </div>
                </SheetTrigger>
                <SheetContent>
                    <div className="font-bold flex flex-col p-4 mt-4 space-y-4">
                        {menuList.map((menu:MenuItem)=>{
                            return (
                                <Link href={menu.href}
                                      className={menu.href===pathname?"text-blue-700 px-1 py-2 rounded":
                                          "text-gray-900 hover:bg-gray-100 hover:text-blue-500 px-1 rounded py-2"}
                                      key={menu.href}
                                >
                                    {menu.name}
                                </Link>
                            )
                        })}
                        {/* <div className="flex flex-row space-x-2 px-1">
                            <TimetableCart />
                            <NavbarAvatar />
                        </div> */}
                    </div>
                    
                </SheetContent>
            </Sheet>
        </div>
    )
}
export default MobileSidebar
