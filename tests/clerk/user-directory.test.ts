import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserList } = vi.hoisted(() => ({ getUserList: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: { users: { getUserList } },
}));

import {
  __resetDirectoryCacheForTests,
  getDirectoryUser,
  getDirectoryUsers,
  getVerifiedPrimaryEmail,
  toDirectoryUser,
} from "@/lib/clerk/user-directory";

function clerkUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    primaryEmailAddressId: "email_1",
    emailAddresses: [
      { id: "email_1", emailAddress: "Admin@Example.com", verification: { status: "verified" } },
    ],
    firstName: "Ada",
    lastName: "Lovelace",
    imageUrl: "https://img.clerk.com/a.png",
    publicMetadata: { role: "platform_admin" },
    ...overrides,
  };
}

describe("user-directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetDirectoryCacheForTests();
  });

  it("returns only a verified primary email", () => {
    expect(getVerifiedPrimaryEmail(clerkUser() as never)).toBe("admin@example.com");
  });

  it("returns null for an unverified primary email", () => {
    const user = clerkUser({
      emailAddresses: [
        { id: "email_1", emailAddress: "admin@example.com", verification: { status: "unverified" } },
      ],
    });
    expect(getVerifiedPrimaryEmail(user as never)).toBeNull();
  });

  it("does not fall back to a non-primary email", () => {
    const user = clerkUser({
      primaryEmailAddressId: "missing",
      emailAddresses: [
        { id: "email_2", emailAddress: "other@example.com", verification: { status: "verified" } },
      ],
    });
    expect(getVerifiedPrimaryEmail(user as never)).toBeNull();
  });

  it("maps a Clerk user to a directory user", () => {
    expect(toDirectoryUser(clerkUser() as never)).toEqual({
      id: "user_1",
      primaryEmail: "admin@example.com",
      emailVerified: true,
      firstName: "Ada",
      lastName: "Lovelace",
      imageUrl: "https://img.clerk.com/a.png",
      publicMetadata: { role: "platform_admin" },
    });
  });

  it("caches users within the TTL", async () => {
    getUserList.mockResolvedValue([clerkUser()]);
    const first = await getDirectoryUser("user_1");
    const second = await getDirectoryUser("user_1");
    expect(first?.id).toBe("user_1");
    expect(second?.id).toBe("user_1");
    expect(getUserList).toHaveBeenCalledTimes(1);
  });

  it("chunks large id lists into batches of at most 100", async () => {
    getUserList.mockResolvedValue([]);
    const ids = Array.from({ length: 150 }, (_, index) => `user_${index}`);
    await getDirectoryUsers(ids);
    expect(getUserList).toHaveBeenCalledTimes(2);
    expect(getUserList.mock.calls[0][0].limit).toBe(100);
    expect(getUserList.mock.calls[1][0].limit).toBe(50);
  });

  it("returns an empty map when Clerk fails", async () => {
    getUserList.mockRejectedValue(new Error("boom"));
    const result = await getDirectoryUsers(["user_1"]);
    expect(result.size).toBe(0);
  });
});
