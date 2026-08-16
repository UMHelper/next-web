import supabaseServer from '@/lib/supabase/server';
import supabaseAdmin from '@/lib/supabase/admin';
import { unstable_cache } from 'next/cache';

import crypto from 'crypto';
import https from 'https';
import axios from 'axios';

import { getProfListByCourse } from "@/lib/database/get-prof-info";

export const getCourseInfo = async (course_id: string) => {
    const { data, error } = await supabaseServer.from('course_noporf')
        .select('*')
        .eq('New_code', course_id)

    //console.log(data)
    return data ? data[0] : {}
}

const normalizeText = (value: unknown) => {
    if (value == null) return null
    const text = String(value).trim()
    return text.length > 0 ? text : null
}

const normalizeLocalCourseInfo = (courseInfo: any, code: string) => ({
    courseCode: code.toUpperCase(),
    courseTitle: normalizeText(courseInfo['courseTitleEng']) ?? "Unknown Course",
    courseTitleChi: normalizeText(courseInfo['courseTitleChi']) ?? null,
    offeringProgLevel: normalizeText(courseInfo['offeringProgLevel']) ?? "Unknown",
    suggestedYearOfStudy: String(courseInfo['suggestedYearOfStudy'] ?? "0"),
    credits: normalizeText(courseInfo['Credits']) ?? "0",
    offeringDept: normalizeText(courseInfo['Offering_Department']) ?? "Unknown",
    offeringUnit: normalizeText(courseInfo['Offering_Unit']) ?? "Unknown",
    mediumOfInstruction: normalizeText(courseInfo['Medium_of_Instruction']) ?? "Unknown",
    gradingSystem: normalizeText(courseInfo['gradingSystem']) ?? "Unknown",
    courseType: normalizeText(courseInfo['courseType']) ?? "Unknown",
    duration: normalizeText(courseInfo['Course_Duration']) ?? "Unknown",
    courseDescription: normalizeText(courseInfo['courseDescription']) ?? null,
    ilo: normalizeText(courseInfo['ilo']) ?? null,
})

const hasCompleteCourseInfo = (courseInfo: any) => {
    return Boolean(
        normalizeText(courseInfo['courseTitleEng']) &&
        normalizeText(courseInfo['offeringProgLevel']) &&
        normalizeText(courseInfo['Credits']) &&
        normalizeText(courseInfo['Offering_Department']) &&
        normalizeText(courseInfo['Offering_Unit']) &&
        normalizeText(courseInfo['Medium_of_Instruction']) &&
        normalizeText(courseInfo['gradingSystem']) &&
        normalizeText(courseInfo['courseType']) &&
        normalizeText(courseInfo['Course_Duration']) &&
        normalizeText(courseInfo['courseDescription']) &&
        normalizeText(courseInfo['ilo'])
    )
}

const mapRemoteCourseInfoToLocalPatch = (courseInfo: any, localCourseInfo: any, code: string) => ({
    New_code: code.toUpperCase(),
    courseTitleEng: normalizeText(courseInfo['courseTitle']) ?? normalizeText(localCourseInfo['courseTitleEng']),
    offeringProgLevel: normalizeText(courseInfo['offeringProgLevel']) ?? normalizeText(localCourseInfo['offeringProgLevel']),
    suggestedYearOfStudy: courseInfo['suggestedYearOfStudy'] ?? localCourseInfo['suggestedYearOfStudy'],
    Credits: normalizeText(courseInfo['credits']) ?? normalizeText(localCourseInfo['Credits']),
    Offering_Department: normalizeText(courseInfo['offeringDept']) ?? normalizeText(localCourseInfo['Offering_Department']),
    Offering_Unit: normalizeText(courseInfo['offeringUnit']) ?? normalizeText(localCourseInfo['Offering_Unit']),
    Medium_of_Instruction: normalizeText(courseInfo['mediumOfInstruction']) ?? normalizeText(localCourseInfo['Medium_of_Instruction']),
    gradingSystem: normalizeText(courseInfo['gradingSystem']) ?? normalizeText(localCourseInfo['gradingSystem']),
    courseType: normalizeText(courseInfo['courseType']) ?? normalizeText(localCourseInfo['courseType']),
    Course_Duration: normalizeText(courseInfo['duration']) ?? normalizeText(localCourseInfo['Course_Duration']),
    courseDescription: normalizeText(courseInfo['courseDescription']) ?? normalizeText(localCourseInfo['courseDescription']),
    ilo: normalizeText(courseInfo['ilo']) ?? normalizeText(localCourseInfo['ilo']),
})


const allowLegacyRenegotiationOptions = {
    httpsAgent: new https.Agent({
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    }),
    timeout: 10000,
    headers: {
        Authorization: 'f5aaa86cc5b4424aa621538fceaab34f',
    },
};

const fetchCourseInfoByUMAPIUncached = async (code: string) => {
    return await axios
        .get('https://api.data.um.edu.mo/service/academic/course_catalog/all?course_code=' + code.toUpperCase(), allowLegacyRenegotiationOptions)
        .then(response => {
            if (response.data['_embedded'][0] != undefined) {
                return response.data['_embedded'][0];
            }
            return null
        })
        .catch(function (error) {
            console.error(error)
            return null
        });
}

export const fetchCourseInfoByUMAPI = unstable_cache(
    async (code: string) => fetchCourseInfoByUMAPIUncached(code),
    ['um-course-catalog-fallback'],
    { revalidate: 86400 }
)

export async function fetchCourseInfo(code: string) {
    const [localCourse, profList] = await Promise.all([
        getCourseInfo(code),
        getProfListByCourse(code),
    ])

    let course = normalizeLocalCourseInfo(localCourse, code)

    if (!hasCompleteCourseInfo(localCourse)) {
        const remoteCourse = await fetchCourseInfoByUMAPI(code)

        if (remoteCourse) {
            course = {
                courseCode: code.toUpperCase(),
                courseTitle: normalizeText(remoteCourse['courseTitle']) ?? course.courseTitle,
                courseTitleChi: course.courseTitleChi ?? null,
                offeringProgLevel: normalizeText(remoteCourse['offeringProgLevel']) ?? course.offeringProgLevel,
                suggestedYearOfStudy: String(remoteCourse['suggestedYearOfStudy'] ?? course.suggestedYearOfStudy),
                credits: normalizeText(remoteCourse['credits']) ?? course.credits,
                offeringDept: normalizeText(remoteCourse['offeringDept']) ?? course.offeringDept,
                offeringUnit: normalizeText(remoteCourse['offeringUnit']) ?? course.offeringUnit,
                mediumOfInstruction: normalizeText(remoteCourse['mediumOfInstruction']) ?? course.mediumOfInstruction,
                gradingSystem: normalizeText(remoteCourse['gradingSystem']) ?? course.gradingSystem,
                courseType: normalizeText(remoteCourse['courseType']) ?? course.courseType,
                duration: normalizeText(remoteCourse['duration']) ?? course.duration,
                courseDescription: normalizeText(remoteCourse['courseDescription']) ?? course.courseDescription,
                ilo: normalizeText(remoteCourse['ilo']) ?? course.ilo,
            }

            const localPatch = mapRemoteCourseInfoToLocalPatch(course, localCourse, code)
            const { error } = await supabaseAdmin.from('course_noporf').upsert([localPatch], {
                onConflict: 'New_code',
            })

            if (error) {
                console.error(error)
            }
        }
    }

    const isOffer = localCourse['Is_Offered'] === 1 || (profList ?? []).some((prof: any) => prof['is_offered'])

    return { course, profList, isOffer }
}

export const fetchCourseListByProf = async ({ name }:{name:string}) => {
    const { data, error }:{data:any,error:any} = await supabaseServer.from('prof_with_course')
    .select('*')
    .eq('prof_id', name)
    // sort data by data.course_id
    const courseList = data ?? []
    courseList.sort((a:any,b:any)=>a.course_id.localeCompare(b.course_id))
    return {data: courseList, error}
}

export const fetchCatalogList = async (departments: string[]) => {
    if (departments.length === 1) {
        if (departments[0].toLowerCase()==='gecourse'){
            const { data, error }: { data: any, error: any } = await supabaseServer.from('course_noporf')
            .select('')
            .like('New_code', 'GE%')
            return data.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code))
        }
        const { data, error }: { data: any, error: any } = await supabaseServer.from('course_noporf')
            .select('')
            .eq('Offering_Unit', departments[0].toUpperCase())
        return data.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code))
    }
    if (departments[0]==='GECourse'){
        const { data, error }: { data: any, error: any } = await supabaseServer.from('course_noporf')
        .select('')
        .like('New_code', `${departments[1]}%`.toUpperCase())
        return data.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code))
    }
    const { data, error }: { data: any, error: any } = await supabaseServer.from('course_noporf')
        .select('')
        .eq('Offering_Unit', departments[0].toUpperCase())
        .eq('Offering_Department', departments[1].toUpperCase())
    return data.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code))

}
