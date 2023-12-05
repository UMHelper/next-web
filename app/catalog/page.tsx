import { CornerLeftUp, CornerRightUp } from "lucide-react"

export function generateMetadata(
    {params}:{params:any}) {
    const title = `Catalog | What2Reg @ UM 澳大選咩課`

    return {
        title: title,
    }

}

const CatalogPage=async ()=>{
    return(
        <div className="flex flex-row items-center justify-center text-xl font-semibold">
            {/* <div>
            <CornerLeftUp size={28} strokeWidth={2.5} />
            </div>
            <div>
                Choose one
            </div>
            <div>
            <CornerRightUp size={28} strokeWidth={2.5} />
            </div> */}
        </div>
    )
}

export default CatalogPage