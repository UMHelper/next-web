"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useLocalStorage } from "usehooks-ts";

import SearchForm from "@/components/search/search-form";
import { TimetableCartItem } from "@/components/timetable-cart";

const LazyTimetableCalendar = dynamic(() => import("@/components/timetable-calendar"), {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse rounded bg-slate-100" />,
})

const SearchBar = () => (
  <div>
    <div className="mb-2 text-sm font-medium">Search Courses or Instructors</div>
    <SearchForm variant="header" />
  </div>
);
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
                    {timetableCart.map((timetable: any) => (<TimetableCartItem key={timetable.code + timetable.prof + timetable.section} timetable={timetable} horizontal />))}
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