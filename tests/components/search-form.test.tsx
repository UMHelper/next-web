import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
});

import SearchForm from "@/components/search/search-form";

describe("SearchForm", () => {
  beforeEach(() => push.mockClear());

  it("submits course search by default", async () => {
    render(<SearchForm variant="inline" />);
    fireEvent.change(screen.getByPlaceholderText(/ACCT1000/i), {
      target: { value: "acct1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/search/course/ACCT1000"));
  });

  it("submits instructor search when switch is enabled", async () => {
    render(<SearchForm variant="inline" defaultMode="instructor" defaultCode="CHAN TAI MAN" />);
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/search/instructor/CHAN%20TAI%20MAN"));
  });
});
