const BlogLayout = (({
    children,
}: {
    children: React.ReactNode
}) => {
    return(
        <div className='max-w-screen-xl mx-auto p-4 md:py-4 md:px-40'>
            {children}
        </div>
    )
})

export default BlogLayout