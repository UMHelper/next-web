export function generateMetadata(
    {params}:{params:any}) {
    const title = `Comment on ${params.prof.replaceAll("%20"," ").replaceAll('$', '/')} for ${params.code} | Whats2REG @UM`

    return {
        title: title,
    }

}

export default function SubmitLayout({children}:{children:any}){
    return(
        children
    )
}