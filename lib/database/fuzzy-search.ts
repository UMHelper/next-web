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
        .ilike('courseTitleEng', `%${keyword}%`)
        return code_data.concat(title_data)
    }
    return []
}