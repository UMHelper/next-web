import CourseFilter from '@/components/course-filter';
import { faculty, faculty_dept, normalizeFacultySlug } from '@/lib/consant';
import { fetchCatalogList } from '@/lib/database/get-course-info';
import { buildCatalogPath } from '@/lib/site';

export function generateMetadata(
    {params}:{params:any}) {
    const normalized = params.departments.map((part: string) => part.toUpperCase())
    const title = `Catalog of ${normalized.join(' ')}`

    return {
        title,
        description: `University of Macau courses under ${normalized.join(' ')}.`,
        alternates: { canonical: buildCatalogPath(normalized) },
    }

}


export async function generateStaticParams() {
    let res= faculty.map((faculty) => {
        return{
            departments:[faculty,]
        }
    })
    faculty.forEach((faculty) => {
        if (faculty_dept[faculty].length > 0) {
            faculty_dept[faculty].forEach((dept: any) => {
                res.push({
                    departments:[faculty,dept]
                })
            })
        }
    })
    return [...res]
}

const CatalogPage = async ({ params: { departments } }: { params: { departments: string[] } }) => {
    const normalizedDepartments = departments.map((value, index) => (
        index === 0 ? normalizeFacultySlug(value) : value.toUpperCase()
    ))

    if (!faculty.includes(normalizedDepartments[0])) {
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
    const courseList: any = await fetchCatalogList(normalizedDepartments)
    return (
        <div>
            <div>
                <CourseFilter data={courseList} />
            </div>
        </div>
    )
}

export default CatalogPage