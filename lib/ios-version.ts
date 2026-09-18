import { NextResponse } from 'next/server'

/**
 * iOS 客户端版本控制。
 *
 * next-ios 会在所有 API 请求中携带：
 *   X-UM-App-Version  市场版本号，如 `1.0` / `1.2.3`
 *   X-UM-App-Build    build 号，如 `1`
 *
 * 服务端通过 UM_IOS_MIN_SUPPORTED_VERSION 配置最低支持版本。低于该版本的请求
 * 返回 426 Upgrade Required，客户端据此弹出更新提醒。
 */

export const IOS_APP_VERSION_HEADER = 'x-um-app-version'
export const IOS_APP_BUILD_HEADER = 'x-um-app-build'
export const IOS_VERSION_UNSUPPORTED_ERROR = 'client_version_unsupported'

export type IOSClientVersion = {
    appVersion: string | null
    appBuild: string | null
}

export type IOSVersionPolicy = {
    minSupportedVersion: string | null
    minSupportedVersionParts: number[] | null
    latestVersion: string | null
    updateURL: string | null
}

type IOSVersionGuardOptions = {
    /**
     * 是否允许缺少 X-UM-App-Version。
     *
     * iOS 专用的 GET / 举报接口默认不允许；评论、回复、投票等 Web/iOS 共用接口
     * 需要允许 Web 浏览器（不发送该头）继续访问。
     */
    allowMissingVersion?: boolean
}

/** 解析版本号；只取开头的 `major[.minor[.patch[.build]]]`，忽略 `1.0 (1)` 括号后缀。 */
function parseVersion(raw: string | null): number[] | null {
    if (!raw) return null
    const match = raw.trim().replace(/^v/i, '').match(/^(\d+(?:\.\d+){0,3})/)
    if (!match) return null
    const parts = match[1].split('.').map((part) => Number(part))
    if (parts.some((part) => !Number.isFinite(part))) return null
    return parts
}

function compareVersionParts(left: number[], right: number[]): number {
    const length = Math.max(left.length, right.length)
    for (let i = 0; i < length; i += 1) {
        const leftValue = left[i] ?? 0
        const rightValue = right[i] ?? 0
        if (leftValue !== rightValue) return leftValue > rightValue ? 1 : -1
    }
    return 0
}

/** 读取客户端版本头。 */
export function readIOSClientVersion(request: Request): IOSClientVersion {
    return {
        appVersion: request.headers.get(IOS_APP_VERSION_HEADER)?.trim() || null,
        appBuild: request.headers.get(IOS_APP_BUILD_HEADER)?.trim() || null,
    }
}

/** 读取服务端版本策略（来自环境变量）。 */
export function getIOSVersionPolicy(): IOSVersionPolicy {
    const minSupportedVersion = process.env.UM_IOS_MIN_SUPPORTED_VERSION?.trim() || null
    return {
        minSupportedVersion,
        minSupportedVersionParts: parseVersion(minSupportedVersion),
        latestVersion: process.env.UM_IOS_LATEST_VERSION?.trim() || null,
        updateURL: process.env.UM_IOS_UPDATE_URL?.trim() || null,
    }
}

/** 返回 426 响应体，供 iOS 端展示更新提醒。 */
export function iosUpgradeRequired(client: IOSClientVersion) {
    const policy = getIOSVersionPolicy()
    return NextResponse.json(
        {
            error: IOS_VERSION_UNSUPPORTED_ERROR,
            message: 'This version of What2REG@UM is no longer supported. Please update to continue.',
            currentVersion: client.appVersion,
            currentBuild: client.appBuild,
            minSupportedVersion: policy.minSupportedVersion,
            latestVersion: policy.latestVersion,
            updateURL: policy.updateURL,
        },
        {
            status: 426,
            headers: { 'Cache-Control': 'no-store, max-age=0' },
        },
    )
}

/**
 * 校验 iOS 版本。
 *
 * @returns 版本过旧时返回 426 Response；允许访问时返回 null。
 */
export function iosVersionGuard(
    request: Request,
    options: IOSVersionGuardOptions = {},
): NextResponse | null {
    const policy = getIOSVersionPolicy()
    // 未配置最低版本 => 不在服务端强制更新，保持向后兼容。
    if (!policy.minSupportedVersion) return null
    // 配置格式错误时跳过拦截，避免误伤全部客户端。
    if (!policy.minSupportedVersionParts) {
        console.warn(
            '[ios-version] invalid UM_IOS_MIN_SUPPORTED_VERSION, skip version gate:',
            policy.minSupportedVersion,
        )
        return null
    }

    const client = readIOSClientVersion(request)
    if (!client.appVersion) {
        if (options.allowMissingVersion) return null
        return iosUpgradeRequired(client)
    }

    const clientParts = parseVersion(client.appVersion)
    if (!clientParts) {
        return iosUpgradeRequired(client)
    }

    if (compareVersionParts(clientParts, policy.minSupportedVersionParts) < 0) {
        return iosUpgradeRequired(client)
    }

    return null
}
