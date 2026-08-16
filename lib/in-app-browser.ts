export type InAppPlatform = "android" | "ios" | "other"

export type InAppBrowserInfo = {
    isInApp: boolean
    platform: InAppPlatform
    appName: string | null
}

const APP_PATTERNS: Array<[RegExp, string]> = [
    [/MicroMessenger/i, "微信"],
    [/(?:\bQQ\/|V1_AND_SQ_)/i, "QQ"],
    [/Weibo/i, "微博"],
    [/AlipayClient/i, "支付宝"],
    [/DingTalk/i, "钉钉"],
    [/(?:FBAN|FBAV|FB_IAB)/i, "Facebook"],
    [/Instagram/i, "Instagram"],
    [/(?:Line\/|NAVER\()/i, "LINE"],
    [/(?:TikTok|musical_ly|BytedanceWebview|Toutiao|Aweme)/i, "TikTok"],
    [/Snapchat/i, "Snapchat"],
    [/LinkedInApp/i, "LinkedIn"],
    [/(?:Twitter for iPhone|TwitterAndroid)/i, "X"],
    [/GSA\//i, "Google App"],
]

const IOS_BROWSER_PATTERNS = [
    /Safari\//i,
    /CriOS\//i,
    /FxiOS\//i,
    /EdgiOS\//i,
    /OPiOS\//i,
    /DuckDuckGo\//i,
    /Ddg\//i,
    /YaBrowser\//i,
]

export function detectInAppBrowser(
    userAgent: string,
    isStandalone = false,
): InAppBrowserInfo {
    const platform: InAppPlatform = /Android/i.test(userAgent)
        ? "android"
        : /iPhone|iPad|iPod/i.test(userAgent)
          ? "ios"
          : "other"

    if (isStandalone) {
        return { isInApp: false, platform, appName: null }
    }

    const app = APP_PATTERNS.find(([pattern]) => pattern.test(userAgent))
    if (app) {
        return { isInApp: true, platform, appName: app[1] }
    }

    const isAndroidWebView =
        platform === "android" &&
        (/(?:;\s*wv\)|\bwv\b)/i.test(userAgent) ||
            /Version\/4\.0.*Chrome\//i.test(userAgent))

    const isIosWebView =
        platform === "ios" &&
        /AppleWebKit/i.test(userAgent) &&
        /Mobile\//i.test(userAgent) &&
        !IOS_BROWSER_PATTERNS.some((pattern) => pattern.test(userAgent))

    return {
        isInApp: isAndroidWebView || isIosWebView,
        platform,
        appName: null,
    }
}

export function getSystemBrowserUrl(
    currentUrl: string,
    platform: InAppPlatform,
): string | null {
    let url: URL

    try {
        url = new URL(currentUrl)
    } catch {
        return null
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
        return null
    }

    if (platform === "android") {
        const scheme = url.protocol.slice(0, -1)
        return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${scheme};action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`
    }

    if (platform === "ios") {
        return `x-safari-${url.protocol}//${url.host}${url.pathname}${url.search}${url.hash}`
    }

    return null
}
