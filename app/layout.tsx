import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import React from "react";

import Navbar from "@/components/navbar";
import { cn } from "@/lib/utils";
import Footer from "@/components/footer";
import { Toaster } from '@/components/ui/toaster';
import Script from 'next/script';
import { ClerkProvider } from '@clerk/nextjs';
import { headers } from 'next/headers';
import { NO_ROOT_LAYOUT_LIST } from '@/lib/consant';

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
  const headersList = headers();
  const header_url = headersList.get('x-pathname') || "";
  // console.log(header_url);
  const isRootLayout = NO_ROOT_LAYOUT_LIST.indexOf(header_url.split('/')[0]);
  // console.log(isRootLayout === -1);
  if (!isRootLayout) {
    return (
      <ClerkProvider>
        <html lang="en">
          <head>
            <Script
              async
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID}`}
              strategy="lazyOnload"
              crossOrigin="anonymous"
            />
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${process.env.NEXT_PUBLIC_MEASUREMENT_ID}');
  `}
            </Script>
            <Script id='clarity'>
              {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "jnvvhmdtgl");
    `}
            </Script>
            <link rel="icon" href="/favicon.png" sizes="any" />
            <link
              rel="apple-touch-icon"
              href="/favicon.png"
              sizes="any"
            />
          </head>
          <body className={cn(inter.className,"w-full h-screen flex justify-center items-center")}>
            {children}
          </body>
        </html>
      </ClerkProvider>
    )
  }

  return (
    <ClerkProvider>
      <html lang="en">
        <head>
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_GOOGLE_ADS_CLIENT_ID}`}
            strategy="lazyOnload"
            crossOrigin="anonymous"
          />
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
    window.dataLayer = window.dataLayer || [];
    function gtag(){window.dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${process.env.NEXT_PUBLIC_MEASUREMENT_ID}');
  `}
          </Script>
          <Script id='clarity'>
            {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "jnvvhmdtgl");
    `}
          </Script>
          <link rel="icon" href="/favicon.png" sizes="any" />
          <link
            rel="apple-touch-icon"
            href="/favicon.png"
            sizes="any"
          />
        </head>
        <body className={cn(inter.className)}>
          <div className='min-h-screen min-w-full'>
            <Navbar />
            <div>
              {children}
            </div>
          </div>
          <Footer />
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  )
}
