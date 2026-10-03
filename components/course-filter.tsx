'use client'
import { useEffect, useState } from "react"
import { Masonry } from "@/components/masonry"
import CourseCard from "@/components/course-card"
import { TrackSearchResults } from "@/components/analytics/track-search-results"
import { trackFilterApply, type ItemListName, type SearchScope } from "@/lib/analytics/events"
import { withAdSlots, type AdConfig } from "@/lib/ads/ad-slots"
import { countUniqueValues, courseKeysToCount, CourseFilterName } from "@/lib/count-unique-values"
import {
    applyCourseFilters,
    createInitialFilterState,
    nextFilterState,
    type CourseFilterState,
} from "@/lib/course-filters"
import { SelectValue, Select, SelectTrigger, SelectContent, SelectGroup, SelectItem } from "@/components/ui/select"

type CourseFilterProps = {
    data: any[]
    ads: AdConfig | null
    listName: ItemListName
    /** 只有搜索结果页会传：传了就上报一次 view_search_results（目录页不传，因此不上报）。 */
    trackResults?: { term: string; scope: SearchScope }
}

export default function CourseFilter({ data, ads, listName, trackResults }: CourseFilterProps) {
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
            {trackResults ? (
                <TrackSearchResults
                    term={trackResults.term}
                    scope={trackResults.scope}
                    resultCount={data.length}
                />
            ) : null}
            <div className="grid grid-cols-2 md:grid-cols-6 my-4 gap-2">
                {
                    option[courseKeysToCount[0]] && courseKeysToCount.map((key, index) => {
                        return (
                            <div key={index} className="text-sm text-muted-foreground">
                                <div className="pb-1">
                                    {CourseFilterName[key]}
                                </div>
                                <Select disabled={option[key]?.length === 1} defaultValue={option[key][0]} onValueChange={(value) => {
                                    const next = nextFilterState(filter, key, value)
                                    trackFilterApply({
                                        name: key,
                                        value,
                                        resultCount: applyCourseFilters(data, next).length,
                                    })
                                    setFilter(next)
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
