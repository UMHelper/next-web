import { describe, expect, it } from "vitest";

import { dedupeCalls } from "@/components/ai-elements/tool";
import type { ToolCall, ToolMessage } from "@copilotkit/react-core/v2";

function call(
  id: string,
  name: string,
  args: Record<string, unknown> | string,
): ToolCall {
  const argumentsJson = typeof args === "string" ? args : JSON.stringify(args);
  return {
    id,
    type: "function",
    function: { name, arguments: argumentsJson },
  };
}

function toolResult(toolCallId: string, content = "ok"): ToolMessage {
  return { id: `t-${toolCallId}`, role: "tool", toolCallId, content };
}

describe("dedupeCalls", () => {
  it("keeps two calls with identical arguments but different ids", () => {
    const calls = [
      call("call-1", "search_catalog", { query: "ACCT" }),
      call("call-2", "search_catalog", { query: "ACCT" }),
    ];
    const results = new Map([
      ["call-1", toolResult("call-1", "a")],
      ["call-2", toolResult("call-2", "b")],
    ]);

    const rows = dedupeCalls(calls, results);
    expect(rows.map((row) => row.id)).toEqual(["call-1", "call-2"]);
  });

  it("keeps a call that has a result even when args match an earlier call without a result", () => {
    const calls = [
      call("call-1", "search_catalog", { query: "ACCT" }),
      call("call-2", "search_catalog", { query: "ACCT" }),
    ];
    const results = new Map([["call-2", toolResult("call-2")]]);

    const rows = dedupeCalls(calls, results);
    expect(rows.map((row) => row.id)).toEqual(["call-1", "call-2"]);
  });

  it("collapses repeated representations of the same call id, preferring detailed args", () => {
    const calls = [
      call("call-1", "search_catalog", "{}"),
      call("call-1", "search_catalog", { query: "ACCT" }),
    ];

    const rows = dedupeCalls(calls);
    expect(rows).toHaveLength(1);
    expect(rows[0].function.arguments).toContain("ACCT");
  });

  it("drops an empty-arg replay when a detailed call of the same name exists and the replay has no result", () => {
    const calls = [
      call("call-1", "search_catalog", { query: "ACCT" }),
      call("call-2", "search_catalog", "{}"),
    ];
    const results = new Map([["call-1", toolResult("call-1")]]);

    const rows = dedupeCalls(calls, results);
    expect(rows.map((row) => row.id)).toEqual(["call-1"]);
  });

  it("keeps at most one empty-arg call per tool name when none have results", () => {
    const calls = [
      call("call-1", "search_catalog", "{}"),
      call("call-2", "search_catalog", "{}"),
    ];

    const rows = dedupeCalls(calls);
    expect(rows).toHaveLength(1);
  });
});
