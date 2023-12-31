import { Viewport } from "next"

export function generateMetadata() {
    const title = `Timetable Sim | What2Reg @ UM 澳大選咩課`
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
        <div className='max-w-screen-xl mx-auto p-4'>
            {children}
        </div>
    )
}