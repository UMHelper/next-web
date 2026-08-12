import supabaseServer from '@/lib/supabase/server'

export const fuzzySearch = async (keyword:string,type:string) => {
    if (type==='course'){
        const { data, error }:{data:any,error:any} = await supabaseServer.rpc(
            'search_courses',
            { keyword }
        )
        return data ?? []
    }
    else{
        const { data, error }:{data:any,error:any}=await supabaseServer.rpc(
            'search_instructors_with_courses',
            { keyword }
        )
        return data ?? []
    }
    return []
}

export const fetchCourseFuzzySearch = async (code:string) => {
    const data:any=await fuzzySearch(code,'course')
    return data   
}

export const fetchInstructorFuzzySearch = async (code: string) => {
    const data: any = await fuzzySearch(code, 'instructor')
    return data
}
