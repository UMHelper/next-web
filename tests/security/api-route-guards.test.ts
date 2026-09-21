import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = path.join(process.cwd(), "app", "api");

const KNOWN_GUARDS = [
  "verifyIOSRequest",
  "requireWriteIdentity",
  "resolveCommentIdentity",
  "resolveReportIdentity",
  "requireAdmin",
  "getCurrentAdmin",
];

const PUBLIC_API_ROUTES = new Map<string, string>([
  [
    "/api/browser-diagnostics",
    "public user-facing Environment Info support tool (components/browser-diagnostics.tsx)",
  ],
]);

function listRouteFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listRouteFiles(full));
    else if (/^route\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

function routePath(file: string): string {
  const relative = path.relative(process.cwd(), file);
  const withoutExt = relative.replace(/\/route\.tsx?$/, "");
  return `/${withoutExt.replace(/^app\//, "")}`;
}

describe("api route guards", () => {
  const files = listRouteFiles(API_ROOT);

  it("finds route files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s is guarded or explicitly public", (file) => {
    const source = readFileSync(file, "utf8");
    const route = routePath(file);

    if (PUBLIC_API_ROUTES.has(route)) return;

    const guarded = KNOWN_GUARDS.some((guard) => {
      const matches = source.match(new RegExp(`\\b${guard}\\b`, "g"));
      return (matches?.length ?? 0) >= 2;
    });

    expect(
      guarded,
      `${route} has no known auth guard. Add an auth check or add it to PUBLIC_API_ROUTES with a justification.`,
    ).toBe(true);
  });
});
