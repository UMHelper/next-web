import { describe, expect, it } from "vitest";
import { shouldShowOfferedBadge } from "@/lib/config/offered-badge";

describe("shouldShowOfferedBadge", () => {
  it("only shows when pre-enrollment is closed and the offering is on", () => {
    expect(shouldShowOfferedBadge(false, true)).toBe(true);
    expect(shouldShowOfferedBadge(true, true)).toBe(false);
    expect(shouldShowOfferedBadge(false, 0)).toBe(false);
    expect(shouldShowOfferedBadge(false, undefined)).toBe(false);
  });
});
