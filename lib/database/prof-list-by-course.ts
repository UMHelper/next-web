import supabase from '@/lib/database/database';

export const getProfListByCourse = async (code: string) => {
    const { data, error } = await supabase.from('prof_with_course')
                            .select('*')
                            .eq('course_id', code)
    console.log(data)
    return data
}