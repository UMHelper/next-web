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

const MobileSidebar=()=>{
    const pathname=usePathname()
    const menuList=menu
    return(
        <div className='md:hidden'>
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
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    )
}
export default MobileSidebar
