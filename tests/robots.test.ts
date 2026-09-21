import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

describe("robots", () => {
  it("disallows private and search routes", () => {
    const ruleConfig = robots().rules;
    const rules = Array.isArray(ruleConfig) ? ruleConfig : [ruleConfig];
    expect(rules[0]).toMatchObject({
      userAgent: "*",
      disallow: expect.arrayContaining(["/admin/", "/api/", "/submit/", "/search/"]),
    });
  });
});
