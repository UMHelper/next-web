import "server-only";

import { clerkClient } from "@clerk/nextjs/server";

export type ClerkDirectoryUser = {
  id: string;
  primaryEmail: string | null;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  publicMetadata: Record<string, unknown>;
};

type ClerkEmailAddressLike = {
  id: string;
  emailAddress: string;
  verification?: { status: string | null } | null;
};

type ClerkUserLike = {
  id: string;
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmailAddressLike[];
  firstName?: string | null;
  lastName?: string | null;
  imageUrl?: string | null;
  publicMetadata?: Record<string, unknown> | null;
};

const DEFAULT_TTL_MS = 60_000;
const MAX_USERS_PER_CALL = 100;

type CacheEntry = { value: ClerkDirectoryUser; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export function getVerifiedPrimaryEmail(user: {
  primaryEmailAddressId: string | null;
  emailAddresses: ClerkEmailAddressLike[];
}): string | null {
  const primary = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  if (!primary || primary.verification?.status !== "verified") return null;
  return primary.emailAddress.toLowerCase();
}

export function toDirectoryUser(user: ClerkUserLike): ClerkDirectoryUser {
  const primaryEmail = getVerifiedPrimaryEmail(user);
  return {
    id: user.id,
    primaryEmail,
    emailVerified: primaryEmail !== null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    imageUrl: user.imageUrl ?? null,
    publicMetadata: user.publicMetadata ?? {},
  };
}

export function invalidateDirectoryCache(userIds?: string[]): void {
  if (!userIds) {
    cache.clear();
    return;
  }
  for (const id of userIds) cache.delete(id);
}

export function __resetDirectoryCacheForTests(): void {
  cache.clear();
}

function readCache(id: string): ClerkDirectoryUser | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(id);
    return null;
  }
  return entry.value;
}

function writeCache(user: ClerkDirectoryUser): void {
  cache.set(user.id, { value: user, expiresAt: Date.now() + DEFAULT_TTL_MS });
}

export async function getDirectoryUser(userId: string): Promise<ClerkDirectoryUser | null> {
  const users = await getDirectoryUsers([userId]);
  return users.get(userId) ?? null;
}

export async function getDirectoryUsers(
  userIds: string[],
): Promise<Map<string, ClerkDirectoryUser>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, ClerkDirectoryUser>();
  const missing: string[] = [];

  for (const id of uniqueIds) {
    const cached = readCache(id);
    if (cached) result.set(id, cached);
    else missing.push(id);
  }

  for (let index = 0; index < missing.length; index += MAX_USERS_PER_CALL) {
    const chunk = missing.slice(index, index + MAX_USERS_PER_CALL);
    try {
      const users = await clerkClient.users.getUserList({
        userId: chunk,
        limit: chunk.length,
      });
      for (const user of users) {
        const mapped = toDirectoryUser(user as unknown as ClerkUserLike);
        writeCache(mapped);
        result.set(mapped.id, mapped);
      }
    } catch (error) {
      console.error(
        "[clerk-directory] failed to load users:",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return result;
}
