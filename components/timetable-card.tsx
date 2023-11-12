import { Button } from "@/components/ui/button"
import { ShoppingCart } from "lucide-react"

export const TimetableCard = ({ timetable }: { timetable: any }) => {
    //console.log(timetable)
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
                        <Button size='xs' className="bg-gradient-to-r from-purple-600 to-blue-600 text-slate-100">
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
