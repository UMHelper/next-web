'use client'
import { TimetableCard } from '@/components/timetable-cart'
import { useEffect, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { Scheduler } from "@aldabil/react-scheduler";
import { Button } from "@mui/material";

interface CalendarEvent {
    event_id: number | string;
    title: string;
    start: Date;
    end: Date;
    disabled?: boolean;
    color?: string;
    editable?: boolean;
    deletable?: boolean;
    draggable?: boolean;
    allDay?: boolean;
}

const weekDay: any = {
    'MON': 1,
    'TUE': 2,
    'WED': 3,
    'THU': 4,
    'FRI': 5,
}
new Date(
    new Date(
        new Date().setHours(9)).setMinutes(30)
).setDate(
    new Date().getDate() - 2
)
const convertToDate = (time: string, day: string) => {
    const today = new Date()
    const date = new Date(
        new Date(
            new Date(
                new Date(
                    new Date().setHours(parseInt(time[0]))
                ).setMinutes(parseInt(time[1])
                )
            ).setDate(
                today.getDate() + (weekDay[day] - today.getDay())
            ))
    )
    return date
}
const convertToEvents = (timetable: any, index: number) => {
    const event_title = `${timetable.code} ${timetable.prof} ${timetable.section}`
    const events: CalendarEvent[] = []
    timetable.schedules.forEach((schedule: any, schedule_index: number) => {
        const times = schedule.time.split('-')
        const start_time = times[0].split(':')
        const end_time = times[1].split(':')
        const newEvent: CalendarEvent = {
            event_id: `${index}-${schedule_index} ${event_title}`,
            title: `${event_title}`,
            start: convertToDate(start_time, schedule.date),
            end: convertToDate(end_time, schedule.date),
            color: `#${timetable.color}`
        }
        events.push(newEvent)
    })
    return events

}

const TimetableCalendar = () => {
    const [timetableCart, setTimetableCart] = useState<any[]>([])
    const [events, setEvents] = useState<any[]>([])

    const [data, setData] = useLocalStorage<any[]>('timetableCart', [])

    useEffect(() => {
        setTimetableCart(data)
        setEvents([])
        const events: any[] = []
        data.forEach((timetable: any, index: number) => {
            const newEvents = convertToEvents(timetable, index)
            events.push(...newEvents)
        })
        setEvents([...events])
    }, [data])

    return (
        <div>
            {events.length > 0 &&
                <Scheduler
                    view="week"
                    week={
                        {
                            weekDays: [0, 1, 2, 3, 4,],
                            weekStartOn: 1,
                            startHour: 8,
                            endHour: 20,
                            step: 60,
                            navigation: false,
                            disableGoToDay: true,
                            cellRenderer: (props: any) => {
                                return (
                                    <Button disableRipple={true} />
                                )
                            }
                        }
                    }
                    navigation={false}
                    disableViewNavigator={true}
                    editable={false}
                    deletable={false}
                    draggable={false}
                    events={events}
                />}
        </div>
    )
}
const TimetablePage = () => {
    const [timetableCart, setTimetableCart] = useState<any[]>([])

    const [data, setData] = useLocalStorage<any[]>('timetableCart', [])

    useEffect(() => {
        setTimetableCart(data)
    }, [data])
    return (
        <div>
            <div className="text-xl font-bold">Timetable</div>
            <div>Timetable Cart</div>
            <div className="flex flex-row space-x-2 my-2 w-full overflow-x-auto flex-nowrap scroll-smooth">
                {timetableCart.map((timetable: any) => (<TimetableCard key={timetable.code + timetable.prof + timetable.section} timetable={timetable} horizontal />))}
                {
                    timetableCart.length > 0 ? (
                        <div
                            className=" bg-red-500 rounded hover:shadow flex justify-center text-white font-bold min-w-fit px-4 items-center"
                            onClick={() => {
                                setData([])
                            }}
                        >
                            Clear Cart
                        </div>
                    ) :
                        null
                }
            </div>

            <div>Calendar</div>
            <TimetableCalendar />
        </div>
    )
}
export default TimetablePage