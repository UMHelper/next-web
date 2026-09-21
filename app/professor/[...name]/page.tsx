import React, { Suspense } from 'react';

import { CourseGridSkeleton } from '@/components/loading-skeletons';
import { Masonry } from '@/components/masonry';
import { ProfCourseCard } from '@/components/prof-card';
import { fetchCourseListByProf } from '@/lib/database/get-course-info';
import { buildProfessorMetadata } from '@/lib/seo';

export const revalidate = 3600;

export function generateMetadata({ params }: { params: { name: string[] } }) {
    const prof_name = params.name.join("/").replaceAll("%20", " ").replaceAll('%24', '/').toUpperCase()
    return buildProfessorMetadata(prof_name)
}

async function ProfessorCourses({ name }: { name: string }) {
    const { data, error }: { data: any, error: any } = await fetchCourseListByProf({ name })
    if (error) {
        // TODO: add error page
        return <div>error</div>
    }

    return (
        <div className='max-w-screen-xl mx-auto p-4'>
            <Masonry col={3} className="">
                {data.map((course: any, index: any) => {
                    return (
                        <ProfCourseCard key={index} data={course} code={course.course_id} />
                    )
                })}
            </Masonry>
        </div>
    )
}

const ProfessorPage = ({ params: { name } }: { params: { name: string[] } }) => {
    const prof_name = name.join("/").replaceAll("%20", " ").replaceAll('%24', '/').toUpperCase()

    return (
        <>
            <div className='bg-gradient-to-r from-blue-600 to-indigo-500 text-white p-3'>
                <div className='max-w-screen-xl mx-auto p-4'>
                    <div className='break-words text-3xl font-semibold'>
                        {prof_name.toUpperCase().replaceAll("%20", " ").replaceAll('%24', '/')}
                    </div>
                </div>
            </div>
            <Suspense fallback={<CourseGridSkeleton count={6} />}>
                <ProfessorCourses name={prof_name} />
            </Suspense>
        </>
    )
}

export default ProfessorPage
