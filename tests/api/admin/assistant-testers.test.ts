import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

type DbError = { code?: string; message: string };
type TesterRow = { email: string; added_by: string; created_at: string };

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  writeAuditLog: vi.fn(),
  getClerkUserEmails: vi.fn(),
  insert: vi.fn(),
  deleteEq: vi.fn(),
  db: {
    list: { data: [] as TesterRow[], error: null as DbError | null },
    count: { count: 0 as number | null, error: null as DbError | null },
    insert: { error: null as DbError | null },
    remove: { data: [] as Array<{ email: string }>, error: null as DbError | null },
  },
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: mocks.requireAdmin,
  getClerkUserEmails: mocks.getClerkUserEmails,
}));
vi.mock("@/lib/admin-audit", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/supabase/admin", () => ({
  default: {
    from: () => ({
      select: (_columns: string, options?: { head?: boolean }) =>
        options?.head
          ? Promise.resolve(mocks.db.count)
          : { order: () => ({ limit: () => Promise.resolve(mocks.db.list) }) },
      insert: (rows: unknown) => {
        mocks.insert(rows);
        return Promise.resolve(mocks.db.insert);
      },
      delete: () => ({
        eq: (column: string, value: string) => {
          mocks.deleteEq(column, value);
          return { select: () => Promise.resolve(mocks.db.remove) };
        },
      }),
    }),
  },
}));

import { GET, POST } from "@/app/api/admin/assistant-testers/route";
import { DELETE } from "@/app/api/admin/assistant-testers/[email]/route";

const tester: TesterRow = { email: "tester@um.edu.mo", added_by: "user_admin", created_at: "2026-10-18T08:00:00Z" };

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/admin/assistant-testers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const remove = (encodedEmail: string) =>
  DELETE(new Request(`http://localhost/api/admin/assistant-testers/${encodedEmail}`, { method: "DELETE" }), {
    params: Promise.resolve({ email: encodedEmail }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: true } });
  mocks.getClerkUserEmails.mockResolvedValue(new Map([["user_admin", "admin@um.edu.mo"]]));
  mocks.db.list = { data: [tester], error: null };
  mocks.db.count = { count: 0, error: null };
  mocks.db.insert = { error: null };
  mocks.db.remove = { data: [{ email: "tester@um.edu.mo" }], error: null };
});

describe("assistant testers API", () => {
  it.each([401, 403])("passes through a %i from requireAdmin and asks for platform admin", async (status) => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "x", message: "x" } }, { status }),
    });
    expect((await GET()).status).toBe(status);
    expect((await post({ email: "a@b.co" })).status).toBe(status);
    expect((await remove("a%40b.co")).status).toBe(status);
    expect(mocks.requireAdmin).toHaveBeenCalledWith({ platformOnly: true });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });

  describe("GET", () => {
    it("lists testers with the adding admin's email", async () => {
      const response = await GET();
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        testers: [{ ...tester, added_by_email: "admin@um.edu.mo" }],
      });
      expect(mocks.getClerkUserEmails).toHaveBeenCalledWith(["user_admin"]);
    });

    it("returns 500 when the query fails", async () => {
      mocks.db.list = { data: [], error: { message: "db down" } };
      expect((await GET()).status).toBe(500);
    });
  });

  describe("POST", () => {
    it("adds a trimmed, lowercased email and audits it", async () => {
      const response = await post({ email: "  Tester@UM.edu.mo " });
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({ ok: true, email: "tester@um.edu.mo" });
      expect(mocks.insert).toHaveBeenCalledWith([{ email: "tester@um.edu.mo", added_by: "user_admin" }]);
      expect(mocks.writeAuditLog).toHaveBeenCalledWith({
        actorId: "user_admin",
        action: "assistant_tester.add",
        targetType: "assistant_tester",
        targetId: "tester@um.edu.mo",
        after: { email: "tester@um.edu.mo" },
      });
    });

    it.each([[{ email: "not-an-email" }], [{ email: "" }], [{}], [{ email: `${"a".repeat(250)}@um.edu.mo` }]])(
      "rejects %j",
      async (body) => {
        expect((await post(body)).status).toBe(400);
        expect(mocks.insert).not.toHaveBeenCalled();
      },
    );

    it("returns 409 for a duplicate", async () => {
      mocks.db.insert = { error: { code: "23505", message: "duplicate key" } };
      const response = await post({ email: "tester@um.edu.mo" });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "already_exists" } });
      expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    });

    it("returns 409 once the list is full, without inserting", async () => {
      mocks.db.count = { count: 200, error: null };
      const response = await post({ email: "new@um.edu.mo" });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ error: { code: "tester_limit" } });
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("returns 500 when counting fails", async () => {
      mocks.db.count = { count: null, error: { message: "db down" } };
      expect((await post({ email: "new@um.edu.mo" })).status).toBe(500);
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("returns 500 when the count is missing without an error", async () => {
      mocks.db.count = { count: null, error: null };
      expect((await post({ email: "new@um.edu.mo" })).status).toBe(500);
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it("returns 500 for other insert errors", async () => {
      mocks.db.insert = { error: { code: "XX000", message: "boom" } };
      expect((await post({ email: "new@um.edu.mo" })).status).toBe(500);
    });
  });

  describe("DELETE", () => {
    it("removes a URL-encoded, mixed-case email and audits it", async () => {
      const response = await remove("Tester%40UM.edu.mo");
      expect(response.status).toBe(200);
      expect(mocks.deleteEq).toHaveBeenCalledWith("email", "tester@um.edu.mo");
      expect(mocks.writeAuditLog).toHaveBeenCalledWith({
        actorId: "user_admin",
        action: "assistant_tester.remove",
        targetType: "assistant_tester",
        targetId: "tester@um.edu.mo",
        before: { email: "tester@um.edu.mo" },
      });
    });

    it("returns 404 when the email is not listed", async () => {
      mocks.db.remove = { data: [], error: null };
      expect((await remove("ghost%40um.edu.mo")).status).toBe(404);
      expect(mocks.writeAuditLog).not.toHaveBeenCalled();
    });

    it.each(["not-an-email", "%E0%A4%A"])("rejects %s", async (raw) => {
      expect((await remove(raw)).status).toBe(400);
      expect(mocks.deleteEq).not.toHaveBeenCalled();
    });

    it("returns 500 when the delete fails", async () => {
      mocks.db.remove = { data: [], error: { message: "db down" } };
      expect((await remove("tester%40um.edu.mo")).status).toBe(500);
    });
  });
});
