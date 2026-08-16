import crypto from 'crypto'
import { NextResponse } from 'next/server'

/**
 * iOS 客户端专用 API 认证(2FA/TOTP 思路:共享密钥 + 时间戳窗口签名)。
 *
 * 请求头:
 *   X-UM-Timestamp   Unix 秒
 *   X-UM-Signature  HMAC-SHA256(secret, `${method}\n${pathname}\n${timestamp}`) 的 hex
 *
 * 校验规则:
 *   - 时间戳与服务器时间差 ≤ 5s(允许的有效期)
 *   - 签名恒定时间比较(timingSafeEqual)
 *
 * 密钥通过环境变量 UM_IOS_API_SECRET 配置(.env.local,不入库)。
 */
export function verifyIOSRequest(request: Request): boolean {
    const secret = process.env.UM_IOS_API_SECRET
    if (!secret) {
        return false
    }

    const timestamp = request.headers.get('x-um-timestamp')
    const signature = request.headers.get('x-um-signature')
    if (!timestamp || !signature) {
        return false
    }

    const ts = Number(timestamp)
    if (!Number.isFinite(ts)) {
        return false
    }

    // 有效期 5 秒
    if (Math.abs(Date.now() / 1000 - ts) > 5) {
        return false
    }

    const url = new URL(request.url)
    const message = `${request.method}\n${url.pathname}\n${timestamp}`
    const expected = crypto
        .createHmac('sha256', secret)
        .update(message)
        .digest('hex')

    const expectedBuf = Buffer.from(expected, 'utf8')
    const providedBuf = Buffer.from(signature.toLowerCase(), 'utf8')

    return expectedBuf.length === providedBuf.length && crypto.timingSafeEqual(expectedBuf, providedBuf)
}

/** 认证失败统一响应 */
export function iosUnauthorized() {
    return new NextResponse(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
    })
}
