import MobileSidebar from "@/components/mobile-sidebar";
import NavbarList from "@/components/navbar-list";
import NavbarAvatar from '@/components/navbar-avatar';
import TimetableCart from "@/components/timetable-cart";
import { UserButton } from "@clerk/nextjs";
import SearchButton from "@/components/search-button";


const Navbar = () => {
    return (
        <div className="sticky top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
            <div className="max-w-screen-xl mx-auto p-4">
                <div className="flex flex-row justify-between">
                    <div className="flex flex-row">
                        <MobileSidebar />
                        <NavbarList />
                    </div>
                    <div className=" space-x-2 flex flex-row justify-end items-center">
                        <div className="flex flex-row space-x-3 items-center">
                            <SearchButton />
                            <TimetableCart />
                            <NavbarAvatar />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Navbar