import supabaseServer from '@/lib/supabase/server';

export const getCommentList = async (course_id: string, prof: string) => {
    const { data, error } = await supabaseServer.rpc('get_comment_list', { course_code: course_id, prof: prof.replaceAll("%20", " ").replaceAll('$', '/') })
    return data.reverse().filter((comment: any) => comment.hidden !== 1) as any[]
}

export const getCommentNumber = async (course_id: string, prof: string) => {
    const { data, error } = await supabaseServer.rpc('get_comment_list', { course_code: course_id, prof: prof.replaceAll("%20", " ").replaceAll('$', '/') })
    return data.length
}

export const getVoteHistory = async (comment_id_array: string[]) => {
    const { data, error } = await supabaseServer.from('vote').select('*').in('comment_id', comment_id_array)
    // console.log(data)
    return data as any[]
}

export const getComentListByCourseIDAndPage = async (course_id: string, page: number) => {
    const { data, error }: { data: any, error: any } = await supabaseServer.rpc(
        'get_comment_page',
        {
            target_course_id: Number(course_id),
            target_page: page,
            target_page_size: 20,
        }
    )
    return (data ?? []) as any[]
}

export const getReplyByCommentIDList = async (comment_id_list: string[]) => {
    const { data, error } = await supabaseServer.from('comment').select('*').in('replyto', comment_id_list).neq('hidden', 1)
    // console.log(data)
    return data as any[]
}
