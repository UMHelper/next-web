import { Viewport } from "next"

export function generateMetadata(
    {params}:{params:any}) {
    const title = `Comment on ${params.prof.replaceAll("%20"," ").replaceAll('$', '/')} for ${params.code} | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
    }

}

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
}

export default function SubmitLayout({children}:{children:any}){
    return(
        children
    )
}