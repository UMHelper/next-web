'use client'
import { useEffect, useState } from "react"
import { Masonry } from "@/components/masonry"
import CourseCard from "@/components/course-card"
import type { ItemListName } from "@/lib/analytics/events"
import { withAdSlots, type AdConfig } from "@/lib/ads/ad-slots"
import { countUniqueValues, courseKeysToCount, CourseFilterName } from "@/lib/count-unique-values"
import { SelectValue, Select, SelectTrigger, SelectContent, SelectGroup, SelectItem } from "@/components/ui/select"
import {
    applyCourseFilters,
    createInitialFilterState,
    type CourseFilterState,
} from "@/lib/course-filters"

export default function CourseFilter({ data, ads, listName }: { data: any[]; ads: AdConfig | null; listName: ItemListName }) {
    const [option, setOption] = useState<any>({})

    const [currentCourseList, setCurrentCourseList] = useState(data)

    const [filter, setFilter] = useState<CourseFilterState>(createInitialFilterState)

    useEffect(() => {
        const option = countUniqueValues(data, courseKeysToCount)
        //console.log(option.Offering_Unit)
        setOption(option)
    }, [data])

    useEffect(() => {
        setCurrentCourseList(applyCourseFilters(data, filter))

        if (typeof window === "undefined") return
        const params = new URLSearchParams()
        for (const [key, value] of Object.entries(filter)) {
            if (value !== "All") params.set(key, String(value))
        }
        const query = params.toString()
        window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname)
    }, [data, filter])


    return (
        <div>
            <div className="grid grid-cols-2 md:grid-cols-6 my-4 gap-2">
                {
                    option[courseKeysToCount[0]] && courseKeysToCount.map((key, index) => {
                        return (
                            <div key={index} className="text-sm text-muted-foreground">
                                <div className="pb-1">
                                    {CourseFilterName[key]}
                                </div>
                                <Select disabled={option[key]?.length === 1} defaultValue={option[key][0]} onValueChange={(e) => {
                                    let option: any = { ...filter }
                                    if (key === 'Is_Offered') {
                                        if (e === "All") {
                                            option.Is_Offered = e
                                        }
                                        if (e === "Offered") {
                                            option.Is_Offered = 1
                                        }
                                        if (e === "Not Offered") {
                                            option.Is_Offered = 0
                                        }
                                        return setFilter(option)
                                    }
                                    option[key] = e
                                    setFilter(option)
                                }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={CourseFilterName[key]} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            {
                                                option[key]?.length === 1 ? (
                                                    <SelectItem value={option[key][0]}>{option[key][0]}</SelectItem>
                                                ) : (
                                                    option[key]?.map((value: any, index: number) => {
                                                        return <SelectItem value={value} key={index}>{value}</SelectItem>
                                                    })
                                                )
                                            }
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                        )
                    })
                }
            </div>
            <Masonry col={3} className="mx-auto">
                {withAdSlots(currentCourseList, {
                    getKey: (course: any) => String(course.New_code ?? course.courseCode),
                    renderItem: (course: any, index: number) => (
                        <CourseCard
                            data={course}
                            key={course.New_code ?? course.courseCode}
                            listName={listName}
                            position={index}
                        />
                    ),
                    ads,
                })}
            </Masonry>
        </div>
    )
}