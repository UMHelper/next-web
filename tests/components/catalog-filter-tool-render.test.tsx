import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogFilterToolResult } from "@/components/assistant/use-catalog-results-tool";

const applied = {
  status: "applied" as const,
  resultSetId: "c1",
  filter: "offered" as const,
  shownCount: 2,
  loadedCount: 10,
  totalCount: 127,
  hasMore: true,
  shownCourseCodes: ["MATH1002", "MATH1005"],
  scope: "loaded_results_only" as const,
};

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("CatalogFilterToolResult", () => {
  it("shows the applied scope and jumps to the original results", () => {
    const target = document.createElement("div");
    target.id = "catalog-results-c1";
    target.scrollIntoView = vi.fn();
    document.body.append(target);
    render(<CatalogFilterToolResult status="complete" result={JSON.stringify(applied)} />);
    expect(
      screen.getByText(
        "Showing 2 offered courses among the 10 currently loaded results. There are 127 total matches. Other pages may include more offered courses.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show results" }));
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
  });

  it("shows all-courses copy for filter all", () => {
    render(
      <CatalogFilterToolResult
        status="complete"
        result={JSON.stringify({ ...applied, filter: "all", shownCount: 10 })}
      />,
    );
    expect(screen.getByText("Showing all 10 loaded courses.")).toBeTruthy();
  });

  it("explains an unknown result set", () => {
    render(
      <CatalogFilterToolResult
        status="complete"
        result={JSON.stringify({ status: "unknown_result_set" })}
      />,
    );
    expect(
      screen.getByText("Those earlier results are no longer available. Search again to filter them."),
    ).toBeTruthy();
  });

  it("shows a status while filtering", () => {
    render(<CatalogFilterToolResult status="executing" />);
    expect(screen.getByRole("status").textContent).toContain("Filtering results…");
  });
});
