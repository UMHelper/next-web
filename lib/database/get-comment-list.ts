import supabase from '@/lib/database/database';

export const getCommentList = async (course_id: string,prof:string) => {
    const { data, error } = await supabase.rpc('get_comment_list', {course_code:course_id,prof:prof.replaceAll("%20"," ").replaceAll('$', '/')})
    return data.reverse()
}

export const getCommentNumber = async (course_id: string,prof:string) => {
    const { data, error } = await supabase.rpc('get_comment_list', {course_code:course_id,prof:prof.replaceAll("%20"," ").replaceAll('$', '/')})
    return data.length
}

export const getVoteHistory = async (comment_id_array:string[]) => {
    const {data, error} = await supabase.from('vote').select('*').in('comment_id', comment_id_array)
    // console.log(data)
    return data
}