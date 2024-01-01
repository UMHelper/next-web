export function generateMetadata(
    {params}:{params:any}) {
    const title = `Comment on ${params.prof.replaceAll("%20"," ").replaceAll('$', '/')} for ${params.code} | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
        viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
    }

}

export default function SubmitLayout({children}:{children:any}){
    return(
        children
    )
}