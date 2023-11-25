'use client'
import { Masonry } from "@/components/masonry"
import { CommentCard } from "@/components/comment_card"
import { useEffect, useState } from "react"
import supabase from '@/lib/database/database';

const Comments = ({ comments, course_id }: { comments: any[], course_id: string }) => {
    const [curComments, setCurComments] = useState(comments)

    useEffect(()=>{
        setCurComments(comments)
    },[comments])

    return (
        <>
            <Masonry col={3} className="">
                {curComments.map((comment: any, index: number) => {
                    return (
                        <div key={index}>
                            <CommentCard comment={comment} />
                        </div>
                    )
                })}
            </Masonry>
            {curComments.length == 0 ? (
                <div className="bg-gradient-to-r from-blue-600 to-indigo-500 bg-clip-text text-transparent text-xl font-black mt-4">
                    No comment yet. Be the first one to comment!
                </div>
            ) : null}
        </>
    )
}

export { Comments }
