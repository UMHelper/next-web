import MobileSidebar from "@/components/mobile-sidebar";
import NavbarList from "@/components/navbar-list";
import NavbarAvatar from '@/components/navbar-avatar';


const Navbar=()=>{
    return(
        <div className="bg-white border-gray-200 max-w-screen-xl mx-auto p-4 ">
            <div className='flex flex-row justify-between'>
                <NavbarList/>  
                <NavbarAvatar/>
                <MobileSidebar/>
            </div>
        </div>
    )
}

export default Navbar