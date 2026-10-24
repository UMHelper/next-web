import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const data = vi.hoisted(() => ({
  searchCatalog: vi.fn(),
  getCourse: vi.fn(),
  getInstructor: vi.fn(),
  getCourseReviews: vi.fn(),
  getCourseSections: vi.fn(),
}));

vi.mock("@copilotkit/runtime/v2", () => ({ defineTool: (config: unknown) => config }));
vi.mock("@/lib/mcp/data/search-catalog", () => ({ searchCatalog: data.searchCatalog }));
vi.mock("@/lib/mcp/data/get-course", () => ({ getCourse: data.getCourse }));
vi.mock("@/lib/mcp/data/get-instructor", () => ({ getInstructor: data.getInstructor }));
vi.mock("@/lib/mcp/data/get-course-reviews", () => ({ getCourseReviews: data.getCourseReviews }));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({ getCourseSections: data.getCourseSections }));

import { type CourseReferentSlot } from "@/lib/assistant/course-referent";
import { ASSISTANT_SERVER_TOOL_NAMES, createAssistantTools } from "@/lib/assistant/tools";
import { McpToolError } from "@/lib/mcp/errors";

const COURSE_URL = "https://umeh.top/course/ACCT1000";
const REVIEW_URL = "https://umeh.top/reviews/ACCT1000/CHAN%20TAI%20MAN";

async function call(name: string, args: Record<string, unknown>, slot?: CourseReferentSlot) {
  const tool = createAssistantTools(slot).find((entry) => entry.name === name);
  if (!tool?.execute) throw new Error(`missing tool ${name}`);
  return (tool.execute as (input: unknown) => Promise<unknown>)(args);
}

describe("assistant server tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers the read-only tools, including present_response", () => {
    expect(createAssistantTools().map((tool) => tool.name)).toEqual([...ASSISTANT_SERVER_TOOL_NAMES]);
    expect(ASSISTANT_SERVER_TOOL_NAMES).toContain("present_response");
    expect(ASSISTANT_SERVER_TOOL_NAMES.at(-1)).toBe("preview_timetable");
  });

  it("defaults present_response to omit unless the student asked to see a card", () => {
    const tool = createAssistantTools().find((entry) => entry.name === "present_response");
    expect(tool?.description).toContain("Default: omit this tool");
    expect(tool?.description).not.toContain("intent is already clear");
  });

  it("rejects present_response show lists longer than MAX_PRESENT_SHOW_ITEMS at the schema", () => {
    const tool = createAssistantTools().find((entry) => entry.name === "present_response");
    expect(tool?.parameters).toBeInstanceOf(z.ZodType);
    const schema = tool!.parameters as z.ZodType;
    const four = {
      show: [
        { component: "course_detail", course: "CISC2001" },
        { component: "course_detail", course: "CISC2002" },
        { component: "course_detail", course: "CISC2003" },
        { component: "course_detail", course: "CISC2004" },
      ],
    };
    expect(schema!.safeParse(four).success).toBe(false);
    const three = {
      show: [
        { component: "course_detail", course: "CISC2001" },
        { component: "course_detail", course: "CISC2002" },
        { component: "course_detail", course: "CISC2003" },
      ],
    };
    expect(schema!.safeParse(three).success).toBe(true);
  });

  it("validates present_response without reading academic data", async () => {
    await expect(
      call("present_response", { show: [{ component: "course_detail", course: "CISC2001" }] }),
    ).resolves.toEqual({
      status: "accepted",
      show: [{ component: "course_detail", course: "CISC2001" }],
    });
    expect(data.getCourse).not.toHaveBeenCalled();
    expect(data.getInstructor).not.toHaveBeenCalled();
    expect(data.searchCatalog).not.toHaveBeenCalled();
    expect(data.getCourseReviews).not.toHaveBeenCalled();
    expect(data.getCourseSections).not.toHaveBeenCalled();
  });

  it("describes tools in English so the model does not lean toward one reply language", () => {
    const text = JSON.stringify(
      createAssistantTools().map((tool) => [tool.description, (tool as { parameters?: unknown }).parameters]),
    );
    expect(text).not.toMatch(/[\p{Script=Han}]/u);
  });

  it("normalizes input through the MCP schema before reading data", async () => {
    data.getCourseSections.mockResolvedValue({
      courseCode: "ACCT1000",
      instructor: "CHAN TAI MAN",
      courseUrl: COURSE_URL,
      sections: [
        {
          section: "001",
          schedules: [{ weekday: "MON", startTime: "09:00", endTime: "10:15", location: "E22-1001" }],
          courseUrl: COURSE_URL,
        },
      ],
    });

    await call("get_course_sections", { code: " acct1000 ", instructor: "chan  tai man" });

    expect(data.getCourseSections).toHaveBeenCalledWith({ code: "ACCT1000", instructor: "CHAN TAI MAN" });
  });

  it("strips review fields outside the MCP output schema", async () => {
    data.getCourseReviews.mockResolvedValue({
      courseCode: "ACCT1000",
      instructor: "CHAN TAI MAN",
      page: 1,
      hasMore: false,
      url: REVIEW_URL,
      admin_note_en: "internal",
      reviews: [
        {
          publishedAt: "2026-09-01",
          content: "好课",
          contentEn: null,
          result: 4,
          upvotes: 1,
          downvotes: 0,
          verified: true,
          url: REVIEW_URL,
          verify_account: "user_author",
          hidden: false,
          admin_note: "internal",
        },
      ],
    });

    const output = JSON.stringify(await call("get_course_reviews", { code: "ACCT1000", instructor: "CHAN TAI MAN" }));

    for (const field of ["verify_account", "hidden", "admin_note", "admin_note_en"]) {
      expect(output).not.toContain(field);
    }
    expect(output).toContain("好课");
  });

  it("strips the internal prof_with_course id from course instructors", async () => {
    data.getCourse.mockResolvedValue({
      course: {
        courseCode: "ACCT1000",
        titleEn: "Principles of Accounting",
        titleZh: null,
        credits: "3",
        faculty: "FBA",
        department: "ACCT",
        programLevel: null,
        suggestedYear: null,
        medium: null,
        gradingSystem: null,
        courseType: null,
        duration: null,
        description: null,
        isOffered: true,
        url: COURSE_URL,
      },
      page: 1,
      hasMore: false,
      totalCount: 1,
      instructors: [
        {
          id: 42,
          name: "CHAN TAI MAN",
          commentCount: 3,
          result: 4,
          attendance: null,
          grade: null,
          difficulty: null,
          reward: null,
          isOffered: true,
          reviewUrl: REVIEW_URL,
        },
      ],
    });

    const output = await call("get_course", { code: "acct1000" });

    expect(output).toMatchObject({ instructors: [{ name: "CHAN TAI MAN" }] });
    expect(JSON.stringify(output)).not.toContain('"id"');
  });

  it("rejects invalid input without touching the data layer", async () => {
    await expect(call("search_catalog", { type: "course" })).resolves.toEqual({ error: "invalid_request" });
    expect(data.searchCatalog).not.toHaveBeenCalled();
  });

  it("reports missing records as not_found", async () => {
    data.getInstructor.mockRejectedValue(new McpToolError("not_found"));
    await expect(call("get_instructor", { name: "NOBODY" })).resolves.toEqual({ error: "not_found" });
  });

  it("hides other failures behind temporarily_unavailable", async () => {
    data.searchCatalog.mockRejectedValue(new Error("supabase exploded"));
    await expect(call("search_catalog", { type: "course", query: "acct" })).resolves.toEqual({
      error: "temporarily_unavailable",
    });
  });

  it("treats output that breaks the MCP schema as unavailable", async () => {
    data.getCourseSections.mockResolvedValue({ courseCode: "ACCT1000", sections: "nope" });
    await expect(
      call("get_course_sections", { code: "ACCT1000", instructor: "CHAN TAI MAN" }),
    ).resolves.toEqual({ error: "temporarily_unavailable" });
  });

  it("fetches the page course when the model passes a stale code", async () => {
    data.getCourse.mockResolvedValue({
      course: {
        courseCode: "CISC3014",
        titleEn: "Fixture",
        titleZh: null,
        credits: null,
        faculty: null,
        department: null,
        programLevel: null,
        suggestedYear: null,
        medium: null,
        gradingSystem: null,
        courseType: null,
        duration: null,
        description: null,
        isOffered: true,
        url: COURSE_URL,
      },
      page: 1,
      hasMore: false,
      totalCount: 0,
      instructors: [],
    });
    const slot: CourseReferentSlot = { current: { kind: "page", courseCode: "CISC3014" } };

    await call("get_course", { code: "APAC2000" }, slot);

    expect(data.getCourse).toHaveBeenCalledWith(expect.objectContaining({ code: "CISC3014" }));
  });

  it("fetches the named course when the model passes the page course", async () => {
    data.getCourseSections.mockResolvedValue({
      courseCode: "APAC2000",
      instructor: "CHAN TAI MAN",
      courseUrl: COURSE_URL,
      sections: [],
    });
    const slot: CourseReferentSlot = { current: { kind: "explicit", courseCode: "APAC2000" } };

    await call("get_course_sections", { code: "CISC3014", instructor: "CHAN TAI MAN" }, slot);

    expect(data.getCourseSections).toHaveBeenCalledWith({ code: "APAC2000", instructor: "CHAN TAI MAN" });
  });

  it("does not fetch a course when the referent is ambiguous", async () => {
    const slot: CourseReferentSlot = {
      current: { kind: "ambiguous", reason: "no_page_course", ask: "Which course do you mean?" },
    };

    await expect(call("get_course", { code: "APAC2000" }, slot)).resolves.toEqual({
      status: "needs_clarification",
      ask: "Which course do you mean?",
    });
    expect(data.getCourse).not.toHaveBeenCalled();
  });
});
