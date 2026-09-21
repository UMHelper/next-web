import { describe, expect, it } from "vitest";
import { formatRpcError } from "@/lib/update/errors";

describe("formatRpcError", () => {
  it("prefers Error messages", () => {
    expect(formatRpcError(new Error("boom"))).toBe("boom");
  });

  it("joins PostgREST fields", () => {
    expect(formatRpcError({ message: "m", details: "d", hint: "h", code: "PGRST" })).toBe(
      "m | d | h | PGRST",
    );
  });

  it("never returns an empty string", () => {
    expect(formatRpcError(undefined)).toBe("RPC failed");
    expect(formatRpcError({})).toBe("RPC failed");
    expect(formatRpcError(new Error(""))).toBe("RPC failed");
  });
});
