import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";

/**
 * What2Reg @ UM portable Agent Plugin package test (plan Task 11).
 *
 * Brand assets note (plan Step 4) — the mark is the shared What2Reg brand
 * glyph: the lucide "cat" (ISC) that the companion iOS app renders through
 * `CatLogo` (`cat-blue.svg`, stroke `#003DB8`). It is vector (24x24 viewBox),
 * so rendering at 512x512 is lossless and never upscales a low-resolution
 * bitmap (`public/whole-icon.png` is retired and was not used).
 *
 * `design/cat-logo.svg` keeps the licensed source in this repository and
 * `scripts/build-plugin-assets.mjs` (`npm run plugin:assets`) reproduces the
 * PNGs with `sharp`. `assets/composer-icon.png` is a byte-identical copy of
 * `assets/logo.png` (spec §11: both use the same 512x512 transparent PNG).
 *
 * Human review of small-size legibility and transparent edges (plan Step 4) is
 * still required before submission.
 *
 * These assertions mirror the Agent Plugins 1.0 schemas
 * (https://agent-plugins.org/schemas/1.0.0/plugin.schema.json and
 * https://agent-plugins.org/schemas/1.0.0/mcp.schema.json) and the OpenAI
 * submission field reference. Which fields the real portal accepts can only be
 * validated by uploading the ZIP to the OpenAI portal (plan Tasks 12–13).
 */

const REPO_ROOT = process.cwd();
const PLUGIN_DIR = join(REPO_ROOT, "plugins", "what2reg-um");
const ZIP_PATH = join(REPO_ROOT, "artifacts", "what2reg-um-plugin.zip");

const PLUGIN_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";
const MCP_SCHEMA = "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json";
const MCP_SERVER_KEY = "what2reg-um";
const MCP_URL = "https://umeh.top/mcp";

const LISTING_URLS = {
  websiteURL: "https://umeh.top",
  supportURL: "https://umeh.top/support",
  privacyPolicyURL: "https://umeh.top/privacy-policy",
  termsOfServiceURL: "https://umeh.top/terms-of-service",
} as const;

const APPROVED_TOOLS = [
  "search_catalog",
  "get_course",
  "get_instructor",
  "get_course_reviews",
  "get_course_sections",
] as const;

/** Files a public ZIP is allowed to contain, enforced by extension below. */
const FORBIDDEN_ZIP_PATTERNS: RegExp[] = [
  /\.app\.json$/i,
  /(^|\/)\.mcp\.json$/i,
  /(^|\/)\.codex-plugin(\/|$)/i,
  /(^|\/)hooks?(\/|$|\.)/i,
  /(^|\/)\.env/i,
  /\.map$/i,
  /token/i,
  /credential/i,
  /secret/i,
  /test_credentials/i,
  /reviewer_instructions/i,
];

const ALLOWED_ROOT_ENTRIES = ["assets", "mcp.json", "plugin.json", "skills"];
const ALLOWED_EXTENSIONS = [".json", ".md", ".png", ".yaml", ".yml"];

function readJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function walkFiles(root: string, current = root): string[] {
  return readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) return walkFiles(root, absolute);
    return [relative(root, absolute).split(sep).join("/")];
  });
}

/** Collect every string leaf with its dotted path so empties can be rejected. */
function collectStrings(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === "string") {
    out.push([path, value]);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collectStrings(child, `${path}.${key}`, out);
  }
}

function pngInfo(path: string): {
  width: number;
  height: number;
  colorType: number;
  hasAlpha: boolean;
} {
  const buffer = readFileSync(path);
  expect(buffer.subarray(0, 8).toString("hex"), `${path} is not a PNG`).toBe("89504e470d0a1a0a");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  let offset = 8;
  let hasTRNS = false;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "tRNS") hasTRNS = true;
    if (type === "IEND") break;
    offset += 12 + length;
  }
  // Color type 4 = grayscale+alpha, 6 = RGBA; indexed PNGs carry alpha via tRNS.
  return { width, height, colorType, hasAlpha: colorType === 4 || colorType === 6 || hasTRNS };
}

/** Minimal ZIP central-directory reader: enough to list entry names. */
function listZipEntries(zipPath: string): string[] {
  const buffer = readFileSync(zipPath);
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("ZIP end-of-central-directory record not found");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("bad ZIP central header");
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

function expectNoForbiddenEntries(entries: string[]): void {
  for (const entry of entries) {
    for (const pattern of FORBIDDEN_ZIP_PATTERNS) {
      expect(entry, `forbidden package entry "${entry}"`).not.toMatch(pattern);
    }
    expect(ALLOWED_EXTENSIONS).toContain(entry.slice(entry.lastIndexOf(".")));
  }
}

const manifest = readJson(join(PLUGIN_DIR, "plugin.json"));
const openaiExtension = manifest.extensions?.["com.openai"];

describe("plugin.json (Agent Plugins 1.0.0)", () => {
  it("declares the portable schema and a stable kebab-case identity", () => {
    expect(manifest.$schema).toBe(PLUGIN_SCHEMA);
    expect(manifest.name).toBe("what2reg-um");
    expect(manifest.name).toMatch(/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/);
    expect(manifest.name.length).toBeLessThanOrEqual(64);
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.trim().length).toBeGreaterThan(0);
    expect(typeof manifest.author?.name).toBe("string");
    expect(manifest.author.name.trim().length).toBeGreaterThan(0);
    expect(manifest.author.url).toMatch(/^https:\/\//);
    expect(Array.isArray(manifest.keywords)).toBe(true);
    expect(manifest.keywords.length).toBeGreaterThan(0);
  });

  it("uses only documented portable root fields", () => {
    const allowed = [
      "$schema",
      "name",
      "version",
      "description",
      "author",
      "homepage",
      "repository",
      "license",
      "keywords",
      "extensions",
    ];
    expect(Object.keys(manifest).filter((key) => !allowed.includes(key))).toEqual([]);
    expect(Object.keys(manifest.author)).toEqual(
      expect.arrayContaining(["name", "url"]),
    );
    expect(Object.keys(manifest.author).filter((key) => !["name", "email", "url"].includes(key))).toEqual([]);
    expect(Object.keys(manifest.extensions)).toEqual(["com.openai"]);
  });

  it("provides the OpenAI interface listing with the required display name", () => {
    const ui = openaiExtension.interface;
    expect(ui.displayName).toBe("What2Reg @ UM 澳大選咩課");
    expect(ui.displayName.length).toBeLessThanOrEqual(30);
    expect(ui.shortDescription).toBe("澳門大學課程與教師評價平台（澳大選咩課）");
    expect(ui.shortDescription.length).toBeLessThanOrEqual(30);
    expect(ui.longDescription.trim().length).toBeGreaterThan(0);
    expect(ui.longDescription.length).toBeLessThanOrEqual(4000);
    expect(ui.developerName.trim().length).toBeGreaterThan(0);
    expect(ui.developerName.length).toBeLessThanOrEqual(80);
    expect(ui.category.trim().length).toBeGreaterThan(0);
    expect(ui.capabilities.length).toBeGreaterThan(0);
    expect(ui.capabilities.length).toBeLessThanOrEqual(20);
    for (const capability of ui.capabilities) {
      expect(capability.trim().length).toBeGreaterThan(0);
      expect(capability.length).toBeLessThanOrEqual(120);
    }
  });

  it("uses exactly the four fixed listing URLs", () => {
    const ui = openaiExtension.interface;
    for (const [field, url] of Object.entries(LISTING_URLS)) {
      expect(ui[field], `${field} must be the fixed URL`).toBe(url);
      expect(ui[field]).toMatch(/^https:\/\//);
    }
  });

  it("references existing logo and composer icon assets", () => {
    const ui = openaiExtension.interface;
    expect(ui.logo).toBe("./assets/logo.png");
    expect(ui.composerIcon).toBe("./assets/composer-icon.png");
    expect(existsSync(join(PLUGIN_DIR, "assets", "logo.png"))).toBe(true);
    expect(existsSync(join(PLUGIN_DIR, "assets", "composer-icon.png"))).toBe(true);
  });

  it("offers at most three unique starter prompts", () => {
    const prompts = openaiExtension.interface.defaultPrompt;
    expect(Array.isArray(prompts)).toBe(true);
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.length).toBeLessThanOrEqual(3);
    for (const prompt of prompts) {
      expect(prompt.trim().length).toBeGreaterThan(0);
      expect(prompt.length).toBeLessThanOrEqual(128);
    }
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("keeps the first release free of dark variants and custom brand color", () => {
    const ui = openaiExtension.interface;
    for (const field of ["brandColor", "brandColorDark", "logoDark", "composerIconDark"]) {
      expect(ui[field], `spec §11 forbids ${field} in the first release`).toBeUndefined();
    }
  });

  it("does not ship app references or lifecycle hooks", () => {
    expect(openaiExtension.apps).toBeUndefined();
    expect(openaiExtension.hooks).toBeUndefined();
    expect(FORBIDDEN_ZIP_PATTERNS.some((pattern) => pattern.test(".app.json"))).toBe(true);
  });

  it("keeps exactly five positive and three negative review cases", () => {
    const cases = openaiExtension.review.test_cases;
    expect(cases.positive).toHaveLength(5);
    expect(cases.negative).toHaveLength(3);
  });

  it("covers catalog search, course detail, instructor comparison, reviews and sections", () => {
    const positive = openaiExtension.review.test_cases.positive as Array<{
      description: string;
      prompt: string;
      tools_triggered: string;
      expected_behavior: string;
    }>;
    for (const testCase of positive) {
      expect(testCase.description.trim().length).toBeGreaterThan(0);
      expect(testCase.prompt.trim().length).toBeGreaterThan(0);
      expect(testCase.expected_behavior.trim().length).toBeGreaterThan(0);
      expect(typeof testCase.tools_triggered).toBe("string");
      expect(testCase.tools_triggered.trim().length).toBeGreaterThan(0);
    }
    const triggered = positive.flatMap((testCase) =>
      testCase.tools_triggered.split(",").map((tool) => tool.trim()),
    );
    for (const tool of APPROVED_TOOLS) {
      expect(triggered, `positive cases must cover ${tool}`).toContain(tool);
    }
    expect(triggered.filter((tool) => !APPROVED_TOOLS.includes(tool as never))).toEqual([]);
  });

  it("covers write, profile/timetable and SQL/bulk-export refusals", () => {
    const negative = openaiExtension.review.test_cases.negative as Array<{
      description: string;
      prompt: string;
      tools_triggered?: string;
    }>;
    for (const testCase of negative) {
      expect(testCase.description.trim().length).toBeGreaterThan(0);
      expect(testCase.prompt.trim().length).toBeGreaterThan(0);
      expect(testCase.tools_triggered ?? "").toBe("");
    }
    const text = negative.map((testCase) => `${testCase.description} ${testCase.prompt}`).join("\n");
    expect(text).toMatch(/(撰写|提交|发布|write)[^\n]*(评价|评论|review)/i);
    expect(text).toMatch(/(个人课表|课表|个人资料|用户资料|profile|timetable)/i);
    expect(text).toMatch(/(SQL|批量导出|bulk export)/i);
  });

  it("declares the review demo and commerce fields", () => {
    const review = openaiExtension.review;
    expect(review.commerce).toBe(false);
    expect(typeof review.commerce_description).toBe("string");
    expect(review.commerce_description.trim().length).toBeGreaterThan(0);
  });

  it("keeps publication metadata free of empty required fields", () => {
    const publication = openaiExtension.publication;
    expect(publication && typeof publication === "object").toBe(true);
    expect(publication.release_notes.trim().length).toBeGreaterThan(0);
    expect(Array.isArray(publication.countries)).toBe(true);
    expect(publication.countries.length).toBeGreaterThan(0);
    for (const country of publication.countries) expect(country).toMatch(/^[A-Z]{2}$/);
    const translations = publication.translations;
    expect(translations && typeof translations === "object").toBe(true);
    const locales = Object.keys(translations);
    expect(locales.length).toBeGreaterThan(0);
    for (const locale of locales) {
      expect(locale.trim().length).toBeGreaterThan(0);
      expect(translations[locale].subtitle.trim().length).toBeGreaterThan(0);
      expect(translations[locale].subtitle.length).toBeLessThanOrEqual(30);
      expect(translations[locale].description.trim().length).toBeGreaterThan(0);
      expect(translations[locale].description.length).toBeLessThanOrEqual(4000);
    }
    const strings: Array<[string, string]> = [];
    collectStrings(publication, "publication", strings);
    for (const [path, value] of strings) {
      expect(value.trim().length, `${path} must not be empty`).toBeGreaterThan(0);
    }
  });

  it("never embeds credentials or reviewer instructions", () => {
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toMatch(/test_credentials|reviewer_instructions|Bearer |sk-(live|test)_/);
  });
});

describe("mcp.json (Agent Plugins 1.0.0)", () => {
  const mcp = readJson(join(PLUGIN_DIR, "mcp.json"));

  it("declares the Agent Plugins MCP schema", () => {
    expect(mcp.$schema).toBe(MCP_SCHEMA);
  });

  it("declares exactly one streamable-http server named what2reg-um", () => {
    expect(Object.keys(mcp)).toEqual(expect.arrayContaining(["$schema", "mcpServers"]));
    expect(Object.keys(mcp).filter((key) => !["$schema", "mcpServers"].includes(key))).toEqual([]);
    expect(Object.keys(mcp.mcpServers)).toEqual([MCP_SERVER_KEY]);
    const server = mcp.mcpServers[MCP_SERVER_KEY];
    expect(server.type).toBe("streamable-http");
    expect(server.url).toBe(MCP_URL);
    expect(Object.keys(server).filter((key) => !["type", "url"].includes(key))).toEqual([]);
  });

  it("contains no token, header or secret material", () => {
    expect(JSON.stringify(mcp)).not.toMatch(/token|secret|authorization|Bearer |api[_-]?key/i);
  });
});

describe("skill agents/openai.yaml", () => {
  const yamlPath = join(PLUGIN_DIR, "skills", "um-course-advisor", "agents", "openai.yaml");
  const config = parseYaml(readFileSync(yamlPath, "utf8"));

  it("declares the bundled MCP server as its single dependency", () => {
    expect(Array.isArray(config.dependencies.tools)).toBe(true);
    expect(config.dependencies.tools).toHaveLength(1);
    const tool = config.dependencies.tools[0];
    expect(tool.type).toBe("mcp");
    expect(tool.value).toBe(MCP_SERVER_KEY);
    expect(tool.transport).toBe("streamable_http");
    expect(tool.url).toBe(MCP_URL);
    expect(typeof tool.description).toBe("string");
    expect(tool.description.trim().length).toBeGreaterThan(0);
  });

  it("exposes a non-empty interface block", () => {
    expect(config.interface.display_name.trim().length).toBeGreaterThan(0);
    expect(config.interface.short_description.trim().length).toBeGreaterThan(0);
    expect(config.interface.default_prompt).toMatch(/\$um-course-advisor/);
  });
});

describe("brand assets", () => {
  const logoPath = join(PLUGIN_DIR, "assets", "logo.png");
  const composerIconPath = join(PLUGIN_DIR, "assets", "composer-icon.png");

  it("ships 512×512 PNGs with a real alpha channel", () => {
    for (const asset of [logoPath, composerIconPath]) {
      expect(existsSync(asset)).toBe(true);
      const info = pngInfo(asset);
      expect(info.width).toBe(512);
      expect(info.height).toBe(512);
      expect(info.hasAlpha, `${asset} needs an alpha channel`).toBe(true);
    }
  });

  it("uses the same image for the logo and the composer icon", () => {
    expect(readFileSync(logoPath).equals(readFileSync(composerIconPath))).toBe(true);
  });

  it("stays well inside the portal image size limit", () => {
    for (const asset of [logoPath, composerIconPath]) {
      const size = readFileSync(asset).byteLength;
      expect(size).toBeGreaterThan(0);
      // Portal hard limit is 5 MiB; the vector-rendered brand mark must stay far
      // below it so a low-resolution upscale could never slip in.
      expect(size).toBeLessThanOrEqual(1024 * 1024);
    }
  });
});

describe("public ZIP contents", () => {
  it("keeps only portable runtime files in the plugin directory", () => {
    expect(readdirSync(PLUGIN_DIR).sort()).toEqual(ALLOWED_ROOT_ENTRIES);
    const files = walkFiles(PLUGIN_DIR).sort();
    expect(files).toEqual([
      "assets/composer-icon.png",
      "assets/logo.png",
      "mcp.json",
      "plugin.json",
      "skills/um-course-advisor/SKILL.md",
      "skills/um-course-advisor/agents/openai.yaml",
    ]);
    expectNoForbiddenEntries(files);
  });

  it("matches the built candidate ZIP when artifacts/ has been generated", () => {
    if (!existsSync(ZIP_PATH)) {
      // artifacts/ is gitignored: a fresh checkout has no ZIP. The directory
      // assertions above cover the same invariant, so only the extra
      // consistency check depends on the built artifact.
      return;
    }
    const entries = listZipEntries(ZIP_PATH).filter((entry) => !entry.endsWith("/"));
    expect(entries.sort()).toEqual(walkFiles(PLUGIN_DIR).sort());
    expectNoForbiddenEntries(entries);
  });
});
