import { getCloudflareContext } from "@opennextjs/cloudflare"
import { NextResponse } from "next/server"
import { z } from "zod"

export const dynamic = "force-dynamic"

const MAX_BODY_BYTES = 2_048
const PROFILE_VERSION = 2

const finiteDimension = z.number().finite().nonnegative().max(10_000)

const envelopeSchema = z.object({
    v: z.literal(PROFILE_VERSION),
    n: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
    d: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
    q: z.array(z.number().int().nonnegative().max(0xffff_ffff)).length(4),
})

const profileSchema = z.array(finiteDimension).length(24)

const serviceResultSchema = z.object({
    v: z.literal(PROFILE_VERSION),
    a: z.union([z.literal(0), z.literal(1)]),
})

const noStoreHeaders = {
    "Cache-Control": "no-store, max-age=0",
}

function base64UrlToBytes(value: string) {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/")
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function bytesToBase64Url(bytes: Uint8Array) {
    let binary = ""
    for (let index = 0; index < bytes.length; index += 1) {
        binary += String.fromCharCode(bytes[index])
    }
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function decodeProfile(value: unknown) {
    const envelope = envelopeSchema.parse(value)
    const nonce = base64UrlToBytes(envelope.n)
    const encoded = base64UrlToBytes(envelope.d)
    if (nonce.length !== 12 || encoded.length > 192) throw new Error("Invalid profile")

    const decoded = encoded.map(
        (byte, index) => byte ^ nonce[index % nonce.length] ^ ((index * 29 + 113) & 0xff),
    )
    return profileSchema.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decoded)),
    )
}

function encodeResult(code: 0 | 1) {
    const nonce = crypto.getRandomValues(new Uint8Array(6))
    return {
        v: PROFILE_VERSION,
        n: bytesToBase64Url(nonce),
        d: nonce[0] ^ (code === 1 ? 0x6d : 0xb2),
        q: Array.from(crypto.getRandomValues(new Uint32Array(3))),
    }
}

export async function POST(request: Request) {
    const contentLength = Number(request.headers.get("content-length") ?? 0)
    if (contentLength > MAX_BODY_BYTES) {
        return NextResponse.json(
            { error: "Request body too large" },
            { status: 413, headers: noStoreHeaders },
        )
    }

    const origin = request.headers.get("origin")
    if (origin && origin !== new URL(request.url).origin) {
        return NextResponse.json(
            { error: "Invalid origin" },
            { status: 403, headers: noStoreHeaders },
        )
    }

    let profile: z.infer<typeof profileSchema>
    try {
        const body = await request.text()
        if (body.length > MAX_BODY_BYTES) {
            return NextResponse.json(
                { error: "Request body too large" },
                { status: 413, headers: noStoreHeaders },
            )
        }
        profile = decodeProfile(JSON.parse(body))
    } catch {
        return NextResponse.json(
            { error: "Invalid profile data" },
            { status: 400, headers: noStoreHeaders },
        )
    }

    try {
        const service = getCloudflareContext().env.UI_PROFILE
        if (!service) throw new Error("UI_PROFILE binding is unavailable")

        const serviceResponse = await service.fetch(
            new Request("https://ui-profile.internal/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    v: PROFILE_VERSION,
                    p: profile,
                    u: request.headers.get("user-agent") ?? "",
                }),
            }),
        )

        if (!serviceResponse.ok) {
            throw new Error(`UI profile service returned HTTP ${serviceResponse.status}`)
        }

        const result = serviceResultSchema.parse(await serviceResponse.json())
        return NextResponse.json(encodeResult(result.a), { headers: noStoreHeaders })
    } catch (error) {
        console.error("UI profile service unavailable", error)
        return NextResponse.json(
            { error: "UI profile service unavailable" },
            { status: 503, headers: noStoreHeaders },
        )
    }
}
