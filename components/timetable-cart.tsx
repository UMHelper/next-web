'use client'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ShoppingCart } from "lucide-react"
import { useEffect } from "react";
import { useLocalStorage } from 'usehooks-ts'
import { X } from "lucide-react"

const TimetableCard = (
    { timetable: {
        schedules,
        code,
        prof,
        section
    } }: {
        timetable: {
            schedules: any[],
            code: string,
            prof: string,
            section: string
        }
    }) => {
    const [timetableCart, setTimetableCart] = useLocalStorage<any[]>('timetableCart', [])
    return (
        <div className=" border p-4 rounded hover:shadow">
            <div className="flex flex-row justify-between">
                <div>
                    <div className="font-bold">{code}</div>
                    <div>{prof}</div>
                    <div className="text-sm">{`Section ${section}`}</div>
                </div>
                <div onClick={() => {
                    // find code and section in timetableCart and remove it
                    const newTimetableCart = timetableCart.filter((timetable: any) => {
                        return timetable['section'] !== section && timetable['code'] !== code
                    })
                    setTimetableCart([...newTimetableCart])
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

const TimetableCart = () => {
    const [timetableCart, setTimetableCart] = useLocalStorage<any[]>('timetableCart', [])
    useEffect(() => {
        console.log(timetableCart)
    }, [timetableCart])
    return (
        <Sheet>
            <SheetTrigger>
                <div>
                    <ShoppingCart size={16} strokeWidth={2} />
                </div>
            </SheetTrigger>
            <SheetContent>
                <SheetHeader>
                    <SheetTitle>Timetable Cart</SheetTitle>
                    <SheetDescription>
                        Manage your timetable cart here.
                    </SheetDescription>
                </SheetHeader>
                <div className="my-2 space-y-2">
                    {timetableCart.map((timetable: any) => (<TimetableCard key={timetable.code + timetable.prof + timetable.section} timetable={timetable} />))}
                </div>
                {
                    timetableCart.length > 0 ? (
                        <div
                            className="w-full bg-red-500 rounded hover:shadow flex justify-center text-white font-bold"
                            onClick={() => {
                                setTimetableCart([])
                            }}
                        >
                            Clear Cart
                        </div>
                    ) : null
                }
            </SheetContent>
        </Sheet>

    )

}

export default TimetableCart;