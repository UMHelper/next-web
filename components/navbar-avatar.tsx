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
        <div className="flex md:justify-center items-center min-w-full">
            <SignedIn>
                {/* Mount the UserButton component */}
                <UserButton afterSignOutUrl={pathname}/>
            </SignedIn>
            <SignedOut>
                {/* Signed out users get sign in button */}
                <SignInButton />
            </SignedOut>
        </div >
    )
}