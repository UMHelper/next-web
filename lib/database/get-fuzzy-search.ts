import supabase from '@/lib/database/database'

export const fuzzySearch = async (keyword:string,type:string) => {
    if (type==='course'){
        const { data:code_data, error:code_error }:{data:any,error:any} = await supabase
        .from('course_noporf')
        .select('')
        .ilike('New_code', `%${keyword}%`)
        const {data:title_data,error}:{data:any,error:any} = await supabase
        .from('course_noporf')
        .select('*')
        .ilike('courseTitleEng', `%${keyword.replaceAll("%20"," ")}%`)
        return code_data.concat(title_data).sort((a:any, b:any) => a.New_code.localeCompare(b.New_code))
    }
    else{
        let res:any=[]
        const {data:prof_list,error:prof_error}:{data:any,error:any}=await supabase.from('prof_info').select('name').ilike('name', `%${keyword.replaceAll("%20"," ").replaceAll('$', '/')}%`)
        const data= await Promise.all(
            prof_list.map(async ({name}:{name:string})=>{
                const { data, error } = await supabase.rpc('get_course_list_by_prof', {prof:name})
                res.push ({
                    prof_name:name,
                    course_list:data
                })
            }
        ))
        return res
    }
    return []
}

export const fetchCourseFuzzySearch = async (code:string) => {
    const data:any=await fuzzySearch(code,'course')
    const unique_data = data
    .map((e: { [x: string]: any; }) => e['New_code'])
    // store the keys of the unique objects
    .map((e: any, i: any, final: string | any[]) => final.indexOf(e) === i && i)
    // eliminate the dead keys & store unique objects
    .filter((e: string | number) => data[e]).map((e: string | number) => data[e])
    return unique_data   
}

export const fetchInstructorFuzzySearch = async (code: string) => {
    const data: any = await fuzzySearch(code, 'instructor')
    return data
}