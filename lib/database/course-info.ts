import supabase from '@/lib/database/database';

export const getCourseInfo = async (course_id: string) => {
    const { data, error } = await supabase.from('course_noporf')
                            .select('*')
                            .eq('New_code', course_id)
        
    console.log(data)
    return data
}