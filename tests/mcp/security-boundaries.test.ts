import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Source-level inventory guards for the highest-risk MCP boundaries.
 *
 * These scans are deliberately narrow: they protect against whole classes of
 * mistake that a behavioural test on one projector cannot (raw selects, raw-row
 * spreading, secret logging, REST self-calls, cookie/iOS auth, unapproved tool
 * registrations and forbidden output fields). They complement — never replace —
 * the behavioural suites in `tests/mcp/*.test.ts`.
 */

const ROOT = process.cwd();
const SOURCE_ROOTS = ["lib/mcp", "app/mcp"];

const APPROVED_TOOL_NAMES = [
  "search_catalog",
  "get_course",
  "get_instructor",
  "get_course_reviews",
  "get_course_sections",
] as const;

function collectSourceFiles(relativeDir: string): string[] {
  const entries = readdirSync(path.join(ROOT, relativeDir), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(relative));
    else if (/\.tsx?$/.test(entry.name)) files.push(relative);
  }

  return files;
}

const SOURCE_FILES = SOURCE_ROOTS.flatMap(collectSourceFiles).sort();

function rawSource(file: string): string {
  return readFileSync(path.join(ROOT, file), "utf8");
}

/**
 * Drop comments before scanning so prose that merely *names* a forbidden field
 * (for example "`verify_account` is never projected") cannot trip a guard, and
 * so a comment cannot hide a violation. `//` inside `https://` is preserved.
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
}

function codeOf(file: string): string {
  return stripComments(rawSource(file));
}

function offenders(predicate: (file: string, code: string) => boolean): string[] {
  return SOURCE_FILES.filter((file) => predicate(file, codeOf(file)));
}

/** Extract the balanced argument list of the call whose `(` is at `openIndex`. */
function callArguments(code: string, openIndex: number): string {
  let depth = 0;
  for (let index = openIndex; index < code.length; index += 1) {
    const character = code[index];
    if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return code.slice(openIndex + 1, index);
    }
  }
  return code.slice(openIndex + 1);
}

describe("MCP source security inventory", () => {
  it("scans every lib/mcp and app/mcp source file", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(0);
    expect(SOURCE_FILES.some((file) => file.startsWith("lib/mcp"))).toBe(true);
    expect(SOURCE_FILES.some((file) => file.startsWith("app/mcp"))).toBe(true);
  });

  it("never selects every column with select(\"*\")", () => {
    const selectStar = /\.select\s*\(\s*["'`]\*["'`]\s*\)/;
    expect(offenders((_file, code) => selectStar.test(code))).toEqual([]);
  });

  it("never spreads a raw database row into an output object", () => {
    // Only the identifier immediately after `...` is inspected, so spreading a
    // projection result into an array (`...output.results.map(...)`) or the
    // shared annotations is not a false positive.
    const spread = /\.\.\.\s*([A-Za-z0-9_$]+)/g;
    const rowLike =
      /row|entry|record|item|data|payload|body|raw|course|prof|comment|profile|source|obj|result/i;
    const found: string[] = [];

    for (const file of SOURCE_FILES) {
      const code = codeOf(file);
      for (const match of code.matchAll(spread)) {
        const identifier = match[1];
        if (rowLike.test(identifier)) found.push(`${file}: ...${identifier}`);
      }
    }

    expect(found).toEqual([]);
  });

  it("never logs tokens, credentials, request bodies or auth context", () => {
    const consoleCall = /console\s*\.\s*(?:log|info|warn|error|debug|trace)\s*\(/g;
    const sensitive =
      /token|bearer|authorization|auth_?info|email|cookie|secret|password|req(?:uest)?body|res(?:ponse)?body|body\b/i;
    const found: string[] = [];

    for (const file of SOURCE_FILES) {
      const code = codeOf(file);
      for (const match of code.matchAll(consoleCall)) {
        const start = match.index ?? 0;
        const args = callArguments(code, start + match[0].length - 1);
        if (sensitive.test(args)) {
          found.push(`${file}: ${args.trim().split("\n")[0].slice(0, 120)}`);
        }
      }
    }

    expect(found).toEqual([]);
  });

  it("never self-calls the site REST API", () => {
    expect(offenders((_file, code) => code.includes("/api/"))).toEqual([]);
  });

  it("never reads cookies or uses the iOS HMAC authentication helpers", () => {
    const forbiddenAuth = /(^|[^\w.])cookies\s*\(|@\/lib\/ios-auth|verifyIOSRequest|iosUnauthorized|createHmac/;
    expect(offenders((_file, code) => forbiddenAuth.test(code))).toEqual([]);
  });

  it("registers exactly the five approved tools and nothing else", () => {
    const toolNameConstant = /export\s+const\s+([A-Za-z0-9_]+_TOOL_NAME)\s*=\s*"([^"]+)"\s*;/g;
    const constants = new Map<string, string>();

    for (const file of SOURCE_FILES) {
      for (const match of codeOf(file).matchAll(toolNameConstant)) {
        constants.set(match[1], match[2]);
      }
    }

    const registerTool = /\.registerTool\s*\(\s*([^,]+?)\s*,/g;
    const registered: string[] = [];
    const unresolved: string[] = [];

    for (const file of SOURCE_FILES) {
      for (const match of codeOf(file).matchAll(registerTool)) {
        const argument = match[1].trim();
        const literal = /^["'`]([^"'`]+)["'`]$/.exec(argument);
        if (literal) {
          registered.push(literal[1]);
          continue;
        }
        const resolved = constants.get(argument);
        if (resolved === undefined) unresolved.push(`${file}: registerTool(${argument})`);
        else registered.push(resolved);
      }
    }

    expect(unresolved).toEqual([]);
    expect([...new Set(registered)].sort()).toEqual([...APPROVED_TOOL_NAMES].sort());
    for (const name of registered) {
      expect(APPROVED_TOOL_NAMES as readonly string[]).toContain(name);
    }
  });

  it("never uses a forbidden field name as an output/schema key", () => {
    const forbidden = [
      "ilo",
      "admin_note",
      "admin_note_en",
      "verify_account",
      "hidden",
      "avatar",
      "avatar_seed",
      "email",
      "ip_address",
      "image",
      "images",
      "upvote_history",
      "downvote_history",
      "vote_history",
      "service_role",
      "service_role_key",
      "comment_id",
      "creator",
    ];
    const forbiddenKey = new RegExp(
      `(?:^|[\\s,{("'])["']?(?:${forbidden.join("|")})["']?\\s*:`,
    );

    expect(offenders((_file, code) => forbiddenKey.test(code))).toEqual([]);
  });
});
