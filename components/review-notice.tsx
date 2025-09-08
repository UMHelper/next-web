"use client"
import { toast, useSonner } from "sonner"

export function ReviewNotice({admin_note, admin_note_en}: {admin_note: string|null, admin_note_en: string|null}) {
    if (admin_note == null && admin_note_en == null) {
        return null;
    }

    if (admin_note?.length == 0 && admin_note_en?.length == 0) {
        return null;
    }

    const title = "Message From UMHelper: / 來自UMHelper的消息："
    // const { toasts } = useSonner();
    // toasts.forEach((t) => {
    //     if (t.title === title) {
    //         return null
    //     }
    // });

    toast.info(
        title,
        {
            description: <div><p>{admin_note_en ?? "No additional information provided."}</p><p>{admin_note ?? "沒有提供額外資訊。"}</p></div>,
            duration: 10000,
            toasterId: "admin_notice",
        }
    )

    return null

}