import ProfCard from "@/components/prof-card";
import { Masonry } from "@/components/masonry";

import Toolbar from "@/components/toolbar";
import { ArrowUpRightSquare, Frown } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import Link from "next/link";
import { fetchCourseInfo } from "@/lib/database/get-course-info";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import Script from "next/script";
import supabase from '@/lib/database/database';
import { BBSAd } from "@/components/bbs-updates";
import { Viewport } from "next";

export function generateMetadata(
    { params }: { params: any }) {
    const title = `${params.code.toUpperCase()} | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
    }

}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

export async function generateStaticParams() {
    const { data: courses } = await supabase.from('course_noporf').select('New_code')
    if (!courses) {
        return []
    }
    // console.log(courses[0])
    return courses.map((course) => {
        return {
            code: course['New_code']
        }
    })
}

async function CoursePage({ params }: { params: { code: string } }) {

    const code = params.code.toUpperCase()
    const {
        course,
        profList,
        isOffer
    }: {
        course: any,
        profList: any[],
        isOffer: boolean
    }
        = await fetchCourseInfo(code)
        
    return (
        <>
            <div className='bg-gradient-to-r from-blue-600 to-indigo-500 text-white p-3'>
                <div className='max-w-screen-xl mx-auto p-4'>
                    <div className='flex flex-col md:flex-row justify-between'>
                        <div className="py-6">
                            <div className="text-sm pb-2">
                                <Link href={"/search/course/" + course['courseCode'].substring(0, 4)} className="flex space-x-1">
                                    <div>
                                        {course['courseCode'].substring(0, 4)}
                                    </div>
                                    <ArrowUpRightSquare size={12} />
                                </Link>
                            </div>
                            <div className='pb-2 flex-row flex space-x-1'>
                                <div className='text-3xl font-bold space-x-1'>
                                    <span>
                                        <Link href={"/search/course/" + course['courseCode'].substring(0, 4)}>
                                            {course['courseCode'].substring(0, 4)}
                                        </Link>
                                    </span>
                                    <span>{course['courseCode'].substring(4)}</span>
                                </div>
                                {
                                    parseInt(course['courseCode'][4]) <= 4 && (isOffer ?
                                        <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow'> Offered</div>
                                        :
                                        <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>)
                                }
                            </div>
                            <div className='text-xl font-semibold'>{course["courseTitle"]}</div>
                            <div className='text-sm'>{course['offeringProgLevel'] + ' Course, Year ' + parseInt(course['suggestedYearOfStudy'])}</div>
                            {/* <Toolbar course={course} prof={undefined} /> */}
                        </div>
                        <div className='py-6 space-y-4'>
                            <div className='space-y-1'>
                                <div className='flex-row flex space-x-4'>
                                    <div>
                                        <div className='text-xs font-light'>Credits</div>
                                        <div className='text-sm'>{course['credits']}</div>
                                    </div>
                                    <div>
                                        <div className='text-xs font-light'>Dept</div>
                                        <Link className="flex flex-row" href={`/catalog/${course['offeringUnit']}/${course['offeringDept']}`}>
                                            <div className='text-sm'>{course['offeringDept']}</div>
                                            <ArrowUpRightSquare size={8} />
                                        </Link>
                                    </div>
                                    <div>
                                        <div className='text-xs font-light'>Faculty</div>
                                        <Link className="flex flex-row" href={`/catalog/${course['offeringUnit']}`}>
                                            <div className='text-sm'>{course['offeringUnit']}</div>
                                            <ArrowUpRightSquare size={8} />
                                        </Link>
                                    </div>
                                    <div>
                                        <div className='text-xs font-light'>Language</div>
                                        <div className='text-sm'>{course['mediumOfInstruction']}</div>
                                    </div>
                                </div>
                                <div className='flex-row flex space-x-4'>
                                    <div>
                                        <div className='text-xs font-light'>Grading</div>
                                        <div className='text-sm'>{course['gradingSystem']}</div>
                                    </div>

                                    <div>
                                        <div className='text-xs font-light'>Course Type</div>
                                        <div className='text-sm'>{course['courseType']}</div>
                                    </div>
                                    <div>
                                        <div className='text-xs font-light'>Duration</div>
                                        <div className='text-sm'>{course['duration']}</div>
                                    </div>
                                </div>

                            </div>

                            <div className='hover:cursor-pointer'>
                                <Dialog>
                                    <DialogTrigger asChild>
                                        <div className='flex flex-row space-x-1'>
                                            <div className='text-sm'>
                                                Course Description
                                            </div>
                                            <ArrowUpRightSquare size={12} />
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]" >
                                        <DialogHeader>
                                            <DialogTitle>Course Description</DialogTitle>
                                        </DialogHeader>
                                        <div className="py-4 text-sm" style={{
                                            maxHeight: '70vh',
                                            overflowY: 'scroll'
                                        }}>
                                            {course['courseDescription']?.replaceAll('\n', '\n') || "No Course Description"}
                                        </div>
                                        <DialogFooter>
                                            <div className='text-xs italic mt-3'>Data Source: reg.um.edu.mo</div>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>

                                <Dialog>
                                    <DialogTrigger asChild>
                                        <div className='flex flex-row space-x-1'>
                                            <div className='text-sm'>
                                                Intended Learning Outcomes
                                            </div>
                                            <ArrowUpRightSquare size={12} />
                                        </div>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle>Intended Learning Outcomes</DialogTitle>
                                        </DialogHeader>
                                        <div className="py-4 text-sm"
                                            style={{
                                                maxHeight: '70vh',
                                                overflowY: 'scroll',
                                                whiteSpace: "pre-wrap",
                                            }}
                                        >
                                            {course['ilo']?.replaceAll('\n', '\n') || "No Intended Learning Outcomes"}
                                        </div>
                                        <DialogFooter>
                                            <div className='text-xs italic mt-3'>Data Source: reg.um.edu.mo</div>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                            <div className='text-xs italic'>Data Source: reg.um.edu.mo</div>
                        </div>
                    </div>
                </div>
            </div>
            <BBSAd/>
            <div className='max-w-screen-xl mx-auto p-4'>

                <div id="googleBotCourseInfo" className="space-y-3 my-3 hidden">

                    <Alert>
                        <AlertTitle>Course Description</AlertTitle>
                        <AlertDescription>
                            {course['courseDescription']?.replaceAll('\n', '\n') || "No Course Description"}
                        </AlertDescription>
                    </Alert>

                    <Alert>
                        <AlertTitle>Intended Learning Outcomes</AlertTitle>
                        <AlertDescription>
                            {course['ilo']?.replaceAll('\n', '\n') || "No Intended Learning Outcomes"}
                        </AlertDescription>
                    </Alert>
                </div>
                {
                    (profList.length == 0 || profList === undefined) ? (
                        <div className="flex space-x-1 items-center bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent">
                            <div className='text-xl font-semibold py-4'>No Instructor Found</div>
                            <div className="text-indigo-500">
                                <Frown size={24} strokeWidth={2} />
                            </div>
                        </div>

                    ) : (
                        null
                    )
                }
                <Masonry col={3} className={""}>
                    {profList.map((data, index) => {
                        return (
                            <ProfCard key={index} data={data} code={course['courseCode']} />
                        )
                    })}
                </Masonry>
            </div>
            <Script id="show-for-bot">
                {`
                    if (/bot|google|baidu|bing|msn|teoma|slurp|yandex/i.test(navigator.userAgent)) {
                        // console.log('Welcome bot');
                        document.getElementById('googleBotCourseInfo').classList.remove('hidden');
                    }
                    else {
                        document.getElementById('googleBotCourseInfo').classList.add('hidden');
                    }
                    `}
            </Script>
        </>
    )
}

export default CoursePage
