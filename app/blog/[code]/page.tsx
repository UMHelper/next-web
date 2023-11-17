import Markdown from '@/components/markdown/markdown';
import { AuthorsAvata } from '@/components/post-card';
import { Separator } from '@/components/ui/separator';
import { allPosts } from 'contentlayer/generated';
import type { MDXComponents } from 'mdx/types'
import { useMDXComponent } from 'next-contentlayer/hooks'
import { notFound } from 'next/navigation'

// export async function generateStaticParams() {
//     console.log(allPosts)
//     return allPosts.map((post) => ({
//         slug: post._raw.flattenedPath,
//     }))
// }

const components: MDXComponents = {
    h1: (props) => <h1 className='text-2xl font-bold flex items-center' {...props} />,
    h2: (props) => <h2 className='text-xl font-bold flex items-center' {...props} />,
    h3: (props) => <h3 className='text-lg font-bold flex items-center' {...props} />,
    h4: (props) => <h4 className='text-base font-bold flex items-center' {...props} />,
    h5: (props) => <h5 className='text-base font-bold flex items-center' {...props} />,
    h6: (props) => <h6 className='text-base font-bold flex items-center' {...props} />,
}

const PostDetailPage = (({ params: { code } }: { params: { code: string } }) => {
    const post = allPosts.find((post) => post.url === code)
    if (!post) {
        return notFound()
    }
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const MDXContent = useMDXComponent(post.body.code)
    return (
        <div>
            <div className=' space-y-2 py-2'>
                <div className="text-sm text-gray-500">
                    {new Date(post.date).toLocaleDateString("en-US", {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    })}
                </div>
                <div className='text-4xl font-black py-4'>{post?.title}</div>
                <div className='text-sm text-gray-500 italic'>posted by</div>
                <AuthorsAvata authors={post.authors} size={40} with_name />

                <div className=" text-slate-500 flex flex-row flex-wrap text-sm space-x-2">
                    {post.tags.map((tag) => {
                        return (
                            <div key={tag}>{`#${tag.replaceAll(" ", ".")}`}</div>
                        )
                    })}
                </div>
                <Separator />
            </div>
            <Markdown>
            <MDXContent components={components} />
            </Markdown>
        </div>
    )
})

export default PostDetailPage