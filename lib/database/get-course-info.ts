import supabaseServer from '@/lib/supabase/server';
import { unstable_cache } from 'next/cache';

import { getProfListByCourse } from "@/lib/database/get-prof-info";
import { CACHE_TAGS } from "@/lib/cache-tags";
import type { CourseRow } from "@/lib/database/types";
import { GE_COURSE_SLUG, normalizeFacultySlug } from "@/lib/consant";

export const getCourseInfo = unstable_cache(
    async (course_id: string): Promise<CourseRow> => {
        const { data, error } = await supabaseServer
            .from("course_noporf")
            .select("*")
            .eq("New_code", course_id);

        if (error) {
            console.error("[getCourseInfo] query failed:", error.message);
            return {} as CourseRow;
        }

        return (data?.[0] as CourseRow) ?? ({} as CourseRow);
    },
    ["course-info"],
    { revalidate: 3600, tags: [CACHE_TAGS.course, CACHE_TAGS.catalog] },
);

const normalizeText = (value: unknown) => {
    if (value == null) return null
    const text = String(value).trim()
    return text.length > 0 ? text : null
}

export const normalizeLocalCourseInfo = (courseInfo: any, code: string) => ({
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

export async function fetchCourseInfo(code: string) {
    const [localCourse, profList] = await Promise.all([
        getCourseInfo(code),
        getProfListByCourse(code),
    ])

    const course = normalizeLocalCourseInfo(localCourse, code)
    const isOffer = localCourse['Is_Offered'] === 1 || (profList ?? []).some((prof: any) => prof['is_offered'])

    return { course, profList, isOffer }
}

export const fetchCourseListByProf = unstable_cache(
    async ({ name }: { name: string }) => {
        const { data, error }: { data: any, error: any } = await supabaseServer
            .from("prof_with_course")
            .select("*")
            .eq("prof_id", name);

        if (error) {
            console.error("[fetchCourseListByProf] query failed:", error.message);
            return { data: [], error };
        }

        const courseList = (data ?? []) as unknown as CourseRow[];
        courseList.sort((a: any, b: any) => a.course_id.localeCompare(b.course_id));
        return { data: courseList, error: null };
    },
    ["prof-course-list"],
    { revalidate: 3600, tags: [CACHE_TAGS.professor, CACHE_TAGS.course] },
);

export const fetchCatalogList = unstable_cache(
    async (departments: string[]): Promise<CourseRow[]> => {
        let query = supabaseServer.from("course_noporf").select("");

        const unit = normalizeFacultySlug(departments[0]);

        if (departments.length === 1) {
            if (unit === GE_COURSE_SLUG) {
                query = query.like("New_code", "GE%");
            } else {
                query = query.eq("Offering_Unit", unit);
            }
        } else if (unit === GE_COURSE_SLUG) {
            query = query.like("New_code", `${departments[1]}%`.toUpperCase());
        } else {
            query = query
                .eq("Offering_Unit", unit)
                .eq("Offering_Department", departments[1].toUpperCase());
        }

        const { data, error } = await query;
        if (error) {
            console.error("[fetchCatalogList] query failed:", error.message);
        }

        const courseList = (data ?? []) as unknown as CourseRow[];
        return courseList.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code));
    },
    ["catalog-list"],
    { revalidate: 3600, tags: [CACHE_TAGS.catalog, CACHE_TAGS.course] },
);
