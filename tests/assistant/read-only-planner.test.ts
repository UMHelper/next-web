import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@copilotkit/runtime/v2", () => ({ defineTool: (config: unknown) => config }));
vi.mock("@/lib/mcp/data/search-catalog", () => ({ searchCatalog: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course", () => ({ getCourse: vi.fn() }));
vi.mock("@/lib/mcp/data/get-instructor", () => ({ getInstructor: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-reviews", () => ({ getCourseReviews: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({ getCourseSections: vi.fn() }));

import { ASSISTANT_SERVER_TOOL_NAMES } from "@/lib/assistant/tools";

const MUTATOR_PATTERN =
  /\b(addSection|replaceSection|removeSection|createPlan|renamePlan|deletePlan|setActivePlan|resolveConflict|apply(Add|Remove|Replace)Section|upsertPlanLocal|removePlanLocal|queueMutation|coalesceOutbox)\b/;
const TIMETABLE_CLIENT_PATTERN = /@\/lib\/timetable\/client/;
const PLANS_API_PATTERN = /\/api\/timetable\/plans/;

const READ_ONLY_TOOL_ALLOWLIST = new Set([
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
  "navigate",
  "filter_catalog_results",
  "AGUISendStateSnapshot",
]);

function listSourceFiles(root: string): string[] {
  const entries = readdirSync(root);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}

describe("assistant read-only planner guard", () => {
  it("assistant code never calls planner mutators or the plans API", () => {
    const roots = [
      join(process.cwd(), "lib/assistant"),
      join(process.cwd(), "components/assistant"),
    ];
    const files = roots.flatMap((root) => listSourceFiles(root));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, file).not.toMatch(MUTATOR_PATTERN);
      expect(content, file).not.toMatch(TIMETABLE_CLIENT_PATTERN);
      expect(content, file).not.toMatch(PLANS_API_PATTERN);
    }
  });

  it("every assistant tool is in the read-only allowlist", () => {
    const toolNames = [...ASSISTANT_SERVER_TOOL_NAMES, "navigate", "filter_catalog_results"];
    for (const name of toolNames) {
      expect(READ_ONLY_TOOL_ALLOWLIST.has(name), name).toBe(true);
    }
  });
});
