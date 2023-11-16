import { Post } from "@/.contentlayer/generated"
import Link from "next/link"

const PostCard = (({ post }:{post:Post}) => {
    return(
        <Link href={`/blog/${post.url}`} className="p-4 border rounded hover:shadow">
            <div className=" text-xl font-semibold">
                {post.title}
            </div>
            <div className="flex space-x-1">
                <div className=" text-slate-500 italic">
                    publish on
                </div>
                <div>
                {post.date.split('T')[0]}
                </div>
            </div>
            <div className="flex space-x-1">
                <div className=" text-slate-500 italic">
                    by
                </div>
                <div>
                    {post.author.join(' & ')}
                </div>
            </div>
            <div className=" text-slate-500 flex flex-row flex-wrap">
                {post.tags.map((tag)=>{
                    return(
                        <div key={tag} className="mx-1">{`#${tag.replaceAll(" ",".")}`}</div>
                    )
                })}
            </div>
        </Link>
    )
})

export default PostCard