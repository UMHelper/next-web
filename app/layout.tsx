import './globals.css'
import '@smastrom/react-rating/style.css'

import { Inter } from 'next/font/google'
import React from "react";

import Navbar from "@/components/navbar";
import { cn } from "@/lib/utils";
import Footer from "@/components/footer";
import { Toaster } from "@/components/ui/sonner"
import Script from 'next/script';
import { ClerkProviderClient } from '@/components/providers/clerk-provider-client';
import { Banner } from '@/components/banner';
import { rootMetadata } from '@/lib/seo';
import { JsonLd } from '@/components/seo/json-ld';
import { TimetablePlannerProvider } from '@/components/timetable/planner-provider';
import FloatingPlanner from '@/components/timetable/floating-planner';


const inter = Inter({ subsets: ['latin'] })

export const metadata = rootMetadata;

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="zh-Hant">
                <head>
                    {process.env.GTM_ID ? (
                        <Script id='gtm'>{`(function(w,d,s,l,i){w[l] = w[l] || [];w[l].push({'gtm.start':
                            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
                        j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
                        'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
                            })(window,document,'script','dataLayer','${process.env.GTM_ID}');`}</Script>
                    ) : null}

                    <meta name='theme-color' content='#2563EB' />
                    <meta name='apple-mobile-web-app-status-bar-style' content='#2563EB' />
                    <link rel="manifest" href="/manifest.webmanifest" />
                    <link rel="icon" href="/favicon.png" sizes="any" />
                    <link
                        rel="apple-touch-icon"
                        href="/icon/72.jpg"
                    />
                </head>
                <body className={cn(inter.className)}>
                    <ClerkProviderClient>
                    <JsonLd
                        data={{
                            "@context": "https://schema.org",
                            "@type": "WebSite",
                            name: "What2Reg @ UM 澳大選咩課",
                            url: "https://umeh.top",
                            potentialAction: {
                                "@type": "SearchAction",
                                target: "https://umeh.top/search/course/{search_term_string}",
                                "query-input": "required name=search_term_string",
                            },
                        }}
                    />
                    <TimetablePlannerProvider>
                    <div className='min-h-screen min-w-full'>
                        <Navbar />
                        <Banner />
                        {/* <div className='w-full px-1 py-2 flex flex-col justify-center items-center bg-slate-100 text-slate-800 text-xs space-y-1'>
                            <RotatingText
                                texts={['本網站與澳門大學不隸屬、關聯、授權、認可或以任何方式正式關聯。', 'This website is not affiliated, associated, authorized, endorsed by, or in any way officially connected with the University of Macau.',]}
                                mainClassName="text-black overflow-hidden"
                                staggerFrom={"last"}
                                staggerDuration={0.025}
                                splitLevelClassName="overflow-hidden"
                                transition={{ type: "spring", damping: 30, stiffness: 400 }}
                                rotationInterval={2000}
                            />
                            {/* <div>
                                本網站與澳門大學不隸屬、關聯、授權、認可或以任何方式正式關聯。
                            </div>
                            <div>
                                This website is not affiliated, associated, authorized, endorsed by, or in any way officially connected with the University of Macau.
                            </div> */}
                        {/* </div> */}
                        <div id="page-content">
                            {children}
                        </div>
                    </div>
                    <Footer />
                    <Toaster richColors/>
                    <Toaster 
                        id="admin_notice" 
                        position="top-center" 
                        closeButton 
                        richColors 
                        visibleToasts={1}
                        icons={{
                            error: null
                        }}
                    />
                    <FloatingPlanner />
                    </TimetablePlannerProvider>
                    </ClerkProviderClient>
                </body>
            </html>
    )
}
