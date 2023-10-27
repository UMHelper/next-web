import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import React from "react";

import Navbar from "@/components/navbar";
import {cn} from "@/lib/utils";
import Footer from "@/components/footer";

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'What 2 REG @UM',
  description: 'Course review platform for University of Macau',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={cn(inter.className )}>
          <div className='min-h-screen'>
            <Navbar/>
            <div>
                {children}
            </div>
          </div>
          <Footer/>
      </body>
    </html>
  )
}
