import { NextResponse } from 'next/server'

import { iosUnauthorized, verifyIOSRequest } from '@/lib/ios-auth'
import { getIOSVersionPolicy, iosVersionGuard, readIOSClientVersion } from '@/lib/ios-version'

export const dynamic = 'force-dynamic'

/**
 * GET /api/version
 *
 * iOS 启动时的轻量版本检查接口。若客户端版本低于 UM_IOS_MIN_SUPPORTED_VERSION，
 * 会返回 426（与其它 iOS API 的版本拦截一致），客户端据此弹出更新提醒。
 */
export async function GET(request: Request) {
    if (!verifyIOSRequest(request)) return iosUnauthorized()

    // iOS 专用接口：缺少版本头视为旧客户端（配置了最低版本时）。
    const versionResponse = iosVersionGuard(request)
    if (versionResponse) return versionResponse

    const policy = getIOSVersionPolicy()
    const client = readIOSClientVersion(request)

    return NextResponse.json(
        {
            ok: true,
            currentVersion: client.appVersion,
            currentBuild: client.appBuild,
            minSupportedVersion: policy.minSupportedVersion,
            latestVersion: policy.latestVersion,
            updateURL: policy.updateURL,
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    )
}
