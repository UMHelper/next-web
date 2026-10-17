import { describe, expect, it } from "vitest";

import { isAssistantPilot, isPilotMetadata } from "@/lib/assistant/pilot";

describe("isAssistantPilot", () => {
  it.each([
    [undefined, false],
    [null, false],
    [{}, false],
    [{ metadata: {} }, false],
    [{ metadata: { aiPilot: false } }, false],
    [{ metadata: { aiPilot: "true" } }, false],
    [{ metadata: { aiPilot: true } }, true],
  ])("session claims %j -> %s", (claims, expected) => {
    expect(isAssistantPilot(claims)).toBe(expected);
  });
});

describe("isPilotMetadata", () => {
  it.each([
    [undefined, false],
    [{}, false],
    [{ aiPilot: 1 }, false],
    [{ aiPilot: true }, true],
  ])("public metadata %j -> %s", (metadata, expected) => {
    expect(isPilotMetadata(metadata)).toBe(expected);
  });
});
