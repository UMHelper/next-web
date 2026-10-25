import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const FLAG = "--dangerouslyUseUnsupportedNextVersion";

const buildCommands = () => {
  const { scripts } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const fromPackage = Object.entries(scripts).flatMap(([name, script]) =>
    script.split("&&").map((command) => ({ source: `package.json#${name}`, command: command.trim() })),
  );
  const scriptsDir = path.join(root, "scripts");
  const fromShell = readdirSync(scriptsDir)
    .filter((file) => file.endsWith(".sh"))
    .flatMap((file) =>
      readFileSync(path.join(scriptsDir, file), "utf8")
        .split("\n")
        .map((line) => ({ source: `scripts/${file}`, command: line.trim() })),
    );
  return [...fromPackage, ...fromShell].filter(({ command }) => /opennextjs-cloudflare build\b/.test(command));
};

describe("OpenNext build commands", () => {
  it("all pass the unsupported-Next flag, since OpenNext exits 1 for Next 15 without it", () => {
    const commands = buildCommands();
    expect(commands.map(({ source }) => source)).toContain("scripts/deploy-preview.sh");
    for (const { source, command } of commands) {
      expect(command, source).toContain(FLAG);
    }
  });
});
