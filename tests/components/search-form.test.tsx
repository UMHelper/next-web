import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, beforeAll, afterEach } from "vitest";

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

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

let debug: ReturnType<typeof vi.spyOn>;

describe("SearchForm", () => {
  beforeEach(() => {
    // dev 下 emit() 会打一行 console.debug；这里静音，保持测试输出干净。
    debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    push.mockClear();
    (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
  });

  afterEach(() => {
    debug.mockRestore();
  });

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

  it("reports the submitted course search with its entry point", async () => {
    render(<SearchForm variant="inline" />);
    fireEvent.change(screen.getByPlaceholderText(/ACCT1000/i), {
      target: { value: "acct1000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(pushed()).toHaveLength(1));
    expect(pushed()[0]).toEqual({
      event: "um_event",
      um_name: "search",
      // 口径说明：URL 会被 buildSearchPath 规范成大写，但事件里保留用户原始输入。
      search_term: "acct1000",
      search_scope: "course",
      entry_point: "inline",
    });
  });

  it("reports the instructor scope for the hero entry point", async () => {
    render(<SearchForm variant="hero" defaultMode="instructor" defaultCode="CHAN TAI MAN" />);
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(pushed()).toHaveLength(1));
    expect(pushed()[0]).toMatchObject({
      um_name: "search",
      search_scope: "instructor",
      entry_point: "hero",
    });
  });

  it("reports nothing when the form is invalid", async () => {
    render(<SearchForm variant="inline" />);
    fireEvent.change(screen.getByPlaceholderText(/ACCT1000/i), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: /search/i }));

    await waitFor(() => expect(screen.getByText(/at least 4 characters/i)).toBeTruthy());
    expect(pushed()).toHaveLength(0);
    expect(push).not.toHaveBeenCalled();
  });
});
