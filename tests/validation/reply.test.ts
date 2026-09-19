import { describe, expect, it } from "vitest";
import { replySubmissionSchema } from "@/lib/validation/reply";

describe("replySubmissionSchema", () => {
  it("accepts replyto and content only", () => {
    expect(replySubmissionSchema.safeParse({ replyto: 12, content: "Thanks!" }).success).toBe(true);
  });

  it("strips extra client-controlled fields", () => {
    const result = replySubmissionSchema.safeParse({
      replyto: 12,
      content: "Thanks!",
      verify_account: "spoofed",
      created_by: "spoofed",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ replyto: 12, content: "Thanks!" });
    }
  });
});
