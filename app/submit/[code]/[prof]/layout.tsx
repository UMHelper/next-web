import { Viewport } from "next"

export async function generateMetadata({ params }: { params: any }) {
    const p = await params

    const safeDecode = (s: any) => {
        if (!s) return ''
        try {
            let prev = null
            let cur = String(s)
            while (cur !== prev) {
                prev = cur
                cur = decodeURIComponent(cur)
            }
            return cur.replaceAll('$', '/')
        } catch (e) {
            return String(s).replaceAll('%20', ' ').replaceAll('$', '/')
        }
    }

    const prof = safeDecode(p?.prof)
    const code = p?.code ? String(p.code) : ''
    const title = `Comment on ${prof} for ${code} | What2Reg @ UM 澳大選咩課`

    return { title }

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