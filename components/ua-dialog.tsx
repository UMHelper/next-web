'use client'
import { Dialog, DialogContent, DialogHeader, } from "@/components/ui/dialog"
import { ua_check } from "@/lib/utils"
import { Armchair } from "lucide-react"
import { useEffect, useState } from "react"

const UADialog = ({ ua }: { ua: string }) => {
    const [is, setIs] = useState<boolean>(false);

    useEffect(() => {
        setIs(ua_check(ua))
        setIs(true)
    }, [setIs, ua])
    if (!is) return null;
    return (
        <Dialog defaultOpen={is}>
            <DialogContent forceMount>
                <DialogHeader>
                    <div className="text-black font-blod text-base space-y-1">
                        <Armchair size={28} strokeWidth={2} />
                        <p >
                            請使用默認瀏覽器打開本頁面，享受最佳的瀏覽體驗！
                        </p>
                        <p>
                            Please use your default browser to open this page and enjoy the best browsing experience!
                        </p>
                    </div>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    )

}

export default UADialog