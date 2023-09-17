'use client'
import React from "react";
import {usePathname} from "next/navigation";

export default function CourseLayout({children,}: { children: React.ReactNode }){
    return(
        <div>
            {children}
        </div>
    )
}