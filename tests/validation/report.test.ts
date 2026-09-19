import { describe, expect, it } from "vitest";
import { reportSubmissionSchema } from "@/lib/validation/report";

describe("reportSubmissionSchema", () => {
  it("accepts a valid report", () => {
    const result = reportSubmissionSchema.safeParse({
      targetType: "comment",
      targetId: 12,
      reason: "spam",
    });
    expect(result.success).toBe(true);
  });

  it("requires details for other", () => {
    const result = reportSubmissionSchema.safeParse({
      targetType: "comment",
      targetId: 12,
      reason: "other",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid target id", () => {
    expect(reportSubmissionSchema.safeParse({ targetId: 0, reason: "spam" }).success).toBe(false);
    expect(reportSubmissionSchema.safeParse({ targetId: "abc", reason: "spam" }).success).toBe(false);
  });
});
