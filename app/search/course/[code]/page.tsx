import CourseFilter from "@/components/course_filter";
import { fuzzySearch } from "@/lib/database/fuzzy-search";

export function generateMetadata(
    {params}:{params:any}) {
    const title = `Searching for ${params.code.toUpperCase()} | What2Reg @ UM 澳大選咩課 @UM`

    return {
        title: title,
    }

}

const fetchData = async (code:string) => {
    const data:any=await fuzzySearch(code,'course')
    const unique_data = data
    .map((e: { [x: string]: any; }) => e['New_code'])
    // store the keys of the unique objects
    .map((e: any, i: any, final: string | any[]) => final.indexOf(e) === i && i)
    // eliminate the dead keys & store unique objects
    .filter((e: string | number) => data[e]).map((e: string | number) => data[e])
    return unique_data  
  
    
}

async function CourseSearchPage({params}:{params:{code:string}}){
    const courseList:any[] = await fetchData(params.code.toUpperCase())
    return(
        <div>
            <CourseFilter data={courseList}/>
            {/* <Masonry col={3} className="mx-auto">
                {courseList.map((course,index)=>{
                    return <CourseCard data={course} key={index}/>
                })}
            </Masonry> */}
        </div>
    )
}

export default CourseSearchPage