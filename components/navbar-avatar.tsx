'use client'
import { usePathname } from 'next/navigation'

import {
    Show,
    SignInButton,
    UserButton,
} from "@clerk/nextjs";

export default function NavbarAvatar() {
    // TO-DO: pathname is not working
    const pathname = usePathname()
    // console.log(pathname)
    return (
        <div className="flex md:justify-center items-center">
            <Show when="signed-in">
                {/* Mount the UserButton component */}
                <UserButton />
            </Show>
            <Show when="signed-out">
                {/* Signed out users get sign in button */}
                <div className='py-1 px-2 ml-2 rounded bg-gradient-to-r from-brand-from to-brand-to text-white'>
                <SignInButton mode="modal" fallbackRedirectUrl={pathname}>Sign In</SignInButton>
                </div>
            </Show>
        </div >
    )
}
