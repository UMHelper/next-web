import ProfCard from "@/components/prof_card";
import { Masonry } from "@/components/masonry";
import { getProfListByCourse } from "@/lib/database/prof-list-by-course";

import crypto from 'crypto';
import https from 'https';
import axios from 'axios';
import Toolbar from "@/components/toolbar";
import { ArrowUpRightSquare } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import Link from "next/link";
import { getCourseInfo } from "@/lib/database/course-info";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

import Script from "next/script";


export function generateMetadata(
    { params }: { params: any }) {
    const title = `${params.code} | What2Reg @ UM 澳大選咩課 @UM`

    return {
        title: title,
    }

}

const allowLegacyRenegotiationOptions = {
    httpsAgent: new https.Agent({
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    }),
    headers: {
        Authorization: 'Bearer bfa9b6c0-3f4f-3b1f-92c4-1bdd885a1ca2',
    },
};


async function fetchCourseInfo(code: string) {
    return await axios
        .get('https://api.data.um.edu.mo/service/academic/course_catalog/v1.0.0/all?course_code=' + code.toUpperCase(), allowLegacyRenegotiationOptions)
        .then(async response => {
            if (response.data['_embedded'][0] != undefined)
                return response.data['_embedded'][0];
            else {
                // empty response, fallback to local data
                const course_info = await getCourseInfo(code);
                return ({
                    'courseCode': code.toUpperCase(),
                    'courseTitle': course_info['courseTitleEng'],
                    'offeringProgLevel': course_info['offeringProgLevel'],
                    'suggestedYearOfStudy': course_info['suggestedYearOfStudy'],
                    'credits': course_info['Credits'],
                    'offeringDept': course_info['Offering_Department'],
                    'offeringUnit': course_info['Offering_Unit'],
                    'mediumOfInstruction': course_info['Medium_of_Instruction'],
                    'gradingSystem': course_info['gradingSystem'],
                    'courseType': course_info['courseType'],
                    'duration': course_info['Course_Duration'],
                    'courseDescription': String(course_info['courseDescription']),
                    'ilo': String(course_info['ilo']),
                })
            }

        })
        .catch(function (error) {
            return ({
                'courseCode': code.toUpperCase(),
                'courseTitle': 'Error: ' + error.toString(),
                'offeringProgLevel': 'Error',
                'suggestedYearOfStudy': 'Error',
                'credits': 'Error',
                'offeringDept': 'Error',
                'offeringUnit': 'Error',
                'mediumOfInstruction': 'Error',
                'gradingSystem': 'Error',
                'courseType': 'Error',
                'duration': 'Error',
                'courseDescription': error.toString(),
                'ilo': error.toString(),
            })
        });
}

async function fetchData(code: string) {
    const course = await fetchCourseInfo(code)
    const profList: any = await getProfListByCourse(code)
    profList.sort((a: any, b: any) => {
        if (a['is_offered'] && !b['is_offered']) return -1
        else if (!a['is_offered'] && b['is_offered']) return 1
        else return 0
    })
    let isOffer = false
    for (const prof of profList) {
        if (prof['is_offered']) {
            isOffer = true
            break
        }
    }
    ////console.log(course)
    return { course, profList, isOffer }
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
        = await fetchData(code)
    //console.log(course)
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
                                    isOffer ?
                                        <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-green-600 to-green-600 h-fit py-0.5 px-2 shadow'> Offered</div>
                                        :
                                        <div className='text-sm font-semibold rounded-3xl bg-gradient-to-r from-neutral-700 to-stone-900 h-fit py-0.5 px-2 shadow'> Not Offered</div>
                                }
                            </div>
                            <div className='text-xl font-semibold'>{course["courseTitle"]}</div>
                            <div className='text-sm'>{course['offeringProgLevel'] + ' Course, Year ' + course['suggestedYearOfStudy']}</div>
                            <Toolbar course={course} prof={undefined} />
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
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle>Course Description</DialogTitle>
                                        </DialogHeader>
                                        <div className="py-4 text-sm">
                                            {course['courseDescription'].replaceAll('\n', '<br />')}
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
                                            <DialogTitle>Course Description</DialogTitle>
                                        </DialogHeader>
                                        <div className="py-4 text-sm" style={{ whiteSpace: "pre-wrap" }}>
                                            {course['ilo']}
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
            <div className='max-w-screen-xl mx-auto p-4'>

                <div id="googleBotCourseInfo" className="space-y-3 my-3">

                    <Alert>
                        <AlertTitle>Course Description</AlertTitle>
                        <AlertDescription>
                            {course['courseDescription'].replaceAll('\n', '<br />')}
                        </AlertDescription>
                    </Alert>

                    <Alert>
                        <AlertTitle>Intended Learning Outcomes</AlertTitle>
                        <AlertDescription>
                            {course['ilo']}
                        </AlertDescription>
                    </Alert>
                </div>
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
                        console.log('Welcome bot');
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
