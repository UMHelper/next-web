import supabase from '@/lib/database/database';

export const getCommentList = async (course_id: string,prof:string) => {
    const { data, error } = await supabase.rpc('get_comment_list', {course_code:course_id,prof:prof.replaceAll("%20"," ").replaceAll('$', '/')})
    return data.reverse().filter((comment:any)=>comment.hidden!==1) as any[]
}

export const getCommentNumber = async (course_id: string,prof:string) => {
    const { data, error } = await supabase.rpc('get_comment_list', {course_code:course_id,prof:prof.replaceAll("%20"," ").replaceAll('$', '/')})
    return data.length
}

export const getVoteHistory = async (comment_id_array:string[]) => {
    const {data, error} = await supabase.from('vote').select('*').in('comment_id', comment_id_array)
    // console.log(data)
    return data as any[]
}

export const getComentListByCourseIDAndPage = async (course_id: string, page: number) => {
    const {data, error} =await supabase.from('comment').select('*').eq('course_id', course_id).neq('hidden',1).order('pub_time', {ascending: false}).range(page*10, (page+1)*10-1)
    // console.log(data)
    return data as any[] as any[]
}