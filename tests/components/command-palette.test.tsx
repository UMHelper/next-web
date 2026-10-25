import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  openAssistant: vi.fn(),
}));
const { push, openAssistant } = mocks;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/assistant/open", () => ({
  openAssistant: mocks.openAssistant,
}));

import { CommandPalette } from "@/components/command-palette";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const PAYLOAD = {
  courses: [
    {
      code: "ACCT1000",
      titleEn: "Principles of Financial Accounting",
      titleZh: "財務會計原理",
      faculty: "FBA",
      department: "ACCT",
      credits: "3",
    },
  ],
  instructors: [
    { name: "CHAN TAI MAN", courseCount: 3, sampleCourse: "ACCT1000" },
  ],
};

function renderPalette() {
  render(<CommandPalette />);
  fireEvent.click(screen.getByRole("button", { name: "Search courses and instructors" }));
  return screen.getByPlaceholderText("搜尋課程、教師、頁面…") as HTMLInputElement;
}

describe("CommandPalette", () => {
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

  it("opens from the trigger and searches courses and instructors", async () => {
    const input = renderPalette();
    expect(input).toBeTruthy();

    fireEvent.change(input, { target: { value: "ACCT" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/command-palette"), expect.anything()));
    expect(screen.getAllByRole("option", { name: /ACCT1000/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("option", { name: /CHAN TAI MAN/ })).toBeTruthy();

    fireEvent.click(screen.getAllByRole("option", { name: /ACCT1000/ })[0]);
    expect(push).toHaveBeenCalledWith("/course/ACCT1000");
    expect(window.localStorage.getItem("umeh:command-palette-recents")).toContain("ACCT1000");
  });

  it("offers Ask AI with the current query", async () => {
    const input = renderPalette();
    fireEvent.change(input, { target: { value: "給分好嗎" } });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/command-palette"), expect.anything()));
    const ask = screen.getByRole("option", { name: /Ask AI/ });
    fireEvent.click(ask);

    expect(openAssistant).toHaveBeenCalledWith({ prompt: "給分好嗎" });
  });

  it("shows page shortcuts when the query is empty", () => {
    renderPalette();
    expect(screen.getByRole("option", { name: /課程目錄/ })).toBeTruthy();
    expect(screen.getByRole("option", { name: /我的課表/ })).toBeTruthy();
  });
});
