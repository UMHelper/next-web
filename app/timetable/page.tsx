'use client'
import { TimetableCard } from '@/components/timetable-cart'
import { useEffect, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { Scheduler } from "@aldabil/react-scheduler";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Button } from "@mui/material";
import Link from 'next/link';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

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
    data: any;
}

const weekDay: any = {
    'MON': 1,
    'TUE': 2,
    'WED': 3,
    'THU': 4,
    'FRI': 5,
}

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
            color: `#${timetable.color}`,
            data: { ...schedule, ...timetable },
            editable: false,
            deletable: false,
            draggable: false,
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
                    eventRenderer={({ event, ...props }) => {
                        return (
                            <div className="flex flex-col justify-center items-center w-full h-full md:text-xs text-[10px]" style={{
                                backgroundColor: event.color,
                            }}>
                                <Link href={`/reviews/${event.data.code}/${event.data.prof}`}>
                                    <div>{`${event.data.code}-${event.data.section}`}</div>
                                    <div>{event.data.time}</div>
                                    <div>{event.data.location}</div>
                                </Link>

                            </div>
                        )
                    }
                    }
                />}
        </div>
    )
}

const SearchBar = () => {
    const formSchema = z.object({
        code: z.string()
            .min(4, {
                message: "Search Keywords must be at least 4 characters.",
            })
            .max(10, { message: 'Search Keywords must be at most 10 characters.' }),
        is_prof: z.boolean().default(false)
    })
    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            code: "",
            is_prof: false,
        },
    })
    const router = useRouter()
    function onSubmit(values: z.infer<typeof formSchema>) {
        if (is_prof) {
            router.push('/search/instructor/' + values["code"].toUpperCase())
        }
        else {
            router.push('/search/course/' + values["code"].toUpperCase())
        }

    }
    const [is_prof, set_is_prof] = useState(false)

    return (
        <Form {...form}>
            <div>
                {is_prof ? "Search Instructors" : "Search Courses"}
            </div>
            <div className='flex justify-between items-center'>
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex space-x-2">
                    <FormField
                        control={form.control}
                        name="code"
                        render={({ field }) => (
                            <FormItem>
                                <FormControl>
                                    <Input
                                        placeholder={is_prof ? "e.g., CHAN Tai Man" : "e.g., ACCT1000 or Accounting"}
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <ShadcnButton type="submit" className='bg-gradient-to-r from-blue-600 to-indigo-500 text-white'>
                        <Search size={20} /> Search
                    </ShadcnButton>
                </form>
                <FormField
                    control={form.control}
                    name="is_prof"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-2 mb-1">
                            <div className='my-0 flex items-center space-x-2'>
                                <div>
                                    <FormLabel className="text-base">
                                        <FormField
                                            control={form.control}
                                            name="is_prof"
                                            render={({ field }) => (
                                                <FormItem className="flex flex-row items-center space-x-2 mb-1">
                                                    <FormControl>
                                                        <Switch
                                                            checked={field.value}
                                                            onCheckedChange={(e) => {
                                                                field.onChange(e)
                                                                set_is_prof(!is_prof)
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <div className='my-0 flex items-center space-x-2'>
                                                        <div>
                                                            <FormLabel className="text-base">
                                                                Search Instructors
                                                            </FormLabel>
                                                            <FormDescription >
                                                                搜索講師
                                                            </FormDescription>
                                                        </div>
                                                    </div>
                                                </FormItem>
                                            )}
                                        />
                                    </FormLabel>
                                </div>
                            </div>
                        </FormItem>
                    )}
                />
            </div>
        </Form>
    )

}
const TimetablePage = () => {
    const [timetableCart, setTimetableCart] = useState<any[]>(['none'])

    const [data, setData] = useLocalStorage<any[]>('timetableCart', [])

    useEffect(() => {
        setTimetableCart(data)
    }, [data])

    if (timetableCart.length === 1 && timetableCart[0] === 'none') {
        return (
            <div className="w-full h-screen flex justify-center items-center flex-col space-y-8">
                <div className="text-4xl font-black racking-widest bg-gradient-to-r from-teal-400 via-violet-400 to-blue-500 bg-clip-text text-transparent">
                    Generateing your timetable... XD
                </div>
            </div>
        )
    }

    if (timetableCart.length === 0) {
        return (
            <div className="w-full h-screen flex justify-center items-center flex-col space-y-8">
                <div className="text-4xl font-black racking-widest bg-gradient-to-r from-teal-400 via-violet-400 to-blue-500 bg-clip-text text-transparent">
                    NO course in your timetable cart, add some!
                </div>
            </div>
        )
    }
    else {
        return (
            <div>
                <div className="text-xl font-bold">Timetable</div>
                <SearchBar />
                <div>Timetable Cart</div>
                <div className="flex flex-row space-x-2 my-2 w-full overflow-x-auto flex-nowrap scroll-smooth">
                    {timetableCart.map((timetable: any) => (<TimetableCard key={timetable.code + timetable.prof + timetable.section} timetable={timetable} horizontal />))}
                    {
                        timetableCart.length > 0 ? (
                            <div
                                className="bg-gradient-to-r from-red-400 to-orange-500 rounded hover:shadow flex justify-center text-white font-bold min-w-fit px-4 items-center"
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
}
export default TimetablePage