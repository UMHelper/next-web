import { describe, expect, it } from "vitest";

import { RATING_SCALES, SMALL_REVIEW_SAMPLE } from "@/lib/assistant/rating-semantics";

describe("rating semantics", () => {
  it("states the inverted difficulty scale and the grade scale", () => {
    expect(SMALL_REVIEW_SAMPLE).toBe(5);
    expect(RATING_SCALES.find((scale) => scale.key === "difficulty")?.gloss).toContain("higher number is easier");
    expect(RATING_SCALES.find((scale) => scale.key === "grade")?.gloss).toContain("not a stricter grader");
    expect(RATING_SCALES.find((scale) => scale.key === "result")?.gloss).toContain("Never!");
    expect(RATING_SCALES.find((scale) => scale.key === "reward")?.gloss).toContain("Waste of time");
    expect(RATING_SCALES.find((scale) => scale.key === "attendance")?.gloss).toContain("Always");
  });
});
