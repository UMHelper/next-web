import { describe, expect, it } from "vitest";
import { voteSubmissionSchema } from "@/lib/validation/vote";

describe("voteSubmissionSchema", () => {
  it("accepts a direction vote", () => {
    expect(voteSubmissionSchema.safeParse({ comment: 7, offset: 1 }).success).toBe(true);
  });

  it("requires emoji when offset is 0", () => {
    expect(voteSubmissionSchema.safeParse({ comment: 7, offset: 0 }).success).toBe(false);
  });

  it("rejects an unknown emoji", () => {
    expect(voteSubmissionSchema.safeParse({ comment: 7, offset: 0, emoji: "🔥" }).success).toBe(false);
  });

  it("rejects offset outside -1/0/1", () => {
    expect(voteSubmissionSchema.safeParse({ comment: 7, offset: 2 }).success).toBe(false);
  });
});
