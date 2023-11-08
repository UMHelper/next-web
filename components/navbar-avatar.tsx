'use client'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";
import createClient from "@/lib/database/database";
import Link from "next/link";

export default function NavbarAvatar() {
    const [session, setSession] = useState<any>(null)
    useEffect(() => {
        createClient.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
          })
    
          const {
            data: { subscription },
          } = createClient.auth.onAuthStateChange((_event, session) => {
            setSession(session)
          })
    
          return () => subscription.unsubscribe()
    }, [])
    return (
        <div className="hidden md:flex justify-center items-center">
                {session ? (
                    <DropdownMenu>
                    <DropdownMenuTrigger>
                    <Avatar>
                        <AvatarImage src="https://github.com/shadcn.png" alt="@shadcn" />
                        <AvatarFallback>CN</AvatarFallback>
                    </Avatar>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>{session.user.email}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <div onClick={async ()=>{
                            createClient.auth.signOut()
                            }}>
                            Logout
                            </div>    
                        </DropdownMenuItem>
                        {/* <DropdownMenuItem>Billing</DropdownMenuItem>
                        <DropdownMenuItem>Team</DropdownMenuItem>
                        <DropdownMenuItem>Subscription</DropdownMenuItem> */}
                    </DropdownMenuContent>
                </DropdownMenu>
                ):(
                    <div className="space-x-1">
                        <Link href='/auth' className="text-sm">
                        Sign in
                        </Link>
                    </div>
                )}
        </div>
    )
}