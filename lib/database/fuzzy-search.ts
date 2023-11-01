import supabase from '@/lib/database/database'

export const fuzzySearch = async (keyword:string,type:string) => {
    if (type==='course'){
        const { data, error }:{data:any,error:any} = await supabase
        .from('course_noporf')
        .select('*')
        .ilike('New_code', `%${keyword}%`)
        return data
    }
    return []
}