import PostCard from '@/components/post-card';
import { allPosts } from 'contentlayer/generated';
import { compareDesc } from 'date-fns';

export default async function Blog() {
    const sortedPosts = allPosts.sort((a, b) =>
        compareDesc(new Date(a.date), new Date(b.date)),
    );

    // console.log(sortedPosts);
    return (
        <>
            <div className='mb-4 w-full h-full text-3xl font-semibold flex justify-center items-center bg-gradient-to-r from-green-600 to-blue-700 bg-clip-text text-transparent'>
                UMHelper Dev Blog
            </div>
            <div className='grid grid-cols-2 gap-4'>
                {sortedPosts.map((post) => {
                    return(
                        <PostCard post={post} key={post.url}/>
                    )
                })}
            </div>
        </>
    );
}