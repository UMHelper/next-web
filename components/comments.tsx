import { Masonry } from "@/components/masonry"
import { CommentCard } from "@/components/comment-card"
import Link from "next/link"
import { getVoteHistory } from "@/lib/database/get-comment-list"
import { REACTION_EMOJI_LIST } from "@/lib/consant"

const Comments = async ({ comments, course_id }: { comments: any[], course_id: string }) => {
    
    const comments_id_array = comments.map((comment) => comment.id)
    const vote_history = await getVoteHistory(comments_id_array)
    
    const edited_comments:any[] = comments.map((comment) => {
        comment.vote_history = vote_history?.filter((vote) => vote.comment_id == comment.id)
        comment.upvote=comment.vote_history.filter((vote:any) => vote.offset == 1).length
        comment.downvote=comment.vote_history.filter((vote:any) => vote.offset == -1).length
        comment.emoji_vote=REACTION_EMOJI_LIST.map((emoji) => {
            return {
                emoji: emoji,
                count: comment.vote_history.filter((vote:any) => vote.emoji == emoji).length
            }
        })
        // console.log(comment.emoji_vote)
        return comment
    })

    const non_reply_comments = edited_comments.filter((comment) => comment.replyto === null)
    const reply_comment = edited_comments.filter((comment) => comment.replyto !== null)
    
    return (
        <>
            <Masonry col={3} className="">
                {non_reply_comments.map((comment: any, index: number) => {
                    return (
                        <div key={index}>
                            <CommentCard
                                comment={comment}
                                reply_comment={
                                    reply_comment.filter(
                                        (reply: any) => {
                                            return reply.replyto == comment.id
                                        }
                                    )
                                }
                            />
                        </div>
                    )
                })}
            </Masonry>
            {non_reply_comments.length == 0 ? (
                <div className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent text-xl font-black mt-4">
                    No comment yet. Be the first to sumbit your review! <br/>
                </div>
            ) : null}
        </>
    )
}

export { Comments }
