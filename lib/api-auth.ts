import { auth } from "@clerk/nextjs/server";
import type { NextResponse } from "next/server";

import { apiError } from "@/lib/api-response";
import { verifyIOSRequest } from "@/lib/ios-auth";
import { iosVersionGuard } from "@/lib/ios-version";
import { identityIdSchema } from "@/lib/validation/identity";

export const IOS_VIEWER_HEADER = "x-um-viewer-id";

export type WriteIdentity = {
  platform: "web" | "ios";
  id: string;
};

export type CommentIdentity = WriteIdentity | {
  platform: "anonymous";
  id: string;
};

export function getClientIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export type ReportIdentity = WriteIdentity & {
  source: "web" | "ios";
};

export async function resolveReportIdentity(
  request: Request,
): Promise<{ identity: ReportIdentity } | { response: NextResponse }> {
  if (verifyIOSRequest(request)) {
    const versionResponse = iosVersionGuard(request);
    if (versionResponse) return { response: versionResponse };

    return {
      identity: {
        platform: "ios",
        id: `ip:${getClientIp(request)}`,
        source: "ios",
      },
    };
  }

  const { userId } = auth();
  if (!userId) {
    return { response: apiError("unauthorized", "Sign in required", 401) };
  }

  return {
    identity: {
      platform: "web",
      id: userId,
      source: "web",
    },
  };
}

/**
 * 评论提交允许匿名 Web 用户；如果能识别 Clerk 或 iOS 身份则使用身份，
 * 否则退化为按 IP 限流的 anonymous identity。回复和投票仍使用 requireWriteIdentity。
 */
export async function resolveCommentIdentity(
  request: Request,
): Promise<{ identity: CommentIdentity } | { response: NextResponse }> {
  if (verifyIOSRequest(request)) {
    const versionResponse = iosVersionGuard(request, { allowMissingVersion: true });
    if (versionResponse) return { response: versionResponse };

    const viewerId = request.headers.get(IOS_VIEWER_HEADER)?.trim() ?? "";
    const parsed = identityIdSchema.safeParse(viewerId);
    if (!parsed.success) {
      return { response: apiError("invalid_request", `Missing or invalid ${IOS_VIEWER_HEADER}`, 400) };
    }

    return { identity: { platform: "ios", id: parsed.data } };
  }

  const { userId } = auth();
  if (userId) {
    return { identity: { platform: "web", id: userId } };
  }

  return { identity: { platform: "anonymous", id: `ip:${getClientIp(request)}` } };
}

export async function requireWriteIdentity(
  request: Request,
): Promise<{ identity: WriteIdentity } | { response: NextResponse }> {
  if (verifyIOSRequest(request)) {
    const versionResponse = iosVersionGuard(request, { allowMissingVersion: true });
    if (versionResponse) return { response: versionResponse };

    const viewerId = request.headers.get(IOS_VIEWER_HEADER)?.trim() ?? "";
    const parsed = identityIdSchema.safeParse(viewerId);
    if (!parsed.success) {
      return { response: apiError("invalid_request", `Missing or invalid ${IOS_VIEWER_HEADER}`, 400) };
    }

    return { identity: { platform: "ios", id: parsed.data } };
  }

  const { userId } = auth();
  if (!userId) {
    return { response: apiError("unauthorized", "Sign in required", 401) };
  }

  return { identity: { platform: "web", id: userId } };
}

export function rateLimitKey(identity: CommentIdentity, action: "comment" | "reply" | "vote" | "report") {
  return `${identity.platform}:${identity.id}:${action}`;
}
