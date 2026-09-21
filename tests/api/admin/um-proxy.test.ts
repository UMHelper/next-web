import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin }));

import { GET, resolveUmResource } from "@/app/api/admin/um-proxy/route";

describe("resolveUmResource", () => {
  it("maps allowlisted resources to UM paths", () => {
    expect(resolveUmResource("course_catalog")).toBe("course_catalog/all");
    expect(resolveUmResource("course_catalog_v1")).toBe("course_catalog/v1.0.0/all");
    expect(resolveUmResource("courses")).toBe("courses/all");
    expect(resolveUmResource("evil")).toBeNull();
    expect(resolveUmResource(null)).toBeNull();
  });
});

describe("/api/admin/um-proxy", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.UM_OPEN_DATA_TOKEN = "token_test";
    requireAdmin.mockResolvedValue({ ok: true, session: { userId: "user_admin", isPlatformAdmin: true } });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ _embedded: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("proxies with the server token", async () => {
    const request = new Request(
      "http://localhost/api/admin/um-proxy?resource=course_catalog&course_code=acct1000",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.data.um.edu.mo/service/academic/course_catalog/all?course_code=ACCT1000");
    expect((init.headers as Record<string, string>).Authorization).toBe("token_test");
  });

  it("rejects unknown resources", async () => {
    const request = new Request("http://localhost/api/admin/um-proxy?resource=evil&course_code=X");
    const response = await GET(request);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires platform admin", async () => {
    requireAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: { code: "forbidden", message: "x" } }, { status: 403 }),
    });
    const request = new Request("http://localhost/api/admin/um-proxy?resource=course_catalog&course_code=X");
    const response = await GET(request);
    expect(response.status).toBe(403);
  });
});
