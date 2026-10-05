import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("Next 15 and Clerk 7 dependency baseline", () => {
  it("pins the reviewed framework and auth versions", () => {
    expect(pkg.dependencies.next).toBe("15.5.27");
    expect(pkg.dependencies["@clerk/nextjs"]).toBe("7.9.10");
    expect(pkg.dependencies["@clerk/backend"]).toBeUndefined();
    expect(pkg.devDependencies["eslint-config-next"]).toBe("15.5.27");
    expect(pkg.engines.node).toBe(">=20.9.0");
    expect(pkg.scripts.lint).toBe("eslint . --max-warnings=0");
  });
});
