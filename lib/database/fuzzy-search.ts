import supabase from '@/lib/database/database'

export const fuzzySearch = async (keyword:string,type:string) => {
    if (type==='course'){
        const { data:code_data, error:code_error }:{data:any,error:any} = await supabase
        .from('course_noporf')
        .select('*')
        .ilike('New_code', `%${keyword}%`)
        const {data:title_data,error}:{data:any,error:any} = await supabase
        .from('course_noporf')
        .select('*')
        .ilike('courseTitleEng', `%${keyword.replaceAll("%20"," ")}%`)
        return code_data.concat(title_data)
    }
    else{
        const {data:prof_list,error:prof_error}:{data:any,error:any}=await supabase.from('prof_info').select('name').ilike('name', `%${keyword.replaceAll("%20"," ")}%`)
        const data= await Promise.all(
            prof_list.map(async ({name}:{name:string})=>{
                const { data, error } = await supabase.rpc('get_course_list_by_prof', {prof:`%${keyword.replaceAll("%20"," ")}%`})
                return {
                    prof_name:name,
                    course_list:data
                }
            }
        ))
        return data
    }
    return []
}