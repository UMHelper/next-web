import { Masonry } from "@/components/masonry"
import { CommentCard } from "@/components/review/comment-card"
import { REACTION_EMOJI_LIST } from "@/lib/consant"


const Comments = ({ comments }: { comments: any[] }) => {
    const editedComments: any[] = comments.map((comment) => {
        const counts = new Map<string, number>(
            (comment.emoji_counts ?? []).map((row: any) => [row.emoji, row.count]),
        )

        return {
            ...comment,
            vote_history: comment.vote_history ?? [],
            upvote: comment.upvote_count ?? 0,
            downvote: comment.downvote_count ?? 0,
            emoji_vote: REACTION_EMOJI_LIST.map((emoji) => ({
                emoji,
                count: counts.get(emoji) ?? 0,
            })),
            avatar_seed: comment.avatar_seed ?? "",
        }
    })

    const replyByParentId = new Map<any, any[]>()
    const nonReplyComments: any[] = []

    editedComments.forEach((comment) => {
        if (comment.replyto === null) {
            nonReplyComments.push(comment)
            return
        }

        const replyList = replyByParentId.get(comment.replyto) ?? []
        replyList.push(comment)
        replyByParentId.set(comment.replyto, replyList)
    })

    return (
        <>
            <Masonry col={3} className="">
                {nonReplyComments.map((comment: any, index: number) => {
                    return (
                        <div key={index}>
                            <CommentCard
                                comment={comment}
                                reply_comment={replyByParentId.get(comment.id) ?? []}
                            />
                        </div>
                    )
                })}
            </Masonry>
            {nonReplyComments.length == 0 ? (
                <div className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent text-xl font-black mt-4">
                    No comment yet. Be the first to sumbit your review! <br />
                </div>
            ) : null}
        </>
    )
}

export { Comments }
