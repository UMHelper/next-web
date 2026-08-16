"use client"

import {
    Dialog,
    DialogContentNoX,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
    detectInAppBrowser,
    getSystemBrowserUrl,
    type InAppBrowserInfo,
} from "@/lib/in-app-browser"
import { Check, Copy, ExternalLink, MoreHorizontal, Smartphone } from "lucide-react"
import { useEffect, useState } from "react"

const DISMISSED_KEY = "in-app-browser-notice-dismissed"

async function copyUrl(url: string) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        return
    }

    const textarea = document.createElement("textarea")
    textarea.value = url
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    const didCopy = document.execCommand("copy")
    textarea.remove()

    if (!didCopy) {
        throw new Error("Copy command was rejected")
    }
}

function wasDismissed() {
    try {
        return sessionStorage.getItem(DISMISSED_KEY) === "true"
    } catch {
        return false
    }
}

export default function UADialog() {
    const [browser, setBrowser] = useState<InAppBrowserInfo | null>(null)
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
        const result = detectInAppBrowser(navigator.userAgent, isStandalone)

        if (result.isInApp && !wasDismissed()) {
            setBrowser(result)
        }
    }, [])

    if (!browser) return null

    const dismiss = () => {
        try {
            sessionStorage.setItem(DISMISSED_KEY, "true")
        } catch {
            // Some embedded browsers block storage; dismissal should still work.
        }
        setBrowser(null)
    }

    const handleCopy = async () => {
        try {
            await copyUrl(window.location.href)
            setCopied(true)
        } catch {
            setCopied(false)
        }
    }

    const handleOpen = () => {
        const currentUrl = window.location.href
        const systemBrowserUrl = getSystemBrowserUrl(currentUrl, browser.platform)

        // Keep the URL available when an app blocks external protocol navigation.
        void copyUrl(currentUrl).then(
            () => setCopied(true),
            () => setCopied(false),
        )

        if (systemBrowserUrl) {
            window.location.assign(systemBrowserUrl)
        }
    }

    const sourceLabel = browser.appName
        ? `当前页面在 ${browser.appName} 内打开`
        : "当前页面在应用内置浏览器中打开"

    return (
        <Dialog open>
            <DialogContentNoX
                forceMount
                className="w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl"
                onEscapeKeyDown={(event) => event.preventDefault()}
                onInteractOutside={(event) => event.preventDefault()}
            >
                <div className="bg-gradient-to-br from-sky-600 via-blue-600 to-cyan-500 px-6 pb-8 pt-7 text-white">
                    <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                        <Smartphone aria-hidden="true" className="h-6 w-6" />
                    </div>
                    <DialogHeader className="space-y-2 text-left">
                        <DialogTitle className="text-2xl font-bold leading-tight tracking-tight">
                            请使用系统浏览器访问
                        </DialogTitle>
                        <DialogDescription className="text-sm leading-6 text-blue-50">
                            {sourceLabel}。为保证登录、评论及页面跳转正常，请转到 Safari、Chrome
                            或您的默认浏览器。
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="-mt-3 space-y-5 rounded-t-2xl bg-white px-6 pb-6 pt-5">
                    <div className="flex gap-3 rounded-xl bg-slate-50 p-3.5 text-sm leading-5 text-slate-600">
                        <MoreHorizontal aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                        <p>
                            若无法自动跳转，请点击应用右上角菜单，选择“在浏览器打开”；也可先复制链接后粘贴到系统浏览器。
                        </p>
                    </div>

                    <div className="space-y-2.5">
                        {browser.platform !== "other" && (
                            <Button
                                className="h-12 w-full rounded-xl bg-sky-600 text-base font-semibold hover:bg-sky-700"
                                onClick={handleOpen}
                            >
                                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                                <span>在系统浏览器中打开</span>
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            className="h-11 w-full rounded-xl border-slate-200 text-slate-700"
                            onClick={handleCopy}
                        >
                            {copied ? (
                                <Check aria-hidden="true" className="h-4 w-4 text-emerald-600" />
                            ) : (
                                <Copy aria-hidden="true" className="h-4 w-4" />
                            )}
                            <span>{copied ? "链接已复制" : "复制当前链接"}</span>
                        </Button>
                    </div>

                    <button
                        type="button"
                        className="w-full py-1 text-center text-xs text-slate-400 underline-offset-4 hover:text-slate-600 hover:underline"
                        onClick={dismiss}
                    >
                        暂时继续在应用内访问
                    </button>
                </div>
            </DialogContentNoX>
        </Dialog>
    )
}
