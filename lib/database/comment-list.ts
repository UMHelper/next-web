import supabase from '@/lib/database/database';

export const getCommentList = async (course_id: string,prof:string) => {
    console.log(course_id,prof)
    const { data, error } = await supabase.rpc('get_comment_list', {course_code:course_id,prof:prof.replaceAll("%20"," ")})
        
    console.log(data)
    return data
}