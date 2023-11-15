'use client'

import {
    SignedIn,
    SignedOut,
    SignInButton,
    UserButton,
} from "@clerk/nextjs";

export default function NavbarAvatar() {
    return (
        <div className="flex md:justify-center items-center">
            <SignedIn>
                {/* Mount the UserButton component */}
                <UserButton afterSignOutUrl="/"/>
            </SignedIn>
            <SignedOut>
                {/* Signed out users get sign in button */}
                <SignInButton />
            </SignedOut>
        </div >
    )
}