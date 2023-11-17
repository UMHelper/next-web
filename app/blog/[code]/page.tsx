import { AuthorsAvata } from '@/components/post-card';
import { allPosts } from 'contentlayer/generated';
import type { MDXComponents } from 'mdx/types'
import { useMDXComponent } from 'next-contentlayer/hooks'
import { notFound } from 'next/navigation'

export async function generateStaticParams() {
    return allPosts.map((post) => ({
      slug: post._raw.flattenedPath,
    }))
}

const components:MDXComponents={
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
            <div className='text-3xl font-black uppercase text-center'>{post?.title}</div>
            <AuthorsAvata authors={post.authors} size={40}/>
            <MDXContent components={components}/>
        </div>
    )
})

export default PostDetailPage