import CourseFilter from '@/components/course-filter';
import { faculty, faculty_dept } from '@/lib/consant';
import { fetchCatalogList } from '@/lib/database/get-course-info';
import { Viewport } from 'next';

export async function generateMetadata(props:{params:any}) {
    const params = await props.params
    const deps = Array.isArray(params?.departments) ? params.departments : [params?.departments].filter(Boolean)
    const title = `Catalog of ${deps.join(' ').toUpperCase()} | What2Reg @ UM 澳大選咩課`

    return {
        title,
    }

}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
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

const CatalogPage = async (props: { params: any }) => {
    const params = await props.params
    const departments = Array.isArray(params?.departments) ? params.departments : [params?.departments].filter(Boolean)
    // if departments is empty or invalid, show not found
    if (!departments || departments.length === 0) {
        return (
            <div>
                <div className="w-full flex justify-center items-center flex-col space-y-8 my-20">
                    <div className="text-9xl font-black racking-widest bg-gradient-to-r from-teal-400 via-violet-400 to-blue-500 bg-clip-text text-transparent">
                        Oops :(
                    </div>
                    <div className="text-sm text-gray-400">
                        Invalid catalog parameters.
                    </div>
                </div>
            </div>
        )
    }

    // if departments[0] not in faculty, return 404
    if (!faculty.includes(departments[0].toUpperCase()) && departments[0].toLowerCase()!=='gecourse') {
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
    const courseList: any = await fetchCatalogList(departments)
    return (
        <div>
            <div>
                <CourseFilter data={courseList} />
            </div>
        </div>
    )
}

export default CatalogPage