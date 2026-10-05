import type { ReactNode } from "react";

import { noIndexMetadata } from "@/lib/seo"

type SubmitLayoutMetadataProps = {
    params: Promise<{ code: string; prof: string }>;
};

export async function generateMetadata(
    { params }: SubmitLayoutMetadataProps) {
    const { code, prof } = await params
    const title = `Comment on ${prof.replaceAll("%20"," ").replaceAll('$', '/')} for ${code} | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
        ...noIndexMetadata,
    }

}


export default function SubmitLayout({children}:{children:ReactNode}){
    return(
        children
    )
}
