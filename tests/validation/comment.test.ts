import { describe, expect, it } from "vitest";
import { commentSubmissionSchema } from "@/lib/validation/comment";

const valid = {
  attendance: 3,
  pre: 3,
  grade: 4,
  hard: 2,
  reward: 4,
  assignment: 3,
  recommend: 5,
  content: "Very useful course.",
};

describe("commentSubmissionSchema", () => {
  it("accepts a valid submission", () => {
    expect(commentSubmissionSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects NaN", () => {
    expect(commentSubmissionSchema.safeParse({ ...valid, grade: Number.NaN }).success).toBe(false);
  });

  it("rejects out-of-range scores", () => {
    expect(commentSubmissionSchema.safeParse({ ...valid, hard: 6 }).success).toBe(false);
  });

  it("rejects content over 2000 characters", () => {
    expect(commentSubmissionSchema.safeParse({ ...valid, content: "x".repeat(2001) }).success).toBe(false);
  });
});
