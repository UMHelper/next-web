import { clerk } from '@/lib/clerk';
import { Post } from "@/.contentlayer/generated"
import Link from "next/link"
import Image from 'next/image'

export const AuthorsAvata = async ({ authors, size=28 }: { authors: string[], size?:number }) => {
    const authors_info = await clerk.users.getUserList({ username: authors })
    return(
        <div className="flex space-x-1" style={{ height: size + 'px' }}>
                    {authors_info.map((author) => {
                        return (
                            <Image
                                width={size}
                                height={size}
                                sizes={`${size}px, ${size}px, ${size}px`}
                                key={author.username}
                                src={author.imageUrl}
                                alt={author?.username + ""}
                                className='object-cover rounded-full border-2 border-slate-100'
                            />
                        )
                    })}
                </div>
    )
}

const PostCard = async ({ post }: { post: Post }) => {
    const avata_size = 28
    const authors = await clerk.users.getUserList({ username: post.authors })
    console.log(authors)
    return (
        <div>
            <div className=" text-slate-500 flex flex-row flex-wrap text-xs space-x-2">
                {post.tags.map((tag) => {
                    return (
                        <div key={tag}>{`#${tag.replaceAll(" ", ".")}`}</div>
                    )
                })}
            </div>
            <div className=" text-3xl font-semibold my-4 uppercase">
                <Link href={`/blog/${post.url}`}>
                {post.title}
                </Link>
            </div>
            <div className='flex flex-row space-x-4 items-center'>
                <AuthorsAvata authors={post.authors}/>
                <div className="flex space-x-1 text-xs text-gray-500">
                    {new Date(post.date).toLocaleDateString("en-US", {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    })}
                </div>
            </div>
        </div >
    )
}

export default PostCard