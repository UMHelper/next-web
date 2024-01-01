export function generateMetadata() {
    const title = `Timetable Sim | What2Reg @ UM 澳大選咩課`
    return {
        title: title,
        viewport: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no',
    }

}

export default function SubmitLayout({children}:{children:any}){
    return(
        <div className='max-w-screen-xl mx-auto p-4'>
            {children}
        </div>
    )
}