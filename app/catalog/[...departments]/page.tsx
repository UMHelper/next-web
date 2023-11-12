import CourseFilter from '@/components/course_filter';
import supabase from '@/lib/database/database';

const fetchCourseList=async(departments:string[])=>{
    if (departments.length===1){
        const {data,error}:{data:any,error:any}=await supabase.from('course_noporf')
                        .select('')
                        .eq('Offering_Unit',departments[0].toUpperCase())
        return data.sort((a:any, b:any) => a.New_code.localeCompare(b.New_code))
    }
    const {data,error}:{data:any,error:any}=await supabase.from('course_noporf')
                        .select('')
                        .eq('Offering_Unit',departments[0].toUpperCase())
                        .eq('Offering_Department',departments[1].toUpperCase())
    return data.sort((a:any, b:any) => a.New_code.localeCompare(b.New_code))
    
}
const CatalogPage=async ({params:{departments}}:{params:{departments:string[]}})=>{
    const courseList:any=await fetchCourseList(departments)
    return(
        <div>
            <div>
            <CourseFilter data={courseList}/>
            </div>
        </div>
    )
}

export default CatalogPage