import { describe, expect, it } from "vitest";

import {
  ASSISTANT_ACCESS_MODES,
  MAX_ASSISTANT_TESTERS,
  parseAssistantAccess,
} from "@/lib/assistant/access-mode";

describe("parseAssistantAccess", () => {
  it.each([
    ["off", "off"],
    ["testers", "testers"],
    ["everyone", "everyone"],
    ["admins", "off"],
    ["EVERYONE", "off"],
    ["", "off"],
    [null, "off"],
    [undefined, "off"],
    [1, "off"],
  ])("%j -> %s", (input, expected) => {
    expect(parseAssistantAccess(input)).toBe(expected);
  });
});

describe("access mode constants", () => {
  it("lists modes in display order", () => {
    expect(ASSISTANT_ACCESS_MODES).toEqual(["off", "testers", "everyone"]);
  });

  it("caps the tester list at 200", () => {
    expect(MAX_ASSISTANT_TESTERS).toBe(200);
  });
});
