'use client'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ShoppingCart } from "lucide-react"
import { useLocalStorage } from 'usehooks-ts'
import { X } from "lucide-react"
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePathname } from 'next/navigation'

export const TimetableCard = (
    { timetable: {
        schedules,
        code,
        prof,
        section
    },horizontal=false }: {
        timetable: {
            schedules: any[],
            code: string,
            prof: string,
            section: string
        },
        horizontal?: boolean
    }) => {
    const [timetableCart, setTimetableCart] = useState<any[]>([])

    const [data, setData] = useLocalStorage<any[]>('timetableCart', [])

    useEffect(() => {
        setTimetableCart(data)
    }, [data])
    return (
        <div className={cn("border p-4 rounded hover:shadow",horizontal?"inline-table min-w-fit":"")}>
            <div className="flex flex-row justify-between">
                <div>
                    <div className="font-bold">{code}</div>
                    <div>{prof}</div>
                    <div className="text-sm">{`Section ${section}`}</div>
                </div>
                <div onClick={() => {
                    // find code and section in timetableCart and remove it
                    const newTimetableCart = timetableCart.filter((timetable: any) => {
                        return timetable['section'] !== section || timetable['code'] !== code
                    })
                    setData([...newTimetableCart])
                }}>
                    <X className="h-3 w-3" />
                </div>
            </div>
            <div>
                {
                    schedules.map((schedule: any) => {
                        return (
                            <div className="grid grid-cols-3 py-1 text-sm" key={schedule['date']}>
                                <div>
                                    {schedule['date']}
                                </div>
                                <div>
                                    {schedule['time']}
                                </div>
                                <div>
                                    {schedule['location']}
                                </div>
                            </div>
                        )
                    })
                }
            </div>
        </div>
    )
}

export const TimetableList = () => {
    const [timetableCart, setTimetableCart] = useState<any[]>([])

    const [data, setData] = useLocalStorage<any[]>('timetableCart', [])

    useEffect(() => {
        setTimetableCart(data)
    }, [data])
    return (
        <div>
            <div className="my-2 space-y-2">
                {timetableCart.map((timetable: any) => (<TimetableCard key={timetable.code + timetable.prof + timetable.section} timetable={timetable}/>))}
            </div>
            {
                timetableCart.length > 0 ? (
                    <div
                        className="w-full bg-red-500 rounded hover:shadow flex justify-center text-white font-bold"
                        onClick={() => {
                            setData([])
                        }}
                    >
                        Clear Cart
                    </div>
                ) : null
            }
        </div>
    )
}

const TimetableCart = () => {
    const isTimetablePage = usePathname().split('/')[1]==='timetable'
    return (
        <Sheet>
            <SheetTrigger>
                {!isTimetablePage&&(<div>
                    <ShoppingCart size={20} strokeWidth={2} />
                </div>)}
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Timetable Cart</SheetTitle>
                    <SheetDescription>
                        Manage your timetable cart here.
                    </SheetDescription>
                </SheetHeader>
                <TimetableList />
            </SheetContent>
        </Sheet>

    )

}

export default TimetableCart;