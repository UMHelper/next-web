import { describe, expect, it } from "vitest";
import { identityIdSchema } from "@/lib/validation/identity";

describe("identityIdSchema", () => {
  it("accepts Clerk user ids", () => {
    expect(identityIdSchema.safeParse("user_2abcDEF").success).toBe(true);
  });

  it("accepts UUIDs", () => {
    expect(identityIdSchema.safeParse("123e4567-e89b-12d3-a456-426614174000").success).toBe(true);
  });

  it("rejects arbitrary strings", () => {
    expect(identityIdSchema.safeParse("not-an-id").success).toBe(false);
  });
});
