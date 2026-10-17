const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Clerk `publicMetadata` (client) or the `metadata` session claim (server). */
export function isPilotMetadata(metadata: unknown): boolean {
  return isRecord(metadata) && metadata.aiPilot === true;
}

/**
 * Requires the Clerk session token template to include
 * `"metadata": "{{user.public_metadata}}"`.
 */
export function isAssistantPilot(sessionClaims: unknown): boolean {
  return isRecord(sessionClaims) && isPilotMetadata(sessionClaims.metadata);
}
