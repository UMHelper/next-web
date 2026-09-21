import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const API_ROOT = path.join(process.cwd(), "app", "api");

const KNOWN_GUARD_PATTERNS: Array<{ name: string; regex: RegExp; min: number }> = [
  { name: "verifyIOSRequest", regex: /\bverifyIOSRequest\b/g, min: 2 },
  { name: "requireWriteIdentity", regex: /\brequireWriteIdentity\b/g, min: 2 },
  { name: "resolveCommentIdentity", regex: /\bresolveCommentIdentity\b/g, min: 2 },
  { name: "resolveReportIdentity", regex: /\bresolveReportIdentity\b/g, min: 2 },
  { name: "requireAdmin", regex: /\brequireAdmin\b/g, min: 2 },
  { name: "getCurrentAdmin", regex: /\bgetCurrentAdmin\b/g, min: 2 },
  // 直接调用 Clerk 的 auth() 并自行返回 JSON 401 也是合法的鉴权方式
  { name: "auth()", regex: /\bauth\(\)/g, min: 1 },
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

    const matchedGuard = KNOWN_GUARD_PATTERNS.find(({ regex, min }) => {
      const matches = source.match(regex);
      return (matches?.length ?? 0) >= min;
    });

    expect(
      Boolean(matchedGuard),
      `${route} has no known auth guard (checked: ${KNOWN_GUARD_PATTERNS.map((guard) => guard.name).join(", ")}). Add an auth check or add it to PUBLIC_API_ROUTES with a justification.`,
    ).toBe(true);
  });
});
