'use client'
import { useEffect, useState } from "react"
import { Masonry } from "@/components/masonry"
import CourseCard from "@/components/course_card"
import { countUniqueValues, courseKeysToCount, CourseFilterName } from "@/lib/count-unique-values"
import { SelectValue, Select, SelectTrigger, SelectContent, SelectGroup, SelectItem } from "@/components/ui/select"

export default function CourseFilter({ data }: { data: any[] }) {
    const [courseList, setCourseList] = useState(data)
    const [option, setOption] = useState<any>({})

    const [currentCourseList, setCurrentCourseList] = useState(data)

    const [filter, setFilter] = useState<any>({
        'Course_Duration': 'All',
        'Credits': 'All',
        'Is_Offered': 'All',
        'Medium_of_Instruction': 'All',
        'Offering_Department': 'All',
        'Offering_Unit': 'All',
        'courseType': 'All',
        'offeringProgLevel': 'All',
        'suggestedYearOfStudy': 'All'
    })

    useEffect(() => {
        const option = countUniqueValues(data, courseKeysToCount)
        console.log(option.Offering_Unit)
        setOption(option)
    }, [data])

    useEffect(() => {
        let curCourseList = [...courseList]
        for (const key in filter) {
            if (filter[key] !== 'All') {
                curCourseList = curCourseList.filter((course) => {
                    return course[key] === filter[key]
                })
            }
        }
        setCurrentCourseList([...curCourseList])
    }, [filter, courseList])


    return (
        <div>
            <div className="grid grid-cols-3 md:grid-cols-6 my-4 gap-2">
                {
                    option[courseKeysToCount[0]] && courseKeysToCount.map((key, index) => {
                        return (
                            <div key={index} className="text-sm text-slate-600">
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
                {currentCourseList.map((course, index) => {
                    return <CourseCard data={course} key={index} />
                })}
            </Masonry>
        </div>
    )
}