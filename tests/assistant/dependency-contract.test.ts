import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("assistant dependency contract", () => {
  it("pins the CopilotKit and DeepSeek packages exactly", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies["@copilotkit/react-core"]).toBe("1.79.1");
    expect(pkg.dependencies["@copilotkit/runtime"]).toBe("1.79.1");
    expect(pkg.dependencies["@ai-sdk/deepseek"]).toBe("2.0.76");
  });

  it("serves an unmodified copy of the CopilotKit v2 stylesheet", () => {
    expect(read("public/assistant/copilotkit-v2.css")).toBe(
      read("node_modules/@copilotkit/react-core/dist/v2/index.css"),
    );
  });

  it("keeps CopilotKit telemetry off in the Worker config", () => {
    expect(read("wrangler.jsonc")).toMatch(/"COPILOTKIT_TELEMETRY_DISABLED":\s*"true"/);
  });
});
