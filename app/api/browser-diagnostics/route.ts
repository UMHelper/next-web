import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const DIAGNOSTIC_HEADERS = [
    "user-agent",
    "referer",
    "origin",
    "x-requested-with",
    "sec-fetch-site",
    "sec-fetch-mode",
    "sec-fetch-dest",
    "sec-fetch-user",
    "sec-ch-ua",
    "sec-ch-ua-mobile",
    "sec-ch-ua-platform",
    "accept-language",
    "priority",
    "via",
    "cf-ray",
    "cf-ipcountry",
    "cf-visitor",
] as const

export async function GET(request: Request) {
    const url = new URL(request.url)
    const headers = Object.fromEntries(
        DIAGNOSTIC_HEADERS.map((name) => [name, request.headers.get(name)]),
    )

    return NextResponse.json(
        {
            capturedAt: new Date().toISOString(),
            request: {
                host: url.host,
                protocol: url.protocol,
            },
            headers,
        },
        {
            headers: {
                "Cache-Control": "no-store, max-age=0",
            },
        },
    )
}
