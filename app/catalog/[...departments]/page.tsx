import CourseFilter from '@/components/course_filter';
import supabase from '@/lib/database/database';
import { faculty } from '@/lib/consant';

export function generateMetadata(
    {params}:{params:any}) {
    const title = `Catalog of ${params.departments.join(' ').toUpperCase()} | What2Reg @ UM 澳大選咩課 @UM`

    return {
        title: title,
    }

}

const fetchCourseList = async (departments: string[]) => {
    if (departments.length === 1) {
        const { data, error }: { data: any, error: any } = await supabase.from('course_noporf')
            .select('')
            .eq('Offering_Unit', departments[0].toUpperCase())
        return data.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code))
    }
    const { data, error }: { data: any, error: any } = await supabase.from('course_noporf')
        .select('')
        .eq('Offering_Unit', departments[0].toUpperCase())
        .eq('Offering_Department', departments[1].toUpperCase())
    return data.sort((a: any, b: any) => a.New_code.localeCompare(b.New_code))

}

export async function generateStaticParams() {
    return faculty.map((faculty) => {
        return{
            departments:[faculty,]
        }
    })
}

const CatalogPage = async ({ params: { departments } }: { params: { departments: string[] } }) => {
    // if departements[0] not in faculty, return 404
    if (!faculty.includes(departments[0])) {
        return (
            <div>
                <div className="w-full flex justify-center items-center flex-col space-y-8 my-20">
                    <div className="text-9xl font-black racking-widest bg-gradient-to-r from-teal-400 via-violet-400 to-blue-500 bg-clip-text text-transparent">
                        Oops :(
                    </div>
                    <div className="text-sm text-gray-400">
                        The faculty <span className="text-gray-800">{departments[0]}</span> is not found!
                    </div>
                </div>
            </div>
        )
    }
    const courseList: any = await fetchCourseList(departments)
    return (
        <div>
            <div>
                <CourseFilter data={courseList} />
            </div>
        </div>
    )
}

export default CatalogPage