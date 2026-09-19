'use client'
import { TimetableCard } from '@/components/timetable-cart'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useLocalStorage } from 'usehooks-ts'
import { Button as ShadcnButton } from "@/components/ui/button";
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

const LazyTimetableCalendar = dynamic(() => import("@/components/timetable-calendar"), {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded bg-slate-100" />,
})

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
                        <FormItem className="hidden md:block flex flex-row items-center space-x-2 mb-1">
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
            <div>
                <div className="text-xl font-bold">Timetable</div>
                <SearchBar />
                <div className='pt-20 text-center text-2xl font-black racking-widest bg-gradient-to-r from-teal-400 via-violet-400 to-blue-500 bg-clip-text text-transparent'>
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
                <LazyTimetableCalendar timetable={timetableCart} />
            </div>
        )
    }
}
export default TimetablePage