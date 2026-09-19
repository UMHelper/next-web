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

export function rateLimitKey(identity: WriteIdentity, action: "comment" | "reply" | "vote") {
  return `${identity.platform}:${identity.id}:${action}`;
}
