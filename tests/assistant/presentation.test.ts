import { describe, expect, it } from "vitest";

import { ALWAYS_RICH_TOOL_NAMES, RICH_TOOL_NAMES } from "@/lib/assistant/rich-tools";
import {
  activePresent,
  callsForActivity,
  courseCallIdentity,
  createPresentationLedger,
  executePresentResponse,
  parsePresentArguments,
  planRichBlocks,
  PRESENT_RECEIPT_NOTE,
  PRESENT_RESPONSE_TOOL_NAME,
  sectionCallIdentity,
  seedLedgerFromMessages,
  trackLookup,
  type ToolCallLike,
} from "@/lib/assistant/presentation";

function call(id: string, name: string, args: unknown): ToolCallLike {
  return { id, function: { name, arguments: JSON.stringify(args) } };
}

function results(entries: Record<string, string>): Map<string, { content?: unknown }> {
  return new Map(Object.entries(entries).map(([id, content]) => [id, { content }]));
}

const course = (code: string) =>
  JSON.stringify({
    course: {
      courseCode: code,
      titleEn: code,
      titleZh: null,
      credits: "3",
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
      url: `https://umeh.top/course/${code}`,
    },
    page: 1,
    hasMore: false,
    totalCount: 0,
    instructors: [],
  });

describe("executePresentResponse", () => {
  it("never answers accepted", async () => {
    const receipt = await executePresentResponse({ show: [] }, createPresentationLedger());
    expect(receipt).toMatchObject({ status: "requested", items: [] });
    expect(receipt.status === "requested" && "accepted" in receipt).toBe(false);
  });

  it("is ready only after a matching successful lookup in this turn", async () => {
    const ledger = createPresentationLedger();
    await trackLookup(
      ledger,
      "get_course",
      { code: "GELH1000" },
      Promise.resolve(JSON.parse(course("GELH1000"))),
    );
    const receipt = await executePresentResponse(
      { show: [{ component: "course_detail", course: "GELH1000" }] },
      ledger,
    );
    expect(receipt).toMatchObject({ status: "requested", items: [{ eligibility: "ready" }] });
    expect(receipt.status === "requested" && receipt.note).toBe(PRESENT_RECEIPT_NOTE);
  });

  it("reports missing_lookup when nothing was looked up", async () => {
    const receipt = await executePresentResponse(
      { show: [{ component: "course_detail", course: "GELH1000" }] },
      createPresentationLedger(),
    );
    expect(receipt).toMatchObject({
      status: "requested",
      items: [{ component: "course_detail", course: "GELH1000", eligibility: "missing_lookup" }],
    });
  });

  it("reports lookup_failed when the lookup returned not_found", async () => {
    const ledger = createPresentationLedger();
    await trackLookup(
      ledger,
      "get_course",
      { code: "GELH1000" },
      Promise.resolve({ error: "not_found" }),
    );
    const receipt = await executePresentResponse(
      { show: [{ component: "course_detail", course: "GELH1000" }] },
      ledger,
    );
    expect(receipt).toMatchObject({
      status: "requested",
      items: [{ eligibility: "lookup_failed" }],
    });
  });

  it("waits for a lookup running in the same step (Review Focus 1)", async () => {
    const ledger = createPresentationLedger();
    let resolve!: (v: unknown) => void;
    const pending = trackLookup(
      ledger,
      "get_course",
      { code: "GELH1000" },
      new Promise((r) => {
        resolve = r;
      }),
    );
    const receiptPromise = executePresentResponse(
      { show: [{ component: "course_detail", course: "GELH1000" }] },
      ledger,
    );
    resolve(JSON.parse(course("GELH1000")));
    await pending;
    await expect(receiptPromise).resolves.toMatchObject({ items: [{ eligibility: "ready" }] });
  });

  it("matches the canonical code when the claim uses an old alias (Review Focus 2)", async () => {
    const ledger = createPresentationLedger();
    await trackLookup(
      ledger,
      "get_course",
      { code: "OLDC1000" },
      Promise.resolve(JSON.parse(course("GELH1000"))),
    );
    const canonicalClaim = await executePresentResponse(
      { show: [{ component: "course_detail", course: "GELH1000" }] },
      ledger,
    );
    expect(canonicalClaim).toMatchObject({ items: [{ eligibility: "ready" }] });
    const aliasClaim = await executePresentResponse(
      { show: [{ component: "course_detail", course: "OLDC1000" }] },
      ledger,
    );
    expect(aliasClaim).toMatchObject({ items: [{ eligibility: "ready" }] });
  });

  it("counts lookups from earlier runs of the current turn but not from earlier turns (Review Focus 3)", () => {
    const ledger = createPresentationLedger();
    seedLedgerFromMessages(ledger, [
      { role: "user", content: "What is GEST1004?" },
      {
        role: "assistant",
        toolCalls: [{ id: "a", function: { name: "get_course", arguments: '{"code":"GEST1004"}' } }],
      },
      { role: "tool", toolCallId: "a", content: course("GEST1004") },
      { role: "user", content: "Tell me more about GELH1000" },
      {
        role: "assistant",
        toolCalls: [{ id: "b", function: { name: "get_course", arguments: '{"code":"GELH1000"}' } }],
      },
      { role: "tool", toolCallId: "b", content: course("GELH1000") },
    ]);
    expect(ledger.lookups.map((l) => l.canonical)).toEqual(["GELH1000"]);
  });

  it("rejects malformed show items exactly as before", async () => {
    const ledger = createPresentationLedger();
    await expect(
      executePresentResponse({ mode: "course_comparison", courses: ["CISC2001", "CISC2003"] }, ledger),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_request" });
    await expect(
      executePresentResponse({ show: [{ component: "course_comparison", course: "CISC2001" }] }, ledger),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_request" });
    await expect(
      executePresentResponse({ show: [{ component: "course_detail", course: "CISC 2001" }] }, ledger),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_request" });
    await expect(
      executePresentResponse(
        {
          show: [
            { component: "course_detail", course: "CISC2001" },
            { component: "course_detail", course: "CISC2002" },
            { component: "course_detail", course: "CISC2003" },
            { component: "course_sections", course: "CISC2004" },
          ],
        },
        ledger,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_request" });
    await expect(
      executePresentResponse(
        {
          show: [
            { component: "course_detail", course: "CISC2001" },
            { component: "course_detail", course: "CISC2001" },
          ],
        },
        ledger,
      ),
    ).resolves.toEqual({ status: "rejected", reason: "invalid_request" });
  });

  it("accepts an empty show list and ignores unknown extra fields", async () => {
    const ledger = createPresentationLedger();
    expect(await executePresentResponse({ show: [], extra: true }, ledger)).toMatchObject({
      status: "requested",
      items: [],
    });
    expect(await executePresentResponse({}, ledger)).toMatchObject({ status: "requested", items: [] });
  });

  it("normalizes up to three distinct existing-component claims", async () => {
    const ledger = createPresentationLedger();
    await trackLookup(
      ledger,
      "get_course",
      { code: "CISC2001" },
      Promise.resolve(JSON.parse(course("CISC2001"))),
    );
    await trackLookup(
      ledger,
      "get_course_sections",
      { code: "CISC2001", instructor: "CHAN TAI MAN" },
      Promise.resolve(
        JSON.parse(
          JSON.stringify({
            courseCode: "CISC2001",
            instructor: "CHAN TAI MAN",
            courseUrl: "https://umeh.top/course/CISC2001",
            sections: [],
          }),
        ),
      ),
    );
    const receipt = await executePresentResponse(
      {
        show: [
          { component: "course_detail", course: "cisc2001" },
          { component: "course_sections", course: "CISC2001" },
        ],
      },
      ledger,
    );
    expect(receipt).toMatchObject({
      status: "requested",
      items: [
        { component: "course_detail", course: "CISC2001", eligibility: "ready" },
        { component: "course_sections", course: "CISC2001", eligibility: "ready" },
      ],
    });
  });
});

describe("parsePresentArguments", () => {
  it("returns null while JSON is incomplete", () => {
    expect(parsePresentArguments('{"show":')).toBeNull();
  });

  it("parses a finished payload", () => {
    expect(parsePresentArguments('{"show":[]}')).toEqual({ show: [] });
  });
});

describe("planRichBlocks", () => {
  const always = ALWAYS_RICH_TOOL_NAMES;

  it("keeps search and filter rich, and hides course and section cards by default", () => {
    const calls = [
      call("s", "search_catalog", { query: "MATH" }),
      call("g", "get_course", { code: "CISC2001" }),
      call("sec", "get_course_sections", { code: "CISC2001", instructor: "CHAN TAI MAN" }),
    ];
    expect(planRichBlocks(calls, results({}), always, true).map((block) => block.callId)).toEqual(["s"]);
    expect(planRichBlocks(calls, results({}), always, false).map((block) => block.callId)).toEqual([]);
    expect(RICH_TOOL_NAMES.has("get_course")).toBe(true);
    expect(ALWAYS_RICH_TOOL_NAMES.has("get_course")).toBe(false);
  });

  it("mounts claimed course and section cards, including a rewritten canonical code", () => {
    const calls = [
      call("g", "get_course", { code: "CISC9999" }),
      call("sec", "get_course_sections", { code: "CISC2001", instructor: "CHAN TAI MAN" }),
      call("p", PRESENT_RESPONSE_TOOL_NAME, {
        show: [
          { component: "course_detail", course: "CISC9999" },
          { component: "course_sections", course: "CISC2001" },
        ],
      }),
    ];
    const map = results({
      g: course("CISC2001"),
      sec: JSON.stringify({
        courseCode: "CISC2001",
        instructor: "CHAN TAI MAN",
        courseUrl: "https://umeh.top/course/CISC2001",
        sections: [],
      }),
    });
    expect(courseCallIdentity(calls[0], map.get("g")?.content as string)).toEqual({
      argument: "CISC9999",
      canonical: "CISC2001",
    });
    expect(sectionCallIdentity(calls[1], map.get("sec")?.content as string)).toEqual({
      argument: "CISC2001",
      canonical: "CISC2001",
    });
    expect(planRichBlocks(calls, map, always, false).map((block) => block.callId)).toEqual(["g", "sec"]);
  });

  it("keeps cards when a later empty show follows a non-empty one, replaces on a later non-empty show, and ignores a later rejection", () => {
    const lookups = [call("g", "get_course", { code: "CISC2001" })];
    const emptyAfterNonEmpty = [
      ...lookups,
      call("p1", PRESENT_RESPONSE_TOOL_NAME, { show: [{ component: "course_detail", course: "CISC2001" }] }),
      call("p2", PRESENT_RESPONSE_TOOL_NAME, { show: [] }),
    ];
    expect(planRichBlocks(emptyAfterNonEmpty, results({}), always, false)).toEqual([{ kind: "tool", callId: "g" }]);
    const nonEmptyReplace = [
      ...lookups,
      call("p1", PRESENT_RESPONSE_TOOL_NAME, { show: [{ component: "course_detail", course: "CISC2001" }] }),
      call("p2", PRESENT_RESPONSE_TOOL_NAME, {
        show: [{ component: "course_sections", course: "CISC2001" }],
      }),
      call("sec", "get_course_sections", { code: "CISC2001", instructor: "CHAN TAI MAN" }),
    ];
    expect(planRichBlocks(nonEmptyReplace, results({}), always, false).map((block) => block.callId)).toEqual(["sec"]);
    const rejectedLater = [
      ...lookups,
      call("p1", PRESENT_RESPONSE_TOOL_NAME, { show: [{ component: "course_detail", course: "CISC2001" }] }),
      call("p2", PRESENT_RESPONSE_TOOL_NAME, { mode: "course_comparison" }),
    ];
    const map = results({
      p2: JSON.stringify({ status: "rejected", reason: "invalid_request" }),
    });
    expect(activePresent(rejectedLater, map)?.request).toEqual({
      show: [{ component: "course_detail", course: "CISC2001" }],
    });
    expect(planRichBlocks(rejectedLater, map, always, false)).toEqual([{ kind: "tool", callId: "g" }]);
  });

  it("still shows a clarification from get_course", () => {
    const calls = [call("g", "get_course", { code: "CISC2001" })];
    const map = results({ g: JSON.stringify({ status: "needs_clarification", ask: "Which course do you mean?" }) });
    expect(planRichBlocks(calls, map, always, true)).toEqual([{ kind: "tool", callId: "g" }]);
  });

  it("drops present_response from activity", () => {
    const calls = [
      call("g", "get_course", { code: "CISC2001" }),
      call("p", PRESENT_RESPONSE_TOOL_NAME, { show: [] }),
    ];
    expect(callsForActivity(calls).map((entry) => entry.id)).toEqual(["g"]);
  });

  it("mounts one card when the same course was looked up twice and claimed", () => {
    const calls = [
      call("c1", "get_course", { code: "GELH1000" }),
      call("c2", "get_course", { code: "GELH1000" }),
      call("p", PRESENT_RESPONSE_TOOL_NAME, {
        show: [{ component: "course_detail", course: "GELH1000" }],
      }),
    ];
    const map = results({
      c1: course("GELH1000"),
      c2: course("GELH1000"),
    });
    expect(planRichBlocks(calls, map, always, false).map((block) => block.callId)).toEqual(["c1"]);
  });

  it("mounts one card when an alias call and a primary call resolve to the same course", () => {
    const calls = [
      call("c1", "get_course", { code: "OLDC1000" }),
      call("c2", "get_course", { code: "GELH1000" }),
      call("p", PRESENT_RESPONSE_TOOL_NAME, {
        show: [{ component: "course_detail", course: "GELH1000" }],
      }),
    ];
    const map = results({
      c1: course("GELH1000"),
      c2: course("GELH1000"),
    });
    expect(planRichBlocks(calls, map, always, false).map((block) => block.callId)).toEqual(["c1"]);
  });
});
