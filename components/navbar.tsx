import MobileSidebar from "@/components/mobile-sidebar";
import NavbarList from "@/components/navbar-list";
import NavbarAvatar from '@/components/navbar-avatar';
import TimetableCart from "@/components/timetable-cart";


const Navbar = () => {
    return (
        <div className="bg-white border-gray-200 max-w-screen-xl mx-auto p-4 ">
            <div className='flex flex-row justify-between'>
                <NavbarList />
                <div className=" space-x-4 flex flex-row justify-center items-center">
                    <div className="flex flex-row space-x-2">
                        <TimetableCart />
                        <NavbarAvatar />
                    </div>
                    <MobileSidebar />
                </div>
            </div>
        </div>
    )
}

export default Navbar