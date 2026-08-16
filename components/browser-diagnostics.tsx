"use client"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Check, Clipboard, RefreshCw, Search } from "lucide-react"
import { useState } from "react"

type NavigatorWithExtras = Navigator & {
    standalone?: boolean
    userAgentData?: {
        brands?: Array<{ brand: string; version: string }>
        mobile?: boolean
        platform?: string
    }
}

type WindowWithBridges = Window & {
    ReactNativeWebView?: unknown
    Android?: unknown
    AndroidInterface?: unknown
    JSBridge?: unknown
    webkit?: { messageHandlers?: Record<string, unknown> }
}

type Diagnostics = {
    server: unknown
    client: Record<string, unknown>
}

function getClientDiagnostics(): Record<string, unknown> {
    const extendedNavigator = navigator as NavigatorWithExtras
    const extendedWindow = window as WindowWithBridges
    const userAgentData = extendedNavigator.userAgentData
    const navigationEntry = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined

    return {
        capturedAt: new Date().toISOString(),
        location: `${window.location.origin}${window.location.pathname}`,
        referrer: document.referrer || null,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        vendor: navigator.vendor,
        language: navigator.language,
        languages: navigator.languages,
        userAgentData: userAgentData
            ? {
                  brands: userAgentData.brands,
                  mobile: userAgentData.mobile,
                  platform: userAgentData.platform,
              }
            : null,
        standalone:
            window.matchMedia("(display-mode: standalone)").matches ||
            Boolean(extendedNavigator.standalone),
        displayMode: window.matchMedia("(display-mode: standalone)").matches
            ? "standalone"
            : window.matchMedia("(display-mode: fullscreen)").matches
              ? "fullscreen"
              : "browser",
        topLevelFrame: window.top === window.self,
        cookieEnabled: navigator.cookieEnabled,
        webdriver: navigator.webdriver,
        maxTouchPoints: navigator.maxTouchPoints,
        navigationType: navigationEntry?.type ?? null,
        screen: {
            width: window.screen.width,
            height: window.screen.height,
            availableWidth: window.screen.availWidth,
            availableHeight: window.screen.availHeight,
            colorDepth: window.screen.colorDepth,
            pixelRatio: window.devicePixelRatio,
        },
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            visualWidth: window.visualViewport?.width ?? null,
            visualHeight: window.visualViewport?.height ?? null,
        },
        bridges: {
            reactNativeWebView: Boolean(extendedWindow.ReactNativeWebView),
            webkitMessageHandlers: Boolean(extendedWindow.webkit?.messageHandlers),
            webkitMessageHandlerNames: extendedWindow.webkit?.messageHandlers
                ? Object.keys(extendedWindow.webkit.messageHandlers)
                : [],
            android: Boolean(extendedWindow.Android),
            androidInterface: Boolean(extendedWindow.AndroidInterface),
            jsBridge: Boolean(extendedWindow.JSBridge),
        },
    }
}

async function copyText(text: string) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
    }

    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.select()
    const didCopy = document.execCommand("copy")
    textarea.remove()

    if (!didCopy) throw new Error("Copy command was rejected")
}

export default function BrowserDiagnostics() {
    const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [copied, setCopied] = useState(false)

    const collect = async () => {
        setLoading(true)
        setError(null)
        setCopied(false)

        try {
            const response = await fetch("/api/browser-diagnostics", {
                cache: "no-store",
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)

            setDiagnostics({
                server: await response.json(),
                client: getClientDiagnostics(),
            })
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Unable to collect diagnostics")
        } finally {
            setLoading(false)
        }
    }

    const formattedDiagnostics = diagnostics
        ? JSON.stringify(diagnostics, null, 2)
        : ""

    const handleCopy = async () => {
        try {
            await copyText(formattedDiagnostics)
            setCopied(true)
        } catch {
            setError("Copy failed. Please select and copy the content manually.")
        }
    }

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="font-semibold underline underline-offset-1"
                    onClick={collect}
                >
                    Environment Info
                </button>
            </DialogTrigger>
            <DialogContent className="w-[calc(100%-2rem)] max-w-2xl rounded-xl">
                <DialogHeader className="text-left">
                    <DialogTitle className="flex items-center gap-2">
                        <Search aria-hidden="true" className="h-5 w-5 text-sky-600" />
                        Environment Info
                    </DialogTitle>
                    <DialogDescription>
                        Cookies, credentials, and full IP addresses are not collected.
                    </DialogDescription>
                </DialogHeader>

                {loading && (
                    <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                        <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
                        Collecting diagnostics...
                    </div>
                )}

                {error && (
                    <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
                )}

                {!loading && diagnostics && (
                    <>
                        <pre className="max-h-[50vh] overflow-auto rounded-lg bg-slate-950 p-4 text-[11px] leading-5 text-slate-100">
                            {formattedDiagnostics}
                        </pre>
                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <Button variant="outline" onClick={collect}>
                                <RefreshCw aria-hidden="true" className="h-4 w-4" />
                                <span>Refresh</span>
                            </Button>
                            <Button onClick={handleCopy}>
                                {copied ? (
                                    <Check aria-hidden="true" className="h-4 w-4" />
                                ) : (
                                    <Clipboard aria-hidden="true" className="h-4 w-4" />
                                )}
                                <span>{copied ? "Copied" : "Copy diagnostics"}</span>
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
