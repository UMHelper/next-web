import supabase from '@/lib/database/database';

export const getProfInfo = async (code: string,prof:string) => {
    const { data, error } = await supabase.from('prof_with_course')
                            .select('*')
                            .eq('course_id', code)
                            .eq('prof_id', prof.replaceAll("%20"," "))
                            .single()
    return data
}