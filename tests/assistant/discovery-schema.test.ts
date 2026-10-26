import { describe, expect, it } from "vitest";

import {
  discoverCourseCandidatesInputSchema,
  parseDiscoverResult,
} from "@/lib/assistant/discovery/schema";

describe("discoverCourseCandidatesInputSchema", () => {
  it("rejects an empty scope", () => {
    expect(discoverCourseCandidatesInputSchema.safeParse({ scope: {} }).success).toBe(false);
  });

  it("rejects scope with only credits (not a scope anchor)", () => {
    expect(discoverCourseCandidatesInputSchema.safeParse({ scope: { credits: 3 } }).success).toBe(
      false,
    );
  });

  it("upper-cases codePrefix", () => {
    const parsed = discoverCourseCandidatesInputSchema.safeParse({ scope: { codePrefix: "gest" } });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.scope.codePrefix).toBe("GEST");
    }
  });

  it("rejects invalid codePrefix", () => {
    expect(
      discoverCourseCandidatesInputSchema.safeParse({ scope: { codePrefix: "GE%" } }).success,
    ).toBe(false);
  });

  it("rejects invalid startAfter time", () => {
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: { codePrefix: "GEST" },
        required: { startAfter: "25:00" },
      }).success,
    ).toBe(false);
  });

  it("rejects endBefore at or before startAfter in required", () => {
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: { codePrefix: "GEST" },
        required: { startAfter: "14:00", endBefore: "10:00" },
      }).success,
    ).toBe(false);
  });

  it("rejects avoid window with start at or after end", () => {
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: { codePrefix: "GEST" },
        required: { avoidWindows: [{ start: "13:00", end: "12:00" }] },
      }).success,
    ).toBe(false);
  });

  it("rejects more than five topics", () => {
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: {
          topics: ["a".repeat(2), "bb", "cc", "dd", "ee", "ff"],
        },
      }).success,
    ).toBe(false);
  });

  it("defaults limit to 5 and rejects limit above 8", () => {
    const ok = discoverCourseCandidatesInputSchema.safeParse({ scope: { codePrefix: "GEST" } });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.limit).toBe(5);

    expect(
      discoverCourseCandidatesInputSchema.safeParse({ scope: { codePrefix: "GEST" }, limit: 9 })
        .success,
    ).toBe(false);
  });

  it("rejects duplicate priorities", () => {
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: { codePrefix: "GEST" },
        priorities: ["easier", "easier"],
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported required fields instead of stripping them", () => {
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: { courseType: "GE" },
        required: { credits: 3 },
      }).success,
    ).toBe(false);
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: { courseType: "GE" },
        required: { must: ["GE"] },
      }).success,
    ).toBe(false);
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: { courseType: "GE" },
        preferred: { timesToAvoid: "MON 08:00-12:00" },
      }).success,
    ).toBe(false);
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: { courseType: "GE" },
        preferred: { noClassBefore: "10:00" },
      }).success,
    ).toBe(false);
  });

  it("rejects missing scope anchor", () => {
    expect(discoverCourseCandidatesInputSchema.safeParse({ scope: { credits: 3 } }).success).toBe(false);
  });

  it("rejects invalid excludeCodes", () => {
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: { codePrefix: "GEST", excludeCodes: ['GEST";DROP--'] },
      }).success,
    ).toBe(false);
  });

  it("rejects more than three reviewTerms", () => {
    expect(
      discoverCourseCandidatesInputSchema.safeParse({
        scope: { codePrefix: "GEST" },
        reviewTerms: ["aa", "bb", "cc", "dd"],
      }).success,
    ).toBe(false);
  });
});

describe("parseDiscoverResult", () => {
  it("returns null for error envelope", () => {
    expect(parseDiscoverResult('{"error":"invalid_request"}')).toBeNull();
  });
});
