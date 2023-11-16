import { Post, allPosts } from 'contentlayer/generated';
import { useMDXComponent } from 'next-contentlayer/hooks'
import { notFound } from 'next/navigation'

const PostDetailPage = (({ params: { code } }: { params: { code: string } }) => {
    const post = allPosts.find((post) => post.url === code)
    if (!post) {
        return notFound()
    }
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const MDXContent = useMDXComponent(post.body.code)
    return (
        <div>
            <div>{post?.title}</div>
            <MDXContent />
        </div>
    )
})

export default PostDetailPage