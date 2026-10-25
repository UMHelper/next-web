import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  openAssistant: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/assistant/open", () => ({ openAssistant: mocks.openAssistant }));

import { HomeSearch } from "@/components/home-search";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const PAYLOAD = {
  courses: [
    {
      code: "ACCT1000",
      titleEn: "Principles of Financial Accounting",
      titleZh: "財務會計原理",
      faculty: "FBA",
      department: "AIM",
      credits: "3",
    },
  ],
  instructors: [{ name: "CHAN TAI MAN", courseCount: 3, sampleCourse: "ACCT1000" }],
};

describe("HomeSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFakeStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/assistant/access")) {
          return new Response(JSON.stringify({ enabled: true }), { status: 200 });
        }
        return new Response(JSON.stringify(PAYLOAD), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows recent/tips when empty and English course results when typing", async () => {
    render(<HomeSearch />);
    const input = screen.getByRole("combobox", { name: "Search courses and instructors" });
    fireEvent.focus(input);

    expect(screen.getByText("Search tips")).toBeTruthy();
    expect(screen.getByText("ACCT1000")).toBeTruthy();
    expect(screen.queryByText(/財務會計/)).toBeNull();

    fireEvent.change(input, { target: { value: "ACCT" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Principles of Financial Accounting/ })).toBeTruthy());
    expect(screen.getByRole("option", { name: /CHAN TAI MAN/ })).toBeTruthy();
    expect(screen.queryByText(/財務會計/)).toBeNull();
  });

  it("navigates when a course row is selected", async () => {
    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ACCT" } });

    const option = await screen.findByRole("option", { name: /Principles of Financial Accounting/ });
    fireEvent.click(option);

    expect(mocks.push).toHaveBeenCalledWith("/course/ACCT1000");
    expect(window.localStorage.getItem("umeh:command-palette-recents-v2")).toContain("ACCT1000");
  });

  it("opens the assistant for Ask AI", async () => {
    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ACCT" } });

    const ask = await screen.findByRole("option", { name: /Ask AI/ });
    fireEvent.click(ask);
    expect(mocks.openAssistant).toHaveBeenCalledWith({ prompt: "ACCT" });
  });
});
