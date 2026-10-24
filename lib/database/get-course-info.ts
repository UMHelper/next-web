import supabaseServer from '@/lib/supabase/server';
import { unstable_cache } from 'next/cache';

import { getProfListByCourse } from "@/lib/database/get-prof-info";
import { normalizeEquivalentCodes, resolveCourseCode } from "@/lib/database/course-equivalences";
import { pickBestProfRow } from "@/lib/database/prof-merge";
import { CACHE_TAGS } from "@/lib/cache-tags";
import type { CourseRow, ProfWithCourseRow } from "@/lib/database/types";
import { GE_COURSE_SLUG, normalizeFacultySlug } from "@/lib/consant";

/**
 * Catalog reads use `course_catalog`, which only exposes primary codes and
 * attaches historical codes as `equivalent_codes`. A request for an old code is
 * resolved to its primary first.
 */
export const getCourseInfo = unstable_cache(
    async (course_id: string): Promise<CourseRow> => {
        const normalized = course_id.trim().toUpperCase();
        const primary = await resolveCourseCode(normalized);

        const { data, error } = await supabaseServer
            .from("course_catalog")
            .select("*")
            .eq("New_code", primary)
            .maybeSingle();

        if (error) {
            console.error("[getCourseInfo] query failed:", error.message);
            return {} as CourseRow;
        }

        if (data) return data as CourseRow;

        // Fallback for a code that exists but has no catalog row (for example a
        // legacy code whose primary row has not been inserted yet).
        const { data: fallback, error: fallbackError } = await supabaseServer
            .from("course_noporf")
            .select("*")
            .eq("New_code", primary)
            .maybeSingle();

        if (fallbackError) {
            console.error("[getCourseInfo] fallback query failed:", fallbackError.message);
            return {} as CourseRow;
        }

        return (fallback as CourseRow) ?? ({} as CourseRow);
    },
    ["course-info"],
    { revalidate: 3600, tags: [CACHE_TAGS.course, CACHE_TAGS.catalog] },
);

const normalizeText = (value: unknown) => {
    if (value == null) return null
    const text = String(value).trim()
    return text.length > 0 ? text : null
}

export const normalizeLocalCourseInfo = (courseInfo: any, code: string) => {
    const courseCode = normalizeText(courseInfo['New_code']) ?? code.toUpperCase();
    const equivalentCodes = normalizeEquivalentCodes(courseInfo['equivalent_codes'])
        .filter((value) => value !== courseCode);

    return {
        courseCode,
        equivalentCodes,
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
    }
}

export async function fetchCourseInfo(code: string) {
    const [localCourse, profList] = await Promise.all([
        getCourseInfo(code),
        getProfListByCourse(code),
    ])

    const primary = normalizeText(localCourse['New_code']) ?? code.trim().toUpperCase()
    const course = normalizeLocalCourseInfo(localCourse, primary)
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

        const { data: equivalenceRows } = await supabaseServer
            .from("course_equivalences")
            .select("primary_code,equivalent_code");

        const primaryByEquivalent = new Map<string, string>();
        for (const row of equivalenceRows ?? []) {
            if (row.equivalent_code && row.primary_code) {
                primaryByEquivalent.set(String(row.equivalent_code), String(row.primary_code));
            }
        }

        const grouped = new Map<string, ProfWithCourseRow[]>();
        for (const row of (data ?? []) as ProfWithCourseRow[]) {
            const primary = primaryByEquivalent.get(String(row.course_id)) ?? String(row.course_id);
            if (!primary) continue;
            const bucket = grouped.get(primary) ?? [];
            bucket.push({ ...row, course_id: primary });
            grouped.set(primary, bucket);
        }

        const courseList = [...grouped.entries()]
            .map(([primary, rows]) => pickBestProfRow(rows, primary))
            .sort((a, b) => String(a.course_id).localeCompare(String(b.course_id)));

        return { data: courseList, error: null };
    },
    ["prof-course-list"],
    { revalidate: 3600, tags: [CACHE_TAGS.professor, CACHE_TAGS.course] },
);

export const fetchCatalogList = unstable_cache(
    async (departments: string[]): Promise<CourseRow[]> => {
        let query = supabaseServer.from("course_catalog").select("");

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
