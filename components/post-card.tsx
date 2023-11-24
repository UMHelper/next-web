import { clerk } from '@/lib/clerk';
import { Post } from "@/.contentlayer/generated"
import Link from "next/link"
import Image from 'next/image'
import { cn } from '@/lib/utils';

export const AuthorsAvata = async ({ authors, size = 28, with_name = false }: { authors: string[], size?: number, with_name?: boolean }) => {
    const authors_info = await clerk.users.getUserList({ username: authors })
    return (
        <div className={cn(with_name ? "space-y-2" : "flex space-x-1", "min-h-fit")}>
            {authors_info.map((author) => {
                return (
                    <div
                        key={author.username}
                        className="flex space-x-1"
                        style={{ height: size + 'px' }}
                    >
                        <Image
                            width={size}
                            height={size}
                            sizes={`${size}px, ${size}px, ${size}px`}
                            src={author.imageUrl}
                            alt={author?.username + ""}
                            className='object-cover rounded-full border-2 border-slate-100'
                        />
                        {with_name ? (
                            <div style={{height:size+'px'}} className='flex flex-col justify-center'>
                                <div
                                    className='text-sm'
                                >{`${author.firstName} ${author.lastName}`}
                                </div>
                                <div
                                    className='text-xs text-gray-500'
                                >{`@${author.username}`}
                                </div>
                            </div>
                        ) : null}
                    </div>
                )
            })}
        </div>
    )
}

const PostCard = async ({ post }: { post: Post }) => {
    const authors = await clerk.users.getUserList({ username: post.authors })
    // console.log(authors)
    return (
        <div>
            <div className=" text-slate-500 flex flex-row flex-wrap text-xs space-x-2">
                {post.tags.map((tag) => {
                    return (
                        <div key={tag}>{`#${tag.replaceAll(" ", ".")}`}</div>
                    )
                })}
            </div>
            <div className=" text-3xl font-semibold my-4">
                <Link href={`/blog/${post.url}`}>
                    {post.title}
                </Link>
            </div>
            <div className='flex flex-row space-x-4 items-center'>
                <AuthorsAvata authors={post.authors} />
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