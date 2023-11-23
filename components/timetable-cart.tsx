'use client'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ShoppingCart } from "lucide-react"
import { useLocalStorage } from 'usehooks-ts'
import { X } from "lucide-react"
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { usePathname } from 'next/navigation'
import Link from "next/link";

export const TimetableCard = (
    { timetable: {
        schedules,
        code,
        prof,
        section
    }, horizontal = false }: {
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
        <div className={cn("border p-4 rounded hover:shadow", horizontal ? "inline-table min-w-fit" : "")}>
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
                {timetableCart.map((timetable: any) => (<TimetableCard key={timetable.code + timetable.prof + timetable.section} timetable={timetable} />))}
            </div>
            {
                timetableCart.length > 0 ? (
                    <div
                        className="w-full bg-gradient-to-r from-red-400 to-orange-500 rounded hover:shadow flex justify-center text-white font-bold my-1 py-1"
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
    const isTimetablePage = usePathname().split('/')[1] === 'timetable'
    const [open, setOpen] = useState(false);
    const wait = () => new Promise((resolve) => setTimeout(resolve, 100));
    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger>
                {!isTimetablePage && (<div>
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
                <div
                    onClick={() => {
                        wait().then(() => setOpen(false));
                    }}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded hover:shadow flex justify-center text-white font-bold py-1 my-1"
                >
                    <Link
                        href={'/timetable'}>
                        Go to Timetable
                    </Link>
                </div>
                <TimetableList />
            </SheetContent>
        </Sheet>

    )

}

export default TimetableCart;