import { describe, expect, it, vi } from "vitest";
import { submitComment } from "@/lib/submit-comment";

function form() {
  const data = new FormData();
  data.set("content", "hello");
  return data;
}

describe("submitComment", () => {
  it("returns ok for a 2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const result = await submitComment({ url: "/api/comment/A/B", formData: form(), fetchImpl });
    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns the server error for a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "invalid_request", message: "Bad input" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const result = await submitComment({ url: "/api/comment/A/B", formData: form(), fetchImpl });
    expect(result).toEqual({ ok: false, status: 400, message: "Bad input" });
  });

  it("returns a network error when fetch rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await submitComment({ url: "/api/comment/A/B", formData: form(), fetchImpl });
    expect(result).toEqual({ ok: false, status: 0, message: "network down" });
  });
});
