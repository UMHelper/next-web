import { Masonry } from '@/components/masonry';
import { ProfCourseCard } from '@/components/prof_card';
import supabase from '@/lib/database/database';

export const generateStaticParams = async () => {
    const { data, error }:{data:any,error:any} = await supabase.from('prof_with_course')
        .select('prof_id')
    return Array.from(new Set(data)).map((prof: any) => {
        return {
            name: encodeURI(prof.prof_id.replaceAll(" ", "%20")).split("/"),
        }
    })
}

const ProfessorPage = async ({ params: { name } }: { params: { name: string[] } }) => {
    const prof_name=name.join("/").replaceAll("%20", " ").replaceAll('%24', '/').toUpperCase()
    const { data, error }:{data:any,error:any} = await supabase.from('prof_with_course')
        .select('*')
        .eq('prof_id', prof_name)
    // sort data by data.course_id
    data.sort((a:any,b:any)=>a.course_id.localeCompare(b.course_id))
    if (error){
        // TODO: add error page
        return <div>error</div>
    }
    return (
        <div>
            <div className='bg-gradient-to-r from-blue-600 to-indigo-500 text-white p-3'>
                <div className='max-w-screen-xl mx-auto p-4'>
                    <div className='break-all text-3xl font-semibold'>
                        {prof_name.toUpperCase().replaceAll("%20", " ").replaceAll('%24', '/')}
                    </div>
                </div>
            </div>
            <div className='max-w-screen-xl mx-auto p-4'>
                <Masonry col={3} className="">
                    {data.map((course: any, index: any) => {
                        return(
                            <ProfCourseCard key={index} data={course} code={course.course_id}/>
                        )
                    })}
                </Masonry>
            </div>
        </div>
    )
}

export default ProfessorPage