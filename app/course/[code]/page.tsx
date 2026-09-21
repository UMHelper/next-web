import React, { Suspense } from "react";

import CourseHeader from "@/components/course/course-header";
import CourseInstructors from "@/components/course/course-instructors";
import { CourseGridSkeleton, CourseHeaderSkeleton } from "@/components/loading-skeletons";
import { getCourseInfo, normalizeLocalCourseInfo } from "@/lib/database/get-course-info";
import { buildCourseMetadata } from "@/lib/seo";

export const revalidate = 3600;

export async function generateMetadata(
    { params }: { params: { code: string } }) {
    const code = params.code.toUpperCase()
    const course = normalizeLocalCourseInfo(await getCourseInfo(code), code)
    return buildCourseMetadata({
        code,
        title: course.courseTitle,
        offeringUnit: course.offeringUnit,
        offeringDept: course.offeringDept,
        description: course.courseDescription,
    })
}

export default function CoursePage({ params }: { params: { code: string } }) {
    const code = params.code.toUpperCase()

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
