'use client'
import {Cat} from "lucide-react";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {menuList as menu} from "@/lib/consant";

export default function NavbarList() {
    const pathname=usePathname()
    const menuList=menu
    
  return (
    <div className="flex flex-wrap items-center justify-start space-x-2">
                    <Cat size={24} strokeWidth={2} color='rgb(14 165 233)'/>
                    <Link href="/" className="flex items-center mr-10">
                        <span className="self-center text-2xl font-semibold whitespace-nowrap bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">What2Reg @UM</span>
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
  );
}