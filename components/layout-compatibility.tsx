"use client"

import { Button } from "@/components/ui/button"
import { Check, Copy, ExternalLink, MoreHorizontal, ShieldAlert } from "lucide-react"
import { useEffect, useState } from "react"

const PROFILE_VERSION = 2
type ClientPlatform = "android" | "ios" | "other"

function bytesToBase64Url(bytes: Uint8Array) {
    let binary = ""
    for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index])
    }
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function base64UrlToBytes(value: string) {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function createLayoutProfile() {
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    const values = [
        window.screen.availWidth,
        window.visualViewport?.width ?? window.innerWidth,
        window.screen.width,
        window.screen.orientation?.angle ?? 0,
        window.devicePixelRatio,
        window.matchMedia("(display-mode: browser)").matches ? 0 : 1,
        document.documentElement.clientHeight,
        window.outerHeight,
        window.screen.height,
        window.visualViewport?.scale ?? 1,
        window.history.length,
        window.innerHeight,
        window.screen.colorDepth,
        navigator.hardwareConcurrency,
        window.innerWidth,
        navigator.cookieEnabled ? 1 : 0,
        navigator.maxTouchPoints,
        window.screen.availHeight,
        window.visualViewport?.height ?? window.innerHeight,
        window.outerWidth,
        document.documentElement.clientWidth,
        Math.max(0, window.visualViewport?.offsetTop ?? 0),
        new Date().getTimezoneOffset() + 1440,
        navigator.language.length,
    ]
    const source = new TextEncoder().encode(JSON.stringify(values))
    const encoded = source.map(
        (byte, index) => byte ^ nonce[index % nonce.length] ^ ((index * 29 + 113) & 0xff),
    )

    return {
        v: PROFILE_VERSION,
        n: bytesToBase64Url(nonce),
        d: bytesToBase64Url(encoded),
        q: Array.from(crypto.getRandomValues(new Uint32Array(4))),
    }
}

function readLayoutPolicy(value: unknown) {
    if (typeof value !== "object" || value === null) return false

    const profile = value as Record<string, unknown>
    if (
        profile.v !== PROFILE_VERSION ||
        typeof profile.n !== "string" ||
        typeof profile.d !== "number"
    ) {
        return false
    }

    try {
        const nonce = base64UrlToBytes(profile.n)
        return nonce.length === 6 && profile.d === (nonce[0] ^ 0x6d)
    } catch {
        return false
    }
}

function getClientPlatform(userAgent: string): ClientPlatform {
    if (/Android/i.test(userAgent)) return "android"
    if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios"
    return "other"
}

function getExternalUrl(currentUrl: string, platform: ClientPlatform) {
    let url: URL
    try {
        url = new URL(currentUrl)
    } catch {
        return null
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") return null

    if (platform === "android") {
        const scheme = url.protocol.slice(0, -1)
        return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`
    }

    if (platform === "ios") {
        return `x-safari-${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`
    }

    return null
}

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

    if (!didCopy) throw new Error("Copy command was rejected")
}

export default function LayoutCompatibility({
    preview = false,
    contentTargetId,
}: {
    preview?: boolean
    contentTargetId?: string
}) {
    const [accessRestricted, setAccessRestricted] = useState(preview)
    const [platform, setPlatform] = useState<ClientPlatform>(preview ? "ios" : "other")
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (preview) return

        let cancelled = false
        const clientPlatform = getClientPlatform(navigator.userAgent)
        setPlatform(clientPlatform)
        if (clientPlatform !== "ios") return

        const loadLayoutPolicy = async () => {
            try {
                const response = await fetch("/api/ui-profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    cache: "no-store",
                    body: JSON.stringify(createLayoutProfile()),
                })

                if (!response.ok) return
                const policy: unknown = await response.json()
                if (!cancelled && readLayoutPolicy(policy)) setAccessRestricted(true)
            } catch {
                // A profile service outage must not make the site unavailable.
            }
        }

        void loadLayoutPolicy()
        return () => {
            cancelled = true
        }
    }, [preview])

    useEffect(() => {
        if (!accessRestricted || !contentTargetId) return

        const content = document.getElementById(contentTargetId)
        if (!content) return

        const previousDisplay = content.style.display
        content.style.display = "none"
        return () => {
            content.style.display = previousDisplay
        }
    }, [accessRestricted, contentTargetId])

    if (!accessRestricted) return null

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
        const systemBrowserUrl = getExternalUrl(currentUrl, platform)

        void copyUrl(currentUrl).then(
            () => setCopied(true),
            () => setCopied(false),
        )

        if (systemBrowserUrl) window.location.assign(systemBrowserUrl)
    }

    return (
        <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="browser-access-title"
            aria-describedby="browser-access-description"
            className="min-h-[60svh] bg-gradient-to-b from-slate-50 to-white"
        >
            <div className="mx-auto w-full max-w-screen-xl px-4 py-8 sm:py-12">
                <div className="mx-auto max-w-2xl">
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
                        <div className="h-1.5 bg-gradient-to-r from-blue-600 to-indigo-500" />
                        <div className="p-5 sm:p-8">
                            <div className="flex items-start gap-4">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 ring-1 ring-sky-100 sm:h-12 sm:w-12">
                                    <ShieldAlert aria-hidden="true" className="h-6 w-6" />
                                </span>
                                <div className="min-w-0">
                                    <h1
                                        id="browser-access-title"
                                        className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl"
                                    >
                                        请使用系统浏览器访问
                                    </h1>
                                    <p lang="en" className="mt-1 text-sm font-medium text-slate-500 sm:text-base">
                                        Open in your system browser
                                    </p>
                                </div>
                            </div>

                            <div
                                id="browser-access-description"
                                className="mt-5 space-y-2 text-sm leading-6 text-slate-600 sm:text-base sm:leading-7"
                            >
                                <p>
                                    请不要在
                                    <span className="mx-1 font-semibold text-red-600">第三方应用</span>
                                    内访问
                                    <span className="mx-1 bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text font-semibold text-transparent">
                                        选咩课
                                    </span>
                                    。请通过 Safari 或设备默认浏览器重新打开当前页面。
                                </p>
                                <p lang="en" className="text-sm leading-6 text-slate-500">
                                    Please do not access
                                    <span className="mx-1 bg-gradient-to-r from-sky-500 to-indigo-600 bg-clip-text font-semibold text-transparent">
                                        What2Reg @UM
                                    </span>
                                    inside a
                                    <span className="mx-1 font-semibold text-red-600">
                                        third-party app.
                                    </span>
                                    Reopen this page in Safari or your default browser.
                                </p>
                            </div>

                            <div className="mt-5 flex gap-3 rounded-lg bg-slate-100 p-3.5 text-sm leading-5 text-slate-600 sm:p-4">
                                <MoreHorizontal aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
                                <div className="space-y-1">
                                    <p>请打开应用菜单，选择“在浏览器打开”，或复制当前链接。</p>
                                    <p lang="en" className="text-xs leading-5 text-slate-500 sm:text-sm">
                                        Open the app menu and choose “Open in Browser”, or copy the
                                        current link.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                {platform !== "other" && (
                                    <Button
                                        className="h-14 w-full rounded-lg bg-gradient-to-r from-blue-600 to-indigo-500 px-4 font-semibold text-white shadow-sm hover:from-blue-500 hover:to-indigo-400"
                                        onClick={handleOpen}
                                    >
                                        <ExternalLink aria-hidden="true" className="h-4 w-4" />
                                        <span className="flex flex-col items-start leading-tight">
                                            <span>在系统浏览器中打开</span>
                                            <span className="text-[11px] font-medium text-white/80">
                                                Open in browser
                                            </span>
                                        </span>
                                    </Button>
                                )}
                                <Button
                                    variant="outline"
                                    className="h-14 w-full rounded-lg border-slate-200 bg-white px-4 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                    onClick={handleCopy}
                                >
                                    {copied ? (
                                        <Check aria-hidden="true" className="h-4 w-4 text-emerald-600" />
                                    ) : (
                                        <Copy aria-hidden="true" className="h-4 w-4" />
                                    )}
                                    <span className="flex flex-col items-start leading-tight">
                                        <span>{copied ? "链接已复制" : "复制当前链接"}</span>
                                        <span className="text-[11px] font-medium text-slate-400">
                                            {copied ? "Link copied" : "Copy current link"}
                                        </span>
                                    </span>
                                </Button>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
