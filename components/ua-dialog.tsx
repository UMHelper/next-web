'use client'
import { Dialog, DialogContentNoX, DialogHeader, } from "@/components/ui/dialog"
import { ua_check } from "@/lib/utils"
import { Armchair } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"

const UADialog = () => {
    const [is, setIs] = useState<boolean>(false);
    const [timer,setTimer]=useState(10)
    const pathname = usePathname()
    useEffect(() => {
        // console.log(pathname)
        setTimer(10)
        setIs(ua_check(navigator.userAgent))
        // setIs(true)
    }, [pathname])
    useEffect(()=>{
        const t=setTimeout(()=>{
            setTimer(prev=>prev-1)
        },1000)
        return ()=>{
            clearTimeout(t)
        }
    })
    useEffect(() => {
        setIs(ua_check(navigator.userAgent))
        // setIs(true)
    }, [setIs])
    if (!is) return (
        <div className="text-xs text-gray-400">
            {navigator.userAgent}
        </div>
    );
    return (
        <Dialog open={is}>
            <DialogContentNoX forceMount>
                <DialogHeader>
                    <div className="text-black font-blod text-sm space-y-1 break-words">
                        <Armchair size={28} strokeWidth={2} />
                        <p >
                            為保證完整的用戶體驗，請使用 <span className="font-black underline">系統默認瀏覽器</span> 打開本網站！
                        </p>
                        <br />
                        <p>
                            您正在訪問的網站為 由<span className="bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">UMHelper Dev Team</span> 開發維護的 <span className="bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">What2Reg @UM</span>，本網站同澳門大學或其他學生組織沒有任何關係。
                        </p>
                        <br />
                        <p className="underline font-semibold">
                            如果您經由其他網站或者應用程式訪問本網站，請注意您的個人信息安全。<span className="bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">UMHelper</span> 並不對其他網站或者應用程式的安全性與信息準確性負責。
                        </p>
                        <br />
                        <p>
                            Please use your <span className="font-black underline">default browser</span> to open this page and enjoy the best browsing experience!
                        </p>
                        <br />
                        <p>
                            The website you are visiting is <span className="bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">What2Reg @UM</span>, developed and maintained by the <span className="bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">UMHelper Dev Team</span>. This website has no affiliation with the University of Macau, and any other student organizations.
                        </p>
                        <br />
                        <p className="underline font-semibold">
                            If you are accessing this website through other websites or applications, please be aware of the security of your personal information. <span className="bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text text-transparent">UMHelper</span> is not responsible for the security and accuracy of information on other websites or applications.
                        </p>
                        <br />
                        <Button
                            className="w-full bg-gradient-to-r from-red-400 to-orange-500 rounded hover:shadow flex justify-center text-white font-bold my-1 py-1 hover:cursor-pointer"
                            onClick={() => {
                                setIs(false)
                            }}
                            disabled={timer>0}
                        >
                            我已知曉，繼續訪問 / I understand, continue. {timer>0?`(${timer}s)`:''}
                        </Button>
                    </div>
                </DialogHeader>
            </DialogContentNoX>
        </Dialog>
    )

}

export default UADialog