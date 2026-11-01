import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const FLAG = "--dangerouslyUseUnsupportedNextVersion";
const OPENNEXT_BUILD = /opennextjs-cloudflare build\b/;
const NPM_RUN = /^npm run ([A-Za-z0-9:_-]+)/;

function findRepoRoot(): string {
  const candidates = [
    process.cwd(),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."),
  ];
  for (const candidate of candidates) {
    const pkgPath = path.join(candidate, "package.json");
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string };
    if (pkg.name === "next-web") return candidate;
  }
  throw new Error("Could not locate next-web repo root");
}

type BuildCommand = { source: string; command: string };

const buildCommands = (): BuildCommand[] => {
  const root = findRepoRoot();
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

  const expanded: BuildCommand[] = [...fromPackage, ...fromShell];
  for (const entry of fromShell) {
    const match = entry.command.match(NPM_RUN);
    if (!match) continue;
    const scriptName = match[1];
    const scriptBody = scripts[scriptName];
    if (!scriptBody) continue;
    for (const command of scriptBody.split("&&")) {
      expanded.push({
        source: `${entry.source} → package.json#${scriptName}`,
        command: command.trim(),
      });
    }
  }

  return expanded.filter(({ command }) => OPENNEXT_BUILD.test(command));
};

describe("OpenNext build commands", () => {
  it("all pass the unsupported-Next flag, since OpenNext exits 1 for Next 15 without it", () => {
    const root = findRepoRoot();
    const deployPreview = readFileSync(path.join(root, "scripts/deploy-preview.sh"), "utf8");
    expect(deployPreview).toMatch(/npm run build:preview|opennextjs-cloudflare build\b/);

    const commands = buildCommands();
    expect(commands.map(({ source }) => source)).toContain("package.json#build:preview");
    expect(
      commands.some(
        ({ source }) =>
          source === "scripts/deploy-preview.sh → package.json#build:preview" ||
          source === "scripts/deploy-preview.sh",
      ),
    ).toBe(true);

    for (const { source, command } of commands) {
      expect(command, source).toContain(FLAG);
    }
  });
});
