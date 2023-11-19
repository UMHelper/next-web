import MobileSidebar from "@/components/mobile-sidebar";
import NavbarList from "@/components/navbar-list";
import NavbarAvatar from '@/components/navbar-avatar';
import TimetableCart from "@/components/timetable-cart";
import { UserButton } from "@clerk/nextjs";
import SearchButton from "@/components/search-button";


const Navbar = () => {
    return (
        <div className="bg-white border-gray-200 max-w-screen-xl mx-auto p-4 ">
            <div className='flex flex-row justify-between'>
                <NavbarList />
                <div className=" space-x-4 flex flex-row justify-center items-center">
                    <div className=" hidden md:flex flex-row space-x-2 items-center">
                        <SearchButton />
                        <TimetableCart />
                        <NavbarAvatar />
                    </div>
                    <div className="md:hidden">
                        <UserButton afterSignOutUrl={'/'} />
                    </div>
                    <MobileSidebar />
                </div>
            </div>
        </div>
    )
}

export default Navbar