'use client'
import {
    Sheet,
    SheetContent,
    SheetTrigger,
} from "@/components/ui/sheet"
import { AlignJustify } from "lucide-react";
import { menuList as menu, type MenuItem } from "@/lib/consant";
import { usePathname } from "next/navigation";
import Link from "next/link";
import NavbarAvatar from "@/components/navbar-avatar";
import { SignInButton, Show } from "@clerk/nextjs";
import { useState } from "react";
import SearchButton from "@/components/search-button";
import { ThemeOptions } from "@/components/theme-toggle";

const MobileSidebar = () => {
    const pathname = usePathname()
    const menuList = menu
    const [open, setOpen] = useState(false);
    const wait = () => new Promise((resolve) => setTimeout(resolve, 100));
    return (
        <div className='md:hidden h-full flex justify-center items-center pr-2'>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger>
                    <div>
                        <AlignJustify />
                    </div>
                </SheetTrigger>
                <SheetContent>
                    <div className="px-4 pt-6">
                        <div className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Theme
                        </div>
                        <ThemeOptions />
                    </div>
                    <div className="font-bold flex flex-col p-4 mt-4 space-y-4" onClick={()=>{
                        wait().then(() => setOpen(false));
                    }}>
                        {menuList.map((menu: MenuItem) => {
                            return (
                                <Link href={menu.href}
                                    className={menu.href === pathname ? "text-brand-strong px-1 py-2 rounded" :
                                        "text-foreground hover:bg-muted hover:text-brand px-1 rounded py-2"}
                                    key={menu.href}
                                >
                                    {menu.name}
                                </Link>
                            )
                        })}
                        <div className="flex justify-start items-center px-1 py-2">
                        <div className="flex flex-row space-x-2">
                        {/* <SearchButton /> */}
                        
                        </div>
                        <Show when="signed-out">
                            <SignInButton mode="modal" fallbackRedirectUrl={pathname}/>
                        </Show>
                        </div>
                    </div>

                </SheetContent>
            </Sheet>
        </div>
    )
}
export default MobileSidebar
