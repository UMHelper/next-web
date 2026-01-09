import supabase from '@/lib/database/database';

import crypto from 'crypto';
import https from 'https';
import axios from 'axios';

import { getProfListByCourse } from "@/lib/database/get-prof-info";

export const getCourseInfo = async (course_id: string) => {
    const { data, error } = await supabase.from('course_noporf')
        .select('*')
        .eq('New_code', course_id)

    //console.log(data)
    return data ? data[0] : {}
}


const allowLegacyRenegotiationOptions = {
    httpsAgent: new https.Agent({
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    }),
    headers: {
        Authorization: 'f5aaa86cc5b4424aa621538fceaab34f',
    },
};


export async function fetchCourseInfoByUMAPI(code: string) {
    return await axios
        .get('https://api.data.um.edu.mo/service/academic/course_catalog/all?course_code=' + code.toUpperCase(), allowLegacyRenegotiationOptions)
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

export async function fetchCourseInfo(code: string) {
    // console.log('fetching course info for ' + code)
    const course:any = await fetchCourseInfoByUMAPI(code)
    let profList: any = await getProfListByCourse(code)
    // 去除重复的prof_id，只保留一个
    const seenProfIds = new Set()
    profList = profList.filter((prof: any) => {
        if (seenProfIds.has(prof['prof_id'])) {
            return false
        }
        seenProfIds.add(prof['prof_id'])
        return true
    })
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


    
    const course_offer:any=await supabase.from('course_noporf').select('Is_Offered').eq('New_code',code)
    isOffer=course_offer.data[0].Is_Offered===1 || isOffer

    // console.log(course)
    return { course, profList, isOffer }
}

export const fetchCourseListByProf = async ({ name }:{name:string}) => {
    const { data, error }:{data:any,error:any} = await supabase.from('prof_with_course')
    .select('*')
    .eq('prof_id', name)
    // sort data by data.course_id
    data.sort((a:any,b:any)=>a.course_id.localeCompare(b.course_id))
    return {data, error}
}

export const fetchCatalogList = async (departments: string[]) => {
    if (departments.length === 1) {
        if (departments[0].toLowerCase()==='gecourse'){
            const { data, error }: { data: any, error: any } = await supabase.from('course_noporf')
            .select('')
            .like('New_code', 'GE%')
            return data.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code))
        }
        const { data, error }: { data: any, error: any } = await supabase.from('course_noporf')
            .select('')
            .eq('Offering_Unit', departments[0].toUpperCase())
        return data.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code))
    }
    if (departments[0]==='GECourse'){
        const { data, error }: { data: any, error: any } = await supabase.from('course_noporf')
        .select('')
        .like('New_code', `${departments[1]}%`.toUpperCase())
        return data.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code))
    }
    const { data, error }: { data: any, error: any } = await supabase.from('course_noporf')
        .select('')
        .eq('Offering_Unit', departments[0].toUpperCase())
        .eq('Offering_Department', departments[1].toUpperCase())
    return data.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code))

}