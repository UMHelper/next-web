import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveReportIdentity,
  consumeRateLimit,
  commentMaybeSingle,
  profMaybeSingle,
  sendTelegramMessage,
} = vi.hoisted(() => ({
  resolveReportIdentity: vi.fn(),
  consumeRateLimit: vi.fn(),
  commentMaybeSingle: vi.fn(),
  profMaybeSingle: vi.fn(),
  sendTelegramMessage: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  resolveReportIdentity,
  rateLimitKey: () => "web:user_1:report",
}));
vi.mock("@/lib/rate-limit", () => ({ consumeRateLimit }));
vi.mock("@/lib/supabase/admin", () => ({
  default: {
    from: vi.fn((table: string) => {
      const maybeSingle = table === "comment" ? commentMaybeSingle : profMaybeSingle;
      return { select: () => ({ eq: () => ({ maybeSingle }) }) };
    }),
  },
}));
vi.mock("@/lib/telegram", () => ({
  escapeTelegramHtml: (value: string) => value,
  truncateTelegramText: (value: string) => value,
  sendTelegramMessage,
}));

import { POST } from "@/app/api/report/route";

const comment = {
  id: 7,
  content: "bad comment",
  course_id: 3,
  verify_account: "user_author",
  pub_time: "2026-09-19 10:00:00",
};
const prof = { course_id: "ACCT1000", prof_id: "TEACHER" };

function request(body: unknown) {
  return new Request("http://localhost/api/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveReportIdentity.mockResolvedValue({
      identity: { platform: "web", id: "user_1", source: "web" },
    });
    consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfter: 0 });
    commentMaybeSingle.mockResolvedValue({ data: comment, error: null });
    profMaybeSingle.mockResolvedValue({ data: prof, error: null });
    sendTelegramMessage.mockResolvedValue(undefined);
  });

  it("returns 401 for anonymous web", async () => {
    resolveReportIdentity.mockResolvedValue({
      response: new Response(JSON.stringify({ error: { code: "unauthorized", message: "Sign in required" } }), {
        status: 401,
      }),
    });

    const response = await POST(request({ targetId: 7, reason: "spam" }));
    expect(response.status).toBe(401);
  });

  it("accepts a web report and ignores client identity fields", async () => {
    const response = await POST(
      request({
        targetId: 7,
        reason: "spam",
        reporterId: "spoofed",
        courseCode: "FAKE",
        professor: "FAKE",
      }),
    );

    expect(response.status).toBe(200);
    const message = sendTelegramMessage.mock.calls[0][0] as string;
    expect(message).toContain("<b>Source:</b> web");
    expect(message).toContain("<b>Reporter:</b> <code>user_1</code>");
    expect(message).not.toContain("spoofed");
  });

  it("requires details for reason=other", async () => {
    const response = await POST(request({ targetId: 7, reason: "other" }));
    expect(response.status).toBe(400);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("returns 404 when the target comment does not exist", async () => {
    commentMaybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await POST(request({ targetId: 999, reason: "spam" }));
    expect(response.status).toBe(404);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("accepts iOS reports with the existing source", async () => {
    resolveReportIdentity.mockResolvedValue({
      identity: { platform: "ios", id: "ip:1.2.3.4", source: "ios" },
    });

    const response = await POST(
      request({ targetId: 7, reason: "spam", reporterId: "local-uuid", appVersion: "1.0" }),
    );

    expect(response.status).toBe(200);
    const message = sendTelegramMessage.mock.calls[0][0] as string;
    expect(message).toContain("<b>Source:</b> ios");
    expect(message).toContain("Reporter (client-provided)");
  });

  it("returns 429 when rate limited", async () => {
    consumeRateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 3600 });
    const response = await POST(request({ targetId: 7, reason: "spam" }));
    expect(response.status).toBe(429);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
