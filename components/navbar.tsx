import MobileSidebar from "@/components/mobile-sidebar";
import NavbarList from "@/components/navbar-list";
import NavbarAvatar from '@/components/navbar-avatar';
import TimetableCart from "@/components/timetable-cart";
import { UserButton } from "@clerk/nextjs";
import SearchButton from "@/components/search-button";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

const Navbar = () => {
    const [isDarkMode, setIsDarkMode] = useState(false);

    const toggleDarkMode = () => {
        setIsDarkMode(!isDarkMode);
        if (isDarkMode) {
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.add('dark');
        }
    };

    return (
        <div className="bg-white border-gray-200 max-w-screen-xl mx-auto p-4 ">
            <div className='flex flex-row justify-between'>
                <div className="flex flex-row">
                <MobileSidebar />
                <NavbarList />
                </div>
                <div className=" space-x-2 flex flex-row justify-end items-center">
                    <div className="flex flex-row space-x-3 items-center">
                        <SearchButton />
                        <TimetableCart />
                        <NavbarAvatar />
                        <Switch checked={isDarkMode} onCheckedChange={toggleDarkMode} />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Navbar
