import React, { Suspense } from "react";
import { permanentRedirect } from "next/navigation";

import CourseHeader from "@/components/course/course-header";
import CourseInstructors from "@/components/course/course-instructors";
import { CourseGridSkeleton, CourseHeaderSkeleton } from "@/components/loading-skeletons";
import { resolveCourseCode } from "@/lib/database/course-equivalences";
import { getCourseInfo, normalizeLocalCourseInfo } from "@/lib/database/get-course-info";
import { buildCourseMetadata } from "@/lib/seo";

export const revalidate = 3600;

type CoursePageProps = {
    params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: CoursePageProps) {
    const { code: rawCode } = await params;
    const requested = rawCode.toUpperCase()
    const code = await resolveCourseCode(requested)

    // Redirect during metadata resolution so the response can still be a real
    // 308 instead of a streamed client-side redirect.
    if (code !== requested) permanentRedirect(`/course/${encodeURIComponent(code)}`)

    const course = normalizeLocalCourseInfo(await getCourseInfo(code), code)
    return buildCourseMetadata({
        code,
        title: course.courseTitle,
        offeringUnit: course.offeringUnit,
        offeringDept: course.offeringDept,
        description: course.courseDescription,
    })
}

export default async function CoursePage({ params }: CoursePageProps) {
    const { code: rawCode } = await params;
    const requested = rawCode.toUpperCase()
    const code = await resolveCourseCode(requested)

    // Old code URLs permanently move to the new primary code. Review pages do
    // the same so search engines only keep one canonical URL per course.
    if (code !== requested) permanentRedirect(`/course/${encodeURIComponent(code)}`)

    return (
        <>
            <Suspense fallback={<CourseHeaderSkeleton />}>
                <CourseHeader code={code} />
            </Suspense>
            <Suspense fallback={<CourseGridSkeleton count={6} />}>
                <CourseInstructors code={code} />
            </Suspense>
        </>
    )
}
