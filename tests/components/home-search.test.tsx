import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  openAssistant: vi.fn(),
  auth: { isLoaded: true, isSignedIn: true },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/assistant/open", () => ({ openAssistant: mocks.openAssistant }));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => mocks.auth }));

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
      equivalentCodes: ["ACCT100"],
    },
  ],
  instructors: [{ name: "CHAN TAI MAN", courseCount: 3, sampleCourse: "ACCT1000" }],
};

describe("HomeSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.isLoaded = true;
    mocks.auth.isSignedIn = true;
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
    expect(screen.getAllByRole("button", { name: "Ask AI" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Try asking")).toBeTruthy();
    expect(screen.getByText("What is ACCT1000? How many credits?")).toBeTruthy();
    expect(screen.queryByText(/財務會計/)).toBeNull();

    fireEvent.change(input, { target: { value: "ACCT" } });
    await waitFor(() => expect(screen.getByRole("option", { name: /Principles of Financial Accounting/ })).toBeTruthy());
    expect(screen.getByRole("option", { name: /CHAN TAI MAN/ })).toBeTruthy();
    expect(screen.getByText(/a\.k\.a\. ACCT100/)).toBeTruthy();
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

  it("keeps Ask AI first and selects it by default", async () => {
    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ACCT" } });

    const searchRow = await screen.findByRole("option", { name: /Search Courses for/i });
    const options = screen.getAllByRole("option");
    expect(options[0]?.textContent).toContain("Ask AI");
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(options[1]).toBe(searchRow);
    expect(searchRow.getAttribute("aria-selected")).toBe("false");

    fireEvent.keyDown(input, { key: "Enter" });
    expect(mocks.openAssistant).toHaveBeenCalledWith({ prompt: "ACCT", autoSend: true });
  });

  it("uses the Ask AI button instead of a search submit", async () => {
    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "CHAN TAI MAN" } });

    await screen.findByRole("option", { name: /Search Instructors for/i });
    fireEvent.click(screen.getAllByRole("button", { name: "Ask AI" })[0]);
    expect(mocks.openAssistant).toHaveBeenCalledWith({ prompt: "CHAN TAI MAN", autoSend: true });
  });

  it("shows only the matching course and Ask AI for a course code", async () => {
    let resolveSearch: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes("/api/assistant/access")) {
          return Promise.resolve(new Response(JSON.stringify({ enabled: true }), { status: 200 }));
        }
        return new Promise<Response>((resolve) => {
          resolveSearch = resolve;
        });
      }),
    );

    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ACCT1000" } });

    await waitFor(() => expect(screen.getByTestId("home-search-skeleton")).toBeTruthy());
    expect(screen.queryByRole("option", { name: /Search Course List/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Search Instructors/ })).toBeNull();

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/command-palette"), expect.anything()),
    );
    resolveSearch(new Response(JSON.stringify(PAYLOAD), { status: 200 }));

    const course = await screen.findByRole("option", { name: /Principles of Financial Accounting/ });
    const options = screen.getAllByRole("option");
    expect(course.getAttribute("aria-selected")).toBe("true");
    expect(options[1]?.textContent).toContain("Ask AI");
    expect(screen.queryByText("Search Results")).toBeNull();
  });


  it("turns Try asking prompts into auto-sent AI messages", async () => {
    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    const tip = await screen.findByRole("option", { name: /Which courses cover accounting/ });
    fireEvent.click(tip);
    expect(mocks.openAssistant).toHaveBeenCalledWith({
      prompt: "Which courses cover accounting?",
      autoSend: true,
    });
  });

  it("resolves an old a.k.a. code to its primary course", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/assistant/access")) {
          return new Response(JSON.stringify({ enabled: true }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            courses: [
              {
                code: "CSCI1001",
                titleEn: "Programming Science",
                titleZh: null,
                faculty: "FIC",
                department: "CSC",
                credits: "3",
                equivalentCodes: ["CISC1001"],
              },
            ],
            instructors: [],
          }),
          { status: 200 },
        );
      }),
    );

    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "CISC1001" } });

    const course = await screen.findByRole("option", { name: /CSCI1001/ });
    expect(course.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/a\.k\.a\. CISC1001/)).toBeTruthy();
  });

  it("does not show AI entry points when signed out", async () => {
    mocks.auth.isSignedIn = false;
    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    expect(screen.queryByRole("button", { name: /Ask AI|Sign in/ })).toBeNull();
    expect(screen.queryByRole("option", { name: /Ask AI|Sign in/ })).toBeNull();
    expect(screen.queryByText("Try asking")).toBeNull();
  });

  it("shows a grammatical empty state for an unknown course code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).includes("/api/assistant/access")) {
          return new Response(JSON.stringify({ enabled: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ courses: [], instructors: [] }), { status: 200 });
      }),
    );

    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ACCT9999" } });

    expect(await screen.findByText("No matching course.")).toBeTruthy();
    expect(screen.getByText("Maybe the course code is incorrect?")).toBeTruthy();
    expect(screen.getByRole("option", { name: /Ask AI/ })).toBeTruthy();
  });

  it("uses the server access result without an Ask AI flash", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<HomeSearch initialAssistantAccess="denied" />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull();
    expect(screen.queryByText("Try asking")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    cleanup();
    render(<HomeSearch initialAssistantAccess="enabled" />);
    expect(screen.getAllByRole("button", { name: "Ask AI" }).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows Ask AI immediately while the access check is still pending", async () => {
    let resolveAccess: (response: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        if (String(input).includes("/api/assistant/access")) {
          return new Promise<Response>((resolve) => {
            resolveAccess = resolve;
          });
        }
        return Promise.resolve(new Response(JSON.stringify(PAYLOAD), { status: 200 }));
      }),
    );

    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ACCT" } });

    expect(await screen.findByRole("option", { name: /Ask AI/ })).toBeTruthy();

    resolveAccess(new Response(JSON.stringify({ enabled: false }), { status: 200 }));
    await waitFor(() => {
      expect(screen.queryByRole("option", { name: /Ask AI/ })).toBeNull();
      expect(screen.queryByRole("button", { name: "Ask AI" })).toBeNull();
      expect(screen.queryByText("Try asking")).toBeNull();
    });
  });

  it("opens the assistant for Ask AI", async () => {
    render(<HomeSearch />);
    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ACCT" } });

    const ask = await screen.findByRole("option", { name: /Ask AI/ });
    fireEvent.click(ask);
    expect(mocks.openAssistant).toHaveBeenCalledWith({ prompt: "ACCT", autoSend: true });
  });
});
