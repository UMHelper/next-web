'use client'
import { faculty, faculty_dept } from "@/lib/consant"
import { usePathname, useRouter } from 'next/navigation'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ChevronsDown } from "lucide-react"
import { useEffect, useState } from "react"

const CatalogNavigation = () => {
    const pathname = usePathname()
    const currentFaculty = pathname.split('/')[2]
    const currentDept = pathname.split('/')[3]
    const router = useRouter()

    const [open, setOpen] = useState<any>({})
    useEffect(() => {
        faculty.forEach((fac) => {
            router.prefetch(`/catalog/${fac}`)
            if (faculty_dept[fac].length > 0) {
                faculty_dept[fac].forEach((dept: any) => {
                    router.prefetch(`/catalog/${fac}/${dept}`.replaceAll(" ",""))
                })
            }
        })
    }, [router])

    useEffect(() => {
        faculty.forEach((fac) => {
            if (faculty_dept[fac].length > 2) {
                setOpen((prev: any) => ({ ...prev, [fac]: false }))
            }
        })
    }, [])

    // useEffect(() => {
    //     console.log(open)
    // }, [open])
    return (
        <div className="flex flex-row flex-wrap py-2">
            {
                faculty.map((fac, index) => {
                    if (faculty_dept[fac].length === 0) {
                        return (<div key={index} className={(fac === currentFaculty ? "text-blue-700 bg-gray-200" :
                            "text-gray-900 hover:bg-gray-100 hover:text-blue-500") + " py-2 px-3 me-3 my-1 rounded hover:cursor-pointer"}
                            onClick={() => {
                                router.push(`/catalog/${fac}`)
                            }}
                        >
                            {fac}
                        </div>)
                    }
                    if (faculty_dept[fac].length === 1) {
                        return (<div key={index} className={(fac === currentFaculty ? "text-blue-700 bg-gray-200" :
                            "text-gray-900 hover:bg-gray-100 hover:text-blue-500") + " py-2 px-3 me-3 my-1 rounded hover:cursor-pointer"}
                            onClick={() => {
                                router.push(`/catalog/${fac}/${faculty_dept[fac][0]}`)
                            }}
                        >
                            {`${fac}`}
                        </div>)
                    }
                    return (
                        <DropdownMenu
                            key={index}
                            // open={open[fac]}
                        >
                            <DropdownMenuTrigger style={{
                                outline: 'none'
                            }}
                            // onMouseOver={() => {
                            //     if (open[fac]) return
                            //     setOpen((prev: any) => ({ ...prev, [fac]: true }))
                            // }}
                            // onMouseOut={() => {
                            //     setTimeout(() => {
                            //         setOpen((prev: any) => ({ ...prev, [fac]: false }))
                            //     }, 1000)

                            // }}
                            >
                                <div key={index} className={(fac === currentFaculty ? "text-blue-700 bg-gray-200" :
                                    "text-gray-900 hover:bg-gray-100 hover:text-blue-500") + " py-2 px-3 me-3 my-1 rounded flex flex-row items-center"} >
                                    <div>
                                        {fac}
                                    </div>
                                    <div>
                                        <ChevronsDown size={16} strokeWidth={2} />
                                    </div>
                                </div>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                            // onMouseOver={() => {
                            //     if (open[fac]) return
                            //     setOpen((prev: any) => ({ ...prev, [fac]: true }))
                            // }}
                            // onMouseOut={() => {
                            //     setTimeout(() => {
                            //         setOpen((prev: any) => ({ ...prev, [fac]: false }))
                            //     }, 1000)

                            // }}
                            >
                                {
                                    faculty_dept[fac].map((dept: any, index: number) => {
                                        return (
                                            <DropdownMenuItem key={index} className={(dept === currentDept ? "text-blue-700 bg-gray-200" :
                                                "text-gray-900 hover:bg-gray-100 hover:text-blue-500") + " py-2 px-3 my-1 rounded hover:cursor-pointer"}
                                                onClick={() => {
                                                    router.push(`/catalog/${fac}/${dept}`.replaceAll(" ",""))
                                                }}
                                            >
                                                {dept}
                                            </DropdownMenuItem>
                                        )
                                    })
                                }
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )
                })
            }
        </div>
    )
}

export default CatalogNavigation