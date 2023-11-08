'use client'
import createClient from "@/lib/database/database"
import { Auth } from '@supabase/auth-ui-react'
import {
    ThemeSupa,
  } from '@supabase/auth-ui-shared'
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function AuthPage() {
    const [session, setSession] = useState<any>(null)
    const router = useRouter()

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
    if (!session){
        return(
            <div className="flex justify-center items-center flex-row h-screen bg-gradient-to-r from-stone-400 to-slate-500">
                <div className="flex flex-col justify-center items-center">
                    <div className="mb-6 text-xl font-bold text-white">
                        Join Our Community NOW!
                    </div>
                    <div className="shadow-2xl w-96 p-4 rounded-xl bg-white">
                        <Auth 
                        supabaseClient={createClient}
                        appearance={{ theme: ThemeSupa }}
                        providers={[]}
                        />
                    </div>
                </div>
            </div>)
    }
    else{
        router.back()
        // null
    }
    
        
    
}