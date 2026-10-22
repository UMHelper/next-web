import { describe, expect, it } from "vitest";

import { EVAL_CASES } from "@/evals/assistant/cases";
import { EVAL_COURSE_CODES, getCourseReviews } from "@/evals/assistant/catalog";
import { TOKEN_CASES } from "@/evals/assistant/token-cases";
import { describePage } from "@/lib/assistant/page-context";
import { getCourseReviewsInputSchema } from "@/lib/mcp/schemas";

const signal = new AbortController().signal;
const turns = TOKEN_CASES.flatMap((evalCase) => evalCase.turns);

describe("phase 2 token suite", () => {
  it("reuses the Phase 1 comparison case unchanged and adds new ids only", () => {
    expect(TOKEN_CASES[0]).toBe(EVAL_CASES.find((evalCase) => evalCase.id === "info-compare-zh-hant"));
    const newIds = TOKEN_CASES.slice(1).map((evalCase) => evalCase.id);
    expect(newIds.every((id) => id.startsWith("tokens-"))).toBe(true);
    expect(new Set(TOKEN_CASES.map((evalCase) => evalCase.id)).size).toBe(TOKEN_CASES.length);
  });

  it("is mostly Traditional Chinese, with one English control", () => {
    expect(turns.map((turn) => turn.expect.replyLanguage)).toEqual(["chinese", "chinese", "chinese", "english"]);
  });

  it("only asks questions, so no turn may navigate", () => {
    expect(turns.every((turn) => turn.expect.navigate === "forbidden")).toBe(true);
  });

  it("starts on pages the assistant can describe", () => {
    for (const evalCase of TOKEN_CASES) expect(describePage(evalCase.pathname).page).not.toBe("other");
  });

  it("only expects lookups the fixture catalog can answer", async () => {
    for (const tool of turns.flatMap((turn) => turn.expect.tools ?? [])) {
      expect(EVAL_COURSE_CODES).toContain(tool.args?.code);
      if (tool.args?.instructor) {
        await expect(
          getCourseReviews(getCourseReviewsInputSchema.parse({ code: tool.args.code, instructor: tool.args.instructor }), signal),
        ).resolves.toBeDefined();
      }
    }
  });
});
