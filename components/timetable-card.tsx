'use client'
import { Button } from "@/components/ui/button"
import { ShoppingCart } from "lucide-react"
import Link from "next/link"
import { useLocalStorage } from 'usehooks-ts'

export const TimetableCard = ({ timetable, code, prof }: { timetable: any,code:string, prof:string }) => {
    const [timetableCart, setTimetableCart] = useLocalStorage<any[]>('timetableCart', [])
    if (timetable===undefined || timetable.length === 0) {
        return(
            <div className=" space-y-2 text-sm">
                <div>
                No schedule information found. 
                </div>
                <div className="text-xs">
                Please refer to the official documents of the <span className=" underline"><Link href='https://reg.um.edu.mo'>Registry</Link></span>.
                </div>
            </div>
        )
    }
    return (
        <div className="space-y-4">
            {
                timetable.map((schedules: any) => {
                    return(
                        <div key={schedules['section']} className="">
                        <div className="bg-slate-100 rounded p-1 text-base">
                            Section {schedules['section']}
                        </div>
                        <div className="py-2">
                        {
                            schedules['schedules'].map((schedule: any) => {
                                return(
                                    <div className="grid grid-cols-3 py-1 px-1 text-sm" key={schedule['date']}>
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
                        <Button 
                            size='xs' 
                            className="bg-gradient-to-r hover:from-purple-500 hover:to-blue-500 text-slate-100 from-purple-600 to-blue-600 hover:shadow"
                            onClick={() => {
                                const isExist=timetableCart.find((timetable: any) =>{
                                    return  timetable['section'] === schedules['section'] && timetable['code'] === code
                                })
                                if(isExist){
                                    return
                                }
                                setTimetableCart([...timetableCart, {...schedules,code:code,prof:prof.replaceAll('%20', ' '),color:Math.floor(Math.random() * 16777215).toString(16)}])
                            }}
                            disabled={timetableCart.find((timetable: any) => timetable['section'] === schedules['section'] && timetable['code'] === code)}
                            >
                            <ShoppingCart size={14} strokeWidth={2} className="m-1"/> Add to Schedule Cart
                        </Button>
                        </div>
                    )
                })
            }
            <div className="text-xs italic text-gray-500">
            Data Source: reg.um.edu.mo
            </div>
        </div>
    )
}
export default TimetableCard
