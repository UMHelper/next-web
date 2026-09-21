import { describe, expect, it } from "vitest";
import { createShareToken, isValidShareToken } from "@/lib/timetable/share-token";

describe("share token", () => {
  it("creates URL-safe high-entropy tokens", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => createShareToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(40);
      expect(isValidShareToken(token)).toBe(true);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("rejects invalid tokens", () => {
    expect(isValidShareToken("short")).toBe(false);
    expect(isValidShareToken(null)).toBe(false);
    expect(isValidShareToken("has space and is not valid")).toBe(false);
  });
});
