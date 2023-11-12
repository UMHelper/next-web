import CourseFilter from '@/components/course_filter';
import supabase from '@/lib/database/database';

const fetchCourseList=async(departments:string[])=>{
    if (departments.length===1){
        const {data,error}=await supabase.from('course_noporf')
                        .select('')
                        .eq('Offering_Unit',departments[0].toUpperCase())
        console.log(data)
        return data
    }
    const {data,error}=await supabase.from('course_noporf')
                        .select('')
                        .eq('Offering_Unit',departments[0].toUpperCase())
                        .eq('Offering_Department',departments[1].toUpperCase())
    return data
    
}
const CatalogPage=async ({params:{departments}}:{params:{departments:string[]}})=>{
    const courseList:any=await fetchCourseList(departments)
    return(
        <div>
            <h1>Catalog page</h1>
            <div>
                {departments.join('/')}
            </div>
            <div>
            <CourseFilter data={courseList}/>
            </div>
        </div>
    )
}

export default CatalogPage