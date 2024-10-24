'use client'
import { usePathname } from 'next/navigation'

import {
    SignedIn,
    SignedOut,
    SignInButton,
    UserButton,
} from "@clerk/nextjs";

export default function NavbarAvatar() {
    // TO-DO: pathname is not working
    const pathname = usePathname()
    // console.log(pathname)
    return (
        <div className="flex md:justify-center items-center dark:bg-gray-800 dark:text-white">
            <SignedIn>
                {/* Mount the UserButton component */}
                <UserButton afterSignOutUrl={pathname}/>
            </SignedIn>
            <SignedOut>
                {/* Signed out users get sign in button */}
                <div className='py-1 px-2 ml-2 rounded bg-gradient-to-r from-blue-600 to-indigo-500 text-white'>
                <SignInButton mode="modal" redirectUrl={pathname}>Sign In</SignInButton>
                </div>
            </SignedOut>
        </div >
    )
}
