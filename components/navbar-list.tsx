'use client'
import { Cat } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { menuList as menu, type MenuItem } from "@/lib/consant";

import { Badge } from "@/components/ui/badge"
import { useTimetablePlanner } from "@/components/timetable/planner-provider"

export default function NavbarList() {
    const pathname = usePathname()
    const menuList = menu
    const { activePlan } = useTimetablePlanner()
    const timetableCount = activePlan?.payload.sections.length ?? 0

    return (
        <div className="flex flex-wrap items-center justify-start ">
                <Link href="/" className="flex items-center mr-10">
                    <Cat size={24} strokeWidth={2} className="me-2 text-brand-logo"/>
                    <div className="self-center font-semibold whitespace-nowrap bg-gradient-to-r from-wordmark-from to-wordmark-to bg-clip-text text-transparent">
                    <div className="text-lg">What2Reg @UM</div>
                    <div className="text-xs">澳大選咩課</div>
                    </div>
                </Link>
            <div className="hidden w-full md:block md:w-auto">
                <div className="font-medium flex flex-col p-4 md:p-0 mt-4 border border-border-subtle rounded-lg bg-surface-subtle md:flex-row md:space-x-8 md:mt-0 md:border-0 md:bg-background">
                    {menuList.map((menu: MenuItem) => {
                        return (
                            <div className="flex flex-row items-center justify-start space-x-0.5" key={menu.href}>
                            <Link href={menu.href}
                                className={menu.href === pathname ? "text-brand-strong px-1 rounded" :
                                    "text-foreground hover:bg-muted hover:text-brand px-1 rounded"}
                                key={menu.href}
                            >
                                {menu.name}

                            </Link>
                                {menu.name==="Timetable" && timetableCount != 0 ? <Badge variant={'umeh'}>{timetableCount}</Badge>: null}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}