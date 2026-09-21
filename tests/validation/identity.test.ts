import { describe, expect, it } from "vitest";
import { identityIdSchema, isVerifiedIdentityId } from "@/lib/validation/identity";

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

describe("isVerifiedIdentityId", () => {
  it("treats Clerk user ids as verified", () => {
    expect(isVerifiedIdentityId("user_2abcDEF")).toBe(true);
  });

  it("treats iOS device UUIDs as unverified", () => {
    expect(isVerifiedIdentityId("3f2a1c44-5b0e-4a7d-9f1e-2b3c4d5e6f70")).toBe(false);
  });

  it("treats anonymous IP identities as unverified", () => {
    expect(isVerifiedIdentityId("ip:203.0.113.7")).toBe(false);
    expect(isVerifiedIdentityId("")).toBe(false);
  });
});
