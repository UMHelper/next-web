"use client"

import React, { useEffect, useRef } from "react"
import { toast } from "sonner"

const TITLE = "Message From UMHelper: / 來自UMHelper的消息："

export function ReviewNotice({ admin_note, admin_note_en }: { admin_note: string | null, admin_note_en: string | null }) {
    const shownNoteRef = useRef<string | null>(null)
    const hasNotice = Boolean(admin_note?.length || admin_note_en?.length)
    const noteKey = `${admin_note ?? ""}\u0000${admin_note_en ?? ""}`

    useEffect(() => {
        if (!hasNotice) return
        if (shownNoteRef.current === noteKey) return

        shownNoteRef.current = noteKey
        toast.error(
            TITLE,
            {
                description: <div><p>{admin_note_en ?? "No additional information provided."}</p><p>{admin_note ?? "沒有提供額外資訊。"}</p></div>,
                duration: 10000,
                toasterId: "admin_notice",
            }
        )
    }, [admin_note, admin_note_en, hasNotice, noteKey])

    return null
}