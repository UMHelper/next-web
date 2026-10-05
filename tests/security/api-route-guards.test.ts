import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = path.join(process.cwd(), "app");
const API_ROOT = path.join(APP_ROOT, "api");

// Guards are matched as *invocations* (`name(` / `auth()`), so an unused import
// or a mere mention in a comment cannot satisfy the contract.
const GUARD_INVOCATIONS = [
  "verifyIOSRequest(",
  "requireWriteIdentity(",
  "resolveCommentIdentity(",
  "resolveReportIdentity(",
  "requireAdmin(",
  "getCurrentAdmin(",
  "auth(",
];

const PUBLIC_API_ROUTES = new Map<string, string>([]);

// Pages that are intentionally reachable without a session. Every other page
// under app/ must be guarded by its own file or by an ancestor layout.
const PUBLIC_PAGE_PREFIXES = [
  "/catalog",
  "/course",
  "/professor",
  "/privacy-policy",
  "/reviews",
  "/search",
  "/sign-in",
  "/sign-up",
  "/submit",
  // 插件 listing 的 support URL，必須匿名可達（Task 10）。
  "/support",
  "/terms-of-service",
  "/timetable",
];

function listFiles(dir: string, namePattern: RegExp): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listFiles(full, namePattern));
    else if (namePattern.test(entry)) files.push(full);
  }
  return files;
}

function apiRoutePath(file: string): string {
  const relative = path.relative(process.cwd(), file).replace(/\\/g, "/");
  return `/${relative.replace(/\/route\.tsx?$/, "").replace(/^app\//, "")}`;
}

function pageRoutePath(file: string): string {
  const relative = path.relative(APP_ROOT, file).replace(/\\/g, "/");
  return `/${relative.replace(/\/?page\.tsx$/, "")}`;
}

function isPublicPage(route: string): boolean {
  if (route === "/") return true;
  return PUBLIC_PAGE_PREFIXES.some(
    (prefix) => route === prefix || route.startsWith(`${prefix}/`),
  );
}

function hasGuardInvocation(source: string): boolean {
  return GUARD_INVOCATIONS.some((guard) => source.includes(guard));
}

function ancestorLayouts(file: string): string[] {
  const layouts: string[] = [];
  let current = path.dirname(file);
  while (current.startsWith(APP_ROOT)) {
    const candidate = path.join(current, "layout.tsx");
    try {
      if (statSync(candidate).isFile()) layouts.push(candidate);
    } catch {
      // no layout at this level
    }
    if (current === APP_ROOT) break;
    current = path.dirname(current);
  }
  return layouts;
}

describe("api route guards", () => {
  const files = listFiles(API_ROOT, /^route\.tsx?$/);

  it("finds route files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s invokes an auth guard or is explicitly public", (file) => {
    const source = readFileSync(file, "utf8");
    const route = apiRoutePath(file);

    if (PUBLIC_API_ROUTES.has(route)) return;

    expect(
      hasGuardInvocation(source),
      `${route} has no auth guard invocation (checked: ${GUARD_INVOCATIONS.join(", ")}). Add an auth check or add it to PUBLIC_API_ROUTES with a justification.`,
    ).toBe(true);
  });
});

describe("protected page guards", () => {
  const pages = listFiles(APP_ROOT, /^page\.tsx$/);

  it("finds page files", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it("every non-public page is guarded by itself or an ancestor layout", () => {
    const unprotected = pages
      .map((file) => ({ file, route: pageRoutePath(file) }))
      .filter(({ route }) => !isPublicPage(route))
      .filter(({ file }) => {
        const sources = [file, ...ancestorLayouts(file)].map((candidate) =>
          readFileSync(candidate, "utf8"),
        );
        return !sources.some(hasGuardInvocation);
      })
      .map(({ route }) => route);

    expect(
      unprotected,
      `protected pages without a guard invocation: ${unprotected.join(", ")}`,
    ).toEqual([]);
  });
});
