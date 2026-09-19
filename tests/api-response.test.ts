import { describe, expect, it } from "vitest";
import { apiError, readJsonBody } from "@/lib/api-response";

describe("apiError", () => {
  it("returns the normalized error envelope", async () => {
    const response = apiError("invalid_request", "Bad input", 400);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "invalid_request", message: "Bad input" },
    });
  });
});

describe("readJsonBody", () => {
  it("rejects a body larger than the limit", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "2048" },
      body: JSON.stringify({ value: "x".repeat(2048) }),
    });
    const result = await readJsonBody(request, 1024);
    expect(result.ok).toBe(false);
  });

  it("parses valid JSON", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: 1 }),
    });
    const result = await readJsonBody(request, 1024);
    expect(result).toEqual({ ok: true, data: { value: 1 } });
  });
});
