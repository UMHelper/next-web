import Link from "next/link"


function InstructorSearchPage({params}:{params:{name:string}}){
    return(
        <div>
            <div>
            Developing. If you are seeing this, it means that the page is not ready yet.
            </div>
            <div>
                If you are insterested in Web Development, please help us to develop this page on <Link className="underline" href="https://github.com/UMHelper/next-web/tree/main">Github</Link>
            </div>
        </div>
    )
}

export default InstructorSearchPage