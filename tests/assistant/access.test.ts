import { beforeEach, describe, expect, it, vi } from "vitest";

type QueryResult = { data: Record<string, unknown> | null; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  resolveAdminSession: vi.fn(),
  getDirectoryUser: vi.fn(),
  modeResult: vi.fn<() => Promise<QueryResult>>(),
  testerResult: vi.fn<() => Promise<QueryResult>>(),
  from: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }));
vi.mock("@/lib/admin-auth", () => ({ resolveAdminSession: mocks.resolveAdminSession }));
vi.mock("@/lib/clerk/user-directory", () => ({ getDirectoryUser: mocks.getDirectoryUser }));
vi.mock("@/lib/supabase/admin", () => ({ default: { from: mocks.from } }));

import { canUseAssistant, readAssistantAccess } from "@/lib/assistant/access";

function table(name: string) {
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => {
      mocks.eq(name, column, value);
      return chain;
    },
    maybeSingle: name === "app_config" ? mocks.modeResult : mocks.testerResult,
  };
  return chain;
}

const setMode = (mode: unknown) =>
  mocks.modeResult.mockResolvedValue({ data: { ai_assistant_access: mode }, error: null });
const queriedTesters = () => mocks.from.mock.calls.some(([name]) => name === "assistant_testers");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.from.mockImplementation(table);
  mocks.resolveAdminSession.mockResolvedValue({ ok: true, session: null });
  mocks.getDirectoryUser.mockResolvedValue({ id: "user_1", primaryEmail: "tester@um.edu.mo" });
  mocks.testerResult.mockResolvedValue({ data: null, error: null });
  setMode("testers");
});

describe("readAssistantAccess", () => {
  it("reads only the mode column of the single config row", async () => {
    setMode("everyone");
    await expect(readAssistantAccess()).resolves.toBe("everyone");
    expect(mocks.eq).toHaveBeenCalledWith("app_config", "id", 1);
  });

  it("treats an unknown value as off", async () => {
    setMode("admins");
    await expect(readAssistantAccess()).resolves.toBe("off");
  });

  it("fails closed when the read errors (for example before the migration)", async () => {
    mocks.modeResult.mockResolvedValue({ data: null, error: { message: "column does not exist" } });
    await expect(readAssistantAccess()).resolves.toBe("off");
  });

  it("fails closed when the client throws", async () => {
    mocks.modeResult.mockRejectedValue(new Error("network"));
    await expect(readAssistantAccess()).resolves.toBe("off");
  });
});

describe("canUseAssistant", () => {
  it("denies signed-out users without reading anything", async () => {
    await expect(canUseAssistant(null)).resolves.toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("denies everyone when off, without admin or tester lookups", async () => {
    setMode("off");
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
    expect(mocks.resolveAdminSession).not.toHaveBeenCalled();
    expect(mocks.getDirectoryUser).not.toHaveBeenCalled();
  });

  it("allows any signed-in user when everyone, without admin or tester lookups", async () => {
    setMode("everyone");
    await expect(canUseAssistant("user_1")).resolves.toBe(true);
    expect(mocks.resolveAdminSession).not.toHaveBeenCalled();
    expect(mocks.getDirectoryUser).not.toHaveBeenCalled();
  });

  it("allows admins in testers mode without a tester lookup", async () => {
    mocks.resolveAdminSession.mockResolvedValue({
      ok: true,
      session: { userId: "user_1", isPlatformAdmin: false },
    });
    await expect(canUseAssistant("user_1")).resolves.toBe(true);
    expect(mocks.resolveAdminSession).toHaveBeenCalledWith("user_1");
    expect(queriedTesters()).toBe(false);
  });

  it("allows a listed tester by verified email", async () => {
    mocks.testerResult.mockResolvedValue({ data: { email: "tester@um.edu.mo" }, error: null });
    await expect(canUseAssistant("user_1")).resolves.toBe(true);
    expect(mocks.getDirectoryUser).toHaveBeenCalledWith("user_1");
    expect(mocks.eq).toHaveBeenCalledWith("assistant_testers", "email", "tester@um.edu.mo");
  });

  it("matches tester emails case-insensitively", async () => {
    mocks.getDirectoryUser.mockResolvedValue({ id: "user_1", primaryEmail: "Tester@UM.edu.mo" });
    mocks.testerResult.mockResolvedValue({ data: { email: "tester@um.edu.mo" }, error: null });
    await expect(canUseAssistant("user_1")).resolves.toBe(true);
    expect(mocks.eq).toHaveBeenCalledWith("assistant_testers", "email", "tester@um.edu.mo");
  });

  it("denies a signed-in user who is neither admin nor tester", async () => {
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
  });

  it("denies a user without a verified email, without a tester query", async () => {
    mocks.getDirectoryUser.mockResolvedValue({ id: "user_1", primaryEmail: null });
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
    expect(queriedTesters()).toBe(false);
  });

  it("denies when Clerk returns no user", async () => {
    mocks.getDirectoryUser.mockResolvedValue(null);
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
  });

  it("denies when the admin lookup fails, without a tester lookup", async () => {
    mocks.resolveAdminSession.mockResolvedValue({ ok: false });
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
    expect(mocks.getDirectoryUser).not.toHaveBeenCalled();
  });

  it("denies when the admin lookup throws", async () => {
    mocks.resolveAdminSession.mockRejectedValue(new Error("clerk down"));
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
  });

  it("denies when the tester query errors", async () => {
    mocks.testerResult.mockResolvedValue({ data: null, error: { message: "relation does not exist" } });
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
  });

  it("denies when the mode cannot be read", async () => {
    mocks.modeResult.mockResolvedValue({ data: null, error: { message: "db down" } });
    await expect(canUseAssistant("user_1")).resolves.toBe(false);
    expect(mocks.resolveAdminSession).not.toHaveBeenCalled();
  });
});
