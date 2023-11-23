import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import React from "react";

import Navbar from "@/components/navbar";
import { cn, ua_check } from "@/lib/utils";
import Footer from "@/components/footer";
import { Toaster } from '@/components/ui/toaster';
import Script from 'next/script';
import { ClerkProvider } from '@clerk/nextjs';
import { headers } from 'next/headers';
import { NO_ROOT_LAYOUT_LIST } from '@/lib/consant';
import Link from 'next/link';
import UADialog from '@/components/ua-dialog';

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
    title: 'Home | What2Reg @ UM 澳大選咩課',
    description: 'Course review platform for University of Macau',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <ClerkProvider>
            <html lang="en">
                <head>
                    <Script id='gtm'>{`(function(w,d,s,l,i){w[l] = w[l] || [];w[l].push({'gtm.start':
                            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                            })(window,document,'script','dataLayer','${process.env.GTM_ID}');`}</Script>

                    <meta name='theme-color' content='#2563EB' />
                    <meta name='apple-mobile-web-app-status-bar-style' content='#2563EB' />
                    <meta name='viewport' content='width=device-width, initial-scale=1' />
                    <link rel="manifest" href="/manifest.webmanifest" />
                    <link rel="icon" href="/favicon.png" sizes="any" />
                    <link
                        rel="apple-touch-icon"
                        href="/icon/72.jpg"
                    />
                </head>
                <body className={cn(inter.className)}>
                    <div className='min-h-screen min-w-full'>
                        <Navbar />
                        <div className='w-full p-1 flex justify-center items-center bg-slate-100 text-slate-500 text-xs'>
                            <span>This is <span className="font-semibold bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">NEXT Ver. Preview</span>. Please <Link className=' underline' href='https://docs.google.com/forms/d/1_HrH0jJ9Fyxu_dmW1xGsn9Hq1ZtN9nFG-Jangj_BNVk/'>
                                report</Link>  bugs to us.</span>
                        </div>
                        <div>
                            {children}
                        </div>
                    </div>
                    <Footer />
                    <UADialog />
                    <Toaster />
                </body>
            </html>
        </ClerkProvider>
    )
}
