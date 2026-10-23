import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/assistant/tools", () => ({ createAssistantTools: () => [] }));

import { ASSISTANT_MAX_STEPS } from "@/lib/assistant/agent";
import { readAssistantConfig } from "@/lib/assistant/config";

const PREVIEW_MAX_OUTPUT_TOKENS = "1200";
const wrangler = readFileSync(path.join(process.cwd(), "wrangler.jsonc"), "utf8");
const previewStart = wrangler.indexOf('"preview"');

describe("assistant inference defaults", () => {
  it("keeps the production default at thinking off, 1200 output tokens and 5 steps", () => {
    expect(readAssistantConfig({})).toMatchObject({ thinking: "off", maxOutputTokens: 1_200, model: "deepseek-flash" });
    expect(ASSISTANT_MAX_STEPS).toBe(5);
  });

  it("sets inference variables only for the preview worker", () => {
    expect(previewStart).toBeGreaterThan(0);
    for (const name of ["AI_THINKING", "AI_MAX_OUTPUT_TOKENS", "AI_MODEL"]) {
      const at = wrangler.indexOf(`"${name}"`);
      expect(at, name).toBeGreaterThan(previewStart);
      expect(wrangler.indexOf(`"${name}"`, at + 1), name).toBe(-1);
    }
  });

  it("gives testers thinking off and the chosen output budget", () => {
    const preview = wrangler.slice(previewStart);
    expect(preview).toMatch(/"AI_THINKING":\s*"off"/);
    expect(preview).toMatch(new RegExp(`"AI_MAX_OUTPUT_TOKENS":\\s*"${PREVIEW_MAX_OUTPUT_TOKENS}"`));
  });
});
