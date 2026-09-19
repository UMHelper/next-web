import { describe, expect, it } from "vitest";
import { replySubmissionSchema } from "@/lib/validation/reply";

describe("replySubmissionSchema", () => {
  it("accepts replyto and content only", () => {
    expect(replySubmissionSchema.safeParse({ replyto: 12, content: "Thanks!" }).success).toBe(true);
  });

  it("rejects extra client-controlled fields", () => {
    const result = replySubmissionSchema.safeParse({
      replyto: 12,
      content: "Thanks!",
      verify_account: "spoofed",
    });
    expect(result.success).toBe(false);
  });
});
