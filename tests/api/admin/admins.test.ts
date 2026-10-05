import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireAdmin, clerkClient, writeAuditLog, upsert, getClerkUserEmails } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  clerkClient: vi.fn(),
  writeAuditLog: vi.fn(),
  upsert: vi.fn(),
  getClerkUserEmails: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient }));
vi.mock("@/lib/admin-auth", () => ({
  requireAdmin,
  getClerkUserEmails,
  getPlatformAdminEmails: () => new Set<string>(),
  getPlatformAdminIds: () => new Set<string>(),
}));
vi.mock("@/lib/admin-audit", () => ({ writeAuditLog }));
vi.mock("@/lib/supabase/admin", () => ({
  default: { from: () => ({ upsert }) },
}));

import { POST } from "@/app/api/admin/admins/route";

function clerkUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user_2abc",
    primaryEmailAddressId: "email_1",
    emailAddresses: [
      { id: "email_1", emailAddress: "Admin@Example.com", verification: { status: "verified" } },
    ],
    firstName: "Ada",
    lastName: "Lovelace",
    imageUrl: null,
    publicMetadata: {},
    ...overrides,
  };
}

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/admin/admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/admin/admins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLERK_SECRET_KEY = "sk_test_secret";
    requireAdmin.mockResolvedValue({
      ok: true,
      session: { userId: "user_admin", isPlatformAdmin: true },
    });
    writeAuditLog.mockResolvedValue(undefined);
    upsert.mockResolvedValue({ error: null });
  });

  it("resolves an email grant through the awaited Clerk client", async () => {
    const client = {
      users: {
        getUserList: vi.fn().mockResolvedValue({ data: [clerkUser()] }),
        getUser: vi.fn(),
      },
    };
    clerkClient.mockResolvedValue(client);

    const response = await post({ clerk_user_id: "admin@example.com" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      clerk_user_id: "user_2abc",
      email: "admin@example.com",
    });
    expect(clerkClient).toHaveBeenCalledTimes(1);
    expect(client.users.getUserList).toHaveBeenCalledWith({
      emailAddress: ["admin@example.com"],
      limit: 2,
    });
    expect(client.users.getUser).not.toHaveBeenCalled();
    expect(writeAuditLog).toHaveBeenCalledOnce();
  });

  it("resolves a Clerk user-id grant through the awaited Clerk client", async () => {
    const client = {
      users: {
        getUserList: vi.fn(),
        getUser: vi.fn().mockResolvedValue(clerkUser({ id: "user_direct" })),
      },
    };
    clerkClient.mockResolvedValue(client);

    const response = await post({ clerk_user_id: "user_direct" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      clerk_user_id: "user_direct",
      email: "admin@example.com",
    });
    expect(clerkClient).toHaveBeenCalledTimes(1);
    expect(client.users.getUser).toHaveBeenCalledWith("user_direct");
    expect(client.users.getUserList).not.toHaveBeenCalled();
  });
});
