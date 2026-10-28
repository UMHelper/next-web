import { createHash } from "node:crypto";

/**
 * Irreversible user hash used in rate-limit keys, telemetry and logs. The raw
 * Clerk user id is never persisted in counters or emitted to telemetry.
 */
export function hashUserId(userId: string): string {
  return createHash("sha256").update(userId).digest("hex").slice(0, 32);
}
