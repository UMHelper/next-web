import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));

import {
  MAX_RELAY_BODY_BYTES,
  buildRelayHeaders,
  isAllowedRelayPath,
} from "@/lib/supabase-relay";
import { GET, POST } from "@/app/api/admin/supabase/[...path]/route";

function ctx(...path: string[]) {
  return { params: { path } };
}

describe("isAllowedRelayPath", () => {
  it("allows tables and rpc, rejects everything else", () => {
    expect(isAllowedRelayPath(["rest", "v1", "course_noporf"])).toBe(true);
    expect(isAllowedRelayPath(["rest", "v1", "rpc", "admin_resolve_known_codes"])).toBe(true);
    expect(isAllowedRelayPath(["rest", "v1", "course_noporf", "extra"])).toBe(false);
    expect(isAllowedRelayPath(["rest", "v1", "bad-table"])).toBe(false);
    expect(isAllowedRelayPath(["auth", "v1", "user"])).toBe(false);
    expect(isAllowedRelayPath(["rest", "v1", ".."])).toBe(false);
  });
});

describe("buildRelayHeaders", () => {
  it("keeps allowlisted headers and overrides credentials", () => {
    const input = new Headers({
      Authorization: "Bearer evil",
      Cookie: "evil=1",
      Prefer: "return=representation",
      "Content-Type": "application/json",
      Range: "0-9",
    });
    const out = buildRelayHeaders(input, "sb_secret_test");
    expect(out.get("apikey")).toBe("sb_secret_test");
    expect(out.get("Authorization")).toBeNull();
    expect(out.get("Cookie")).toBeNull();
    expect(out.get("Prefer")).toBe("return=representation");
    expect(out.get("Content-Type")).toBe("application/json");
    expect(out.get("Range")).toBe("0-9");
  });
});

describe("/api/admin/supabase relay", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
    requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: true } });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify([{ New_code: "ACCT1000" }]), {
        status: 200,
        headers: { "content-type": "application/json", "content-range": "0-0/1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("rejects non-platform-admins", async () => {
    requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "forbidden", message: "x" } }, { status: 403 }),
    });
    const response = await GET(new Request("http://localhost/api/admin/supabase/rest/v1/course_noporf"), ctx("rest", "v1", "course_noporf"));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards to PostgREST with the server secret and no client auth", async () => {
    const request = new Request(
      "http://localhost/api/admin/supabase/rest/v1/course_noporf?select=New_code",
      { headers: { Authorization: "Bearer evil" } },
    );
    const response = await GET(request, ctx("rest", "v1", "course_noporf"));

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/rest/v1/course_noporf?select=New_code");
    expect((init.headers as Headers).get("apikey")).toBe("sb_secret_test");
    expect((init.headers as Headers).get("Authorization")).toBeNull();
    expect(response.headers.get("content-range")).toBe("0-0/1");
  });

  it("rejects disallowed paths", async () => {
    const response = await GET(new Request("http://localhost/api/admin/supabase/auth/v1/user"), ctx("auth", "v1", "user"));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized bodies", async () => {
    const big = "x".repeat(MAX_RELAY_BODY_BYTES + 1);
    const request = new Request("http://localhost/api/admin/supabase/rest/v1/course_noporf", {
      method: "POST",
      body: big,
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request, ctx("rest", "v1", "course_noporf"));
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
