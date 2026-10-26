import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ToolRow, ToolTrace } from "@/components/ai-elements/tool";
import type { ToolCall, ToolMessage } from "@copilotkit/react-core/v2";

function call(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: "call-1",
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  };
}

function result(content: string, error?: string): ToolMessage {
  return { id: "t1", role: "tool", toolCallId: "call-1", content, ...(error ? { error } : {}) };
}

const emptyCatalog = JSON.stringify({
  type: "course",
  page: 1,
  hasMore: false,
  totalCount: 0,
  results: [],
});

afterEach(() => cleanup());

function statusRow() {
  const row = document.querySelector<HTMLElement>("[data-status]");
  expect(row).toBeTruthy();
  return row!;
}

function row(props: {
  name?: string;
  args?: Record<string, unknown>;
  content?: string;
  error?: string;
  isRunning?: boolean;
  omitResult?: boolean;
}) {
  render(
    <div className="w-[240px]">
      <ToolRow
        call={call(props.name ?? "search_catalog", props.args ?? { query: "MATH" })}
        result={props.omitResult ? undefined : result(props.content ?? emptyCatalog, props.error)}
        isRunning={props.isRunning ?? false}
      />
    </div>,
  );
}

describe("ToolRow status", () => {
  it("shows a pending call as not completed", () => {
    row({ omitResult: true, isRunning: false });
    const status = statusRow();
    expect(status.getAttribute("data-status")).toBe("pending");
    expect(status.textContent).toContain("Not completed");
    expect(status.querySelector("svg")?.getAttribute("class") ?? "").not.toContain("animate-spin");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a running call with the action and query", () => {
    row({ omitResult: true, isRunning: true });
    const status = statusRow();
    expect(status.getAttribute("data-status")).toBe("running");
    expect(status.textContent).toContain("Searching courses…");
    expect(status.textContent).toContain("MATH");
    expect(status.querySelector("svg")?.getAttribute("class")).toContain("animate-spin");
  });

  it("shows a successful empty catalog search as completed", () => {
    row({ content: emptyCatalog });
    const status = statusRow();
    expect(status.getAttribute("data-status")).toBe("done");
    expect(status.textContent).toContain("Searched courses");
    expect(status.textContent).toContain("MATH");
    expect(status.textContent).not.toContain("Lookup failed");
  });

  it("shows a transport failure instead of success", () => {
    row({ content: emptyCatalog, error: "timeout" });
    const status = statusRow();
    expect(status.getAttribute("data-status")).toBe("error");
    expect(status.textContent).toContain("Lookup failed");
    expect(status.textContent).not.toContain("Searched courses");
  });

  it("shows a domain not_found error instead of success", () => {
    row({ name: "get_course", args: { code: "APAC1000" }, content: '{"error":"not_found"}' });
    const status = statusRow();
    expect(status.getAttribute("data-status")).toBe("error");
    expect(status.textContent).toContain("Lookup failed");
    expect(status.textContent).toContain("APAC1000");
    expect(status.className).toContain("min-w-0");
  });

  it("shows a temporary domain failure instead of success", () => {
    row({ content: '{"error":"temporarily_unavailable"}' });
    const status = statusRow();
    expect(status.getAttribute("data-status")).toBe("error");
    expect(status.textContent).toContain("Lookup failed");
  });

  it("shows malformed JSON as a failure", () => {
    row({ content: "{not json" });
    expect(statusRow().getAttribute("data-status")).toBe("error");
  });

  it("shows an applied filter with zero rows as completed", () => {
    row({
      name: "filter_catalog_results",
      args: { resultSetId: "call-1", filter: "offered" },
      content: JSON.stringify({
        status: "applied",
        resultSetId: "call-1",
        filter: "offered",
        shownCount: 0,
        loadedCount: 4,
        totalCount: 4,
        hasMore: false,
        shownCourseCodes: [],
        scope: "loaded_results_only",
      }),
    });
    const status = statusRow();
    expect(status.getAttribute("data-status")).toBe("done");
    expect(status.textContent).toContain("Filtered results");
    expect(status.textContent).not.toContain("call-1");
  });

  it("shows an unknown filter target as a failure", () => {
    row({
      name: "filter_catalog_results",
      args: { resultSetId: "missing", filter: "offered" },
      content: '{"status":"unknown_result_set"}',
    });
    const status = statusRow();
    expect(status.getAttribute("data-status")).toBe("error");
    expect(status.textContent).toContain("Lookup failed");
    expect(status.textContent).not.toContain("Filtered results");
  });

  it("does not restart a completed row when isRunning is still true", () => {
    row({ content: emptyCatalog, isRunning: true });
    const status = statusRow();
    expect(status.getAttribute("data-status")).toBe("done");
    expect(status.querySelector("svg")?.getAttribute("class") ?? "").not.toContain("animate-spin");
  });

  it("truncates a long query inside the row", () => {
    const query = "M".repeat(180);
    row({ args: { query } });
    const status = statusRow();
    const detail = status.querySelector(".truncate");
    expect(status.className).toContain("min-w-0");
    expect(detail?.className).toContain("truncate");
    expect(detail?.textContent).toContain(query);
  });

  it("ToolTrace renders one row per call inside an aria-live region", () => {
    const calls = [call("get_instructor", { name: "CHAN TAI MAN" })];
    const results = new Map<string, ToolMessage>([
      ["call-1", result(JSON.stringify({
        name: "CHAN TAI MAN",
        page: 1,
        hasMore: false,
        totalCount: 0,
        courses: [],
      }))],
    ]);
    render(<ToolTrace calls={calls} results={results} isRunning={false} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Show 1 tool step" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Show 1 tool step" }));
    expect(screen.getByText("Read instructor")).toBeTruthy();
    expect(screen.getByText(/CHAN TAI MAN/)).toBeTruthy();
    expect(document.querySelector("[aria-live='polite']")).toBeTruthy();
  });
});

describe("ToolTrace collapse", () => {
  function searchCall(id: string, query: string): ToolCall {
    return {
      id,
      type: "function",
      function: { name: "search_catalog", arguments: JSON.stringify({ query }) },
    };
  }

  it("shows a step summary when complete and hides rows until expanded", () => {
    const calls = [
      searchCall("c1", "artificial intelligence"),
      searchCall("c2", "machine learning"),
    ];
    const results = new Map<string, ToolMessage>([
      ["c1", result(emptyCatalog)],
      ["c2", result(emptyCatalog)],
    ]);
    render(<ToolTrace calls={calls} results={results} isRunning={false} />);

    expect(screen.getByText("2 steps")).toBeTruthy();
    expect(screen.queryByText("Searched courses")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show 2 tool steps" }));
    expect(screen.getAllByText("Searched courses")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Hide tool steps" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("expands automatically while running", () => {
    const calls = [searchCall("c1", "ACCT")];
    render(<ToolTrace calls={calls} results={new Map()} isRunning={true} />);

    expect(screen.getByText("Searching courses…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide tool steps" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("toggles rows without changing the running auto-expand on the next run", () => {
    const calls = [searchCall("c1", "ACCT")];
    const results = new Map<string, ToolMessage>([["c1", result(emptyCatalog)]]);
    const { rerender } = render(
      <ToolTrace calls={calls} results={results} isRunning={true} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide tool steps" }));
    expect(screen.queryByText("Searched courses")).toBeNull();

    rerender(<ToolTrace calls={calls} results={results} isRunning={false} />);
    expect(screen.getByRole("button", { name: "Show 1 tool step" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(screen.queryByText("Searched courses")).toBeNull();
  });
});
