import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("runs TypeScript tests", () => {
    const expected = 2 + 2;
    expect(expected).toBe(4);
  });
});
