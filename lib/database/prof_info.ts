import supabase from '@/lib/database/database';

export const getProfInfo = async (code: string,prof:string) => {
    console.log(code,prof.replaceAll("%20"," "))
    const { data, error } = await supabase.from('prof_with_course')
                            .select('*')
                            .eq('course_id', code)
                            .eq('prof_id', prof.replaceAll("%20"," ").replaceAll('%24', '/'))
                            .single()
    return data
}