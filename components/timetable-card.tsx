'use client'
import { Button } from "@/components/ui/button"
import { ShoppingCart } from "lucide-react"
import { useLocalStorage } from 'usehooks-ts'

export const TimetableCard = ({ timetable, code, prof }: { timetable: any,code:string, prof:string }) => {
    const [timetableCart, setTimetableCart] = useLocalStorage<any[]>('timetableCart', [])
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
                                setTimetableCart([...timetableCart, {...schedules,code:code,prof:prof.replaceAll('%20', ' ')}])
                            }}
                            disabled={timetableCart.find((timetable: any) => timetable['section'] === schedules['section'] && timetable['code'] === code)}
                            >
                            <ShoppingCart size={14} strokeWidth={2} className="m-1"/> Add to Schedule Cart
                        </Button>
                        </div>
                    )
                })
            }
        </div>
    )
}
export default TimetableCard
