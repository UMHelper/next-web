import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@copilotkit/runtime/v2", () => ({ defineTool: (config: unknown) => config }));
vi.mock("@/lib/assistant/data/search-catalog", () => ({
  searchCatalogForAssistant: vi.fn(),
  countCoursesForAssistant: vi.fn(),
}));
vi.mock("@/lib/assistant/data/course-text", () => ({ getCourseText: vi.fn() }));
vi.mock("@/lib/assistant/data/instructor", () => ({ getInstructorForAssistant: vi.fn() }));
vi.mock("@/lib/assistant/data/reviews", () => ({ countCourseReviews: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course", () => ({ getCourse: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-reviews", () => ({ getCourseReviews: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({ getCourseSections: vi.fn() }));

import { DISCOVERY_CASES_V2 } from "@/evals/assistant/discovery-cases";
import { NAVIGATE_DESCRIPTION } from "@/lib/assistant/navigation";
import { DISCOVER_COURSE_CANDIDATES_DESCRIPTION } from "@/lib/assistant/discovery/tool";
import { ASSISTANT_PROMPT } from "@/lib/assistant/prompt";
import { ASSISTANT_SERVER_TOOL_NAMES, createAssistantTools } from "@/lib/assistant/tools";

const PROMPT_SOURCE_BASELINE_CHARS = 15_269;
const PREVIOUS_PROMPT_FINGERPRINT = "69470b851c9e";

const DISCOVERY_SELECTION_BULLET =
  "- Pick the tool from the student's aim: browsing a list is search_catalog; choosing what to take, a subject or year's options, or anything shaped by constraints is discover_course_candidates, and one constraint is enough to act. Combined fit needs preview_timetable, not individual fits; when reviews matter, pass reviewTerms in that call, not get_course_reviews per course.";

const SEARCH_CATALOG_DESCRIPTION_BEFORE =
  "Search courses or instructors. For courses, filter by faculty, department, exact credits, course type, programme level, suggested year and offered status; sort by code, title, credits, suggested year or offered status; use searchIn=content to search titles, descriptions and ILOs. For a subject's full course list use the code prefix (e.g. ACCT). Course results include `aka` aliases; the primary courseCode is authoritative. Returns up to 50 courses per page with totalCount and hasMore. A keyword on an English subject word may only match titles; do not present that total as the number of courses in the subject.";

const SERVER_TOOL_NAMES = [
  "search_catalog",
  "count_courses",
  "get_course",
  "get_course_description",
  "get_course_ilo",
  "get_instructor",
  "get_course_reviews",
  "count_reviews",
  "get_course_sections",
  "discover_course_candidates",
  "present_response",
  "check_plan_conflicts",
  "preview_timetable",
] as const;

const ASSISTANT_TOOL_SURFACE = [
  ...SERVER_TOOL_NAMES,
  "navigate",
  "filter_catalog_results",
  "AGUISendStateSnapshot",
] as const;

const ROUTER_FILE = /(?:^|\/)(?:tool-router|keyword-router|tool-selection|message-to-tool)\.tsx?$/;
const ROUTER_EXPORT =
  /export\s+(?:async\s+)?(?:function|const|class)\s+(selectTool|chooseTool|toolForMessage|routeMessage|messageToTool)\b|export\s*\{[^}]*\b(selectTool|chooseTool|toolForMessage|routeMessage|messageToTool)\b/;

function promptFingerprint(): string {
  return createHash("sha256").update(ASSISTANT_PROMPT).update(NAVIGATE_DESCRIPTION).digest("hex").slice(0, 12);
}

function discoverySelectionBullets(prompt: string): string[] {
  return prompt
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("- ") && line.includes("discover_course_candidates") && !line.includes("present_response"),
    );
}

function listSourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (/\.tsx?$/.test(entry)) files.push(path);
  }
  return files;
}

function searchCatalogDescription(): string {
  const tool = createAssistantTools().find((entry) => entry.name === "search_catalog");
  if (!tool?.description) throw new Error("missing search_catalog description");
  return tool.description;
}

describe("discover_course_candidates description", () => {
  const description = DISCOVER_COURSE_CANDIDATES_DESCRIPTION;

  it("is the description the assistant tool actually exposes", () => {
    const tool = createAssistantTools().find((entry) => entry.name === "discover_course_candidates");
    expect(tool?.description).toBe(description);
  });

  it("contrasts catalog browsing with recommending ranked, fit-checked candidates", () => {
    expect(description).toMatch(/search_catalog/);
    expect(description).toMatch(/\bbrows|\blist(?:ing|s)\b/i);
    expect(description).toMatch(/recommend|which should I take/i);
    expect(description).toMatch(/shortlist/i);
    expect(description).toMatch(/ranked/);
    expect(description).toMatch(/fit-checked/);
    expect(description).not.toContain("when the student has no specific codes yet");
  });

  it("narrows a named subject with codePrefix or department, not courseType alone", () => {
    expect(description).toContain("GEST");
    expect(description).toContain("CISC");
    expect(description).toMatch(/codePrefix/);
    expect(description).toMatch(/department/);
    expect(description).toMatch(/courseType/);
    expect(description).toMatch(/too broad/i);
  });

  it("treats one constraint as enough and does not ask for a department first", () => {
    expect(description).toMatch(/one constraint is enough/i);
    expect(description).toMatch(/credit target|level|topic|time window|ease preference/i);
    expect(description).toMatch(/do not ask for a department first/i);
  });

  it("asks for short topic keywords and spelling variants, not sentences", () => {
    expect(description).toMatch(/short keywords/i);
    expect(description).toMatch(/spelling variants/i);
    expect(description).toMatch(/not sentences/i);
  });

  it("passes reviewTerms on the same discovery call", () => {
    expect(description).toMatch(/reviewTerms/);
    expect(description).toMatch(/same call/i);
    expect(description).toMatch(/one course at a time/i);
  });

  it("warns that individual noClash is not a combined timetable fit", () => {
    expect(description).toMatch(/required\.noClash/);
    expect(description).toMatch(/individually/);
    expect(description).toMatch(/saved plan/);
    expect(description).toMatch(/preview_timetable/);
    expect(description).toMatch(/combined fit/i);
  });

  it("keeps the truncated-pool, suggestedYear, and per-section fit safety sentences", () => {
    expect(description).toContain("examined.truncated");
    expect(description).toContain("do not claim the catalog was exhaustively searched");
    expect(description).toContain("suggestedYear is a catalog hint, not registration eligibility");
    expect(description).toContain("verified_no_clash");
    expect(description).toContain("fit not_checked");
    expect(description).toContain("not a combined schedule");
  });
});

describe("search_catalog description", () => {
  it("keeps the existing catalog description and adds one browse-versus-recommend clause", () => {
    const description = searchCatalogDescription();
    expect(description.startsWith(SEARCH_CATALOG_DESCRIPTION_BEFORE)).toBe(true);
    const added = description.slice(SEARCH_CATALOG_DESCRIPTION_BEFORE.length).trim();
    expect(added).toMatch(/\bbrowsing\b|\blisting\b/i);
    expect(added).toContain("discover_course_candidates");
    expect(added.split(/[.!?]/).filter((part) => part.trim().length > 0)).toHaveLength(1);
  });
});

describe("objective tool-selection prompt", () => {
  it("replaces the discovery bullet with one selection bullet", () => {
    expect(discoverySelectionBullets(ASSISTANT_PROMPT)).toEqual([DISCOVERY_SELECTION_BULLET]);
    expect(ASSISTANT_PROMPT).toMatch(/reviewTerms/);
    expect(ASSISTANT_PROMPT).not.toContain("once for goal-based searches without codes");
    expect(ASSISTANT_PROMPT).not.toContain("verified_no_clash");
    expect(ASSISTANT_PROMPT).not.toContain("mutualClashes");
  });

  it("updates the prompt fingerprint and stays within 220 added characters", () => {
    const source = readFileSync(join(process.cwd(), "lib/assistant/prompt.ts"), "utf8");
    expect(source).toContain(DISCOVERY_SELECTION_BULLET);
    expect(source.length - PROMPT_SOURCE_BASELINE_CHARS).toBeLessThanOrEqual(220);
    expect(promptFingerprint()).not.toBe(PREVIOUS_PROMPT_FINGERPRINT);
    expect(promptFingerprint()).toMatchInlineSnapshot(`"1d0be6222930"`);
  });
});

describe("tool-selection contract boundaries", () => {
  it("keeps the 16-name assistant tool surface and leaves search_catalog first", () => {
    expect([...ASSISTANT_SERVER_TOOL_NAMES]).toEqual([...SERVER_TOOL_NAMES]);
    expect(createAssistantTools().map((tool) => tool.name)).toEqual([...SERVER_TOOL_NAMES]);
    expect(ASSISTANT_TOOL_SURFACE).toHaveLength(16);
    expect(new Set(ASSISTANT_TOOL_SURFACE).size).toBe(16);
    expect(ASSISTANT_SERVER_TOOL_NAMES[0]).toBe("search_catalog");
  });

  it("does not add a module that maps message text to tool names", () => {
    const files = listSourceFiles(join(process.cwd(), "lib/assistant"));
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((file) => ROUTER_FILE.test(file))).toEqual([]);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(ROUTER_EXPORT);
    }
  });

  it("leaves the v2 catalog browse case optional, not required discovery", () => {
    const browse = DISCOVERY_CASES_V2.find((entry) => entry.id === "catalog_browse");
    expect(browse?.turns).toHaveLength(1);
    expect(browse?.turns[0]?.expect.discovery).toBe("optional");
  });
});
