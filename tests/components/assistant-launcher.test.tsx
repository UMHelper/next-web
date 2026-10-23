import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, usePathnameMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/"),
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockPanel({ suppressed }: { suppressed: boolean }) {
      return <div data-testid="assistant-panel" data-suppressed={String(suppressed)} />;
    },
}));

import AssistantLauncher, { isAssistantSuppressed } from "@/components/assistant/assistant-launcher";

type FakeResponse = { ok: boolean; json: () => Promise<unknown> };

const respond = (ok: boolean, body: unknown): FakeResponse => ({ ok, json: async () => body });

function stubFetch(result: FakeResponse | Error) {
  const fetchMock = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  usePathnameMock.mockReturnValue("/");
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AssistantLauncher", () => {
  it("renders nothing and makes no request while Clerk is loading", () => {
    useAuthMock.mockReturnValue({ isLoaded: false, isSignedIn: false });
    const fetchMock = stubFetch(respond(true, { enabled: true }));
    const { container } = render(<AssistantLauncher />);
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing and makes no request for signed-out visitors", () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const fetchMock = stubFetch(respond(true, { enabled: true }));
    const { container } = render(<AssistantLauncher />);
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the access endpoint once and shows the button when enabled", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    const fetchMock = stubFetch(respond(true, { enabled: true }));
    render(<AssistantLauncher />);

    expect(await screen.findByRole("button", { name: "AI Course Helper" })).toBeTruthy();
    expect(screen.getByText("AI Course Helper")).toBeTruthy();
    expect(screen.getByText("AI 選課助手")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant/access", expect.objectContaining({ cache: "no-store" }));
  });

  it.each([
    ["disabled", respond(true, { enabled: false })],
    ["a non-200 response", respond(false, { error: { code: "forbidden" } })],
    ["a malformed body", respond(true, { enabled: "yes" })],
    ["a network error", new Error("offline")],
  ])("renders nothing for %s", async (_label, result) => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    const fetchMock = stubFetch(result);
    const { container } = render(<AssistantLauncher />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });

  it("does not render the button when access resolves after unmount or sign-out", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    let resolveSignOut!: (value: FakeResponse) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<FakeResponse>((resolve) => {
            resolveSignOut = resolve;
          }),
      ),
    );

    const { rerender } = render(<AssistantLauncher />);
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    rerender(<AssistantLauncher />);

    await act(async () => {
      resolveSignOut(respond(true, { enabled: true }));
    });
    expect(screen.queryByRole("button", { name: "AI Course Helper" })).toBeNull();

    cleanup();

    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    let resolveUnmount!: (value: FakeResponse) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<FakeResponse>((resolve) => {
            resolveUnmount = resolve;
          }),
      ),
    );
    const { unmount } = render(<AssistantLauncher />);
    unmount();
    await act(async () => {
      resolveUnmount(respond(true, { enabled: true }));
    });
  });

  it("loads the panel only after the user opens it", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    stubFetch(respond(true, { enabled: true }));
    render(<AssistantLauncher />);

    const button = await screen.findByRole("button", { name: "AI Course Helper" });
    expect(screen.queryByTestId("assistant-panel")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByTestId("assistant-panel")).toBeTruthy();
  });

  it.each(["/admin", "/admin/assistant", "/oauth-consent", "/sign-in", "/sign-up/verify"])(
    "shows no button on %s",
    async (path) => {
      usePathnameMock.mockReturnValue(path);
      useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
      const fetchMock = stubFetch(respond(true, { enabled: true }));
      const { container } = render(<AssistantLauncher />);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await act(async () => {});
      expect(container.innerHTML).toBe("");
    },
  );

  it("keeps an opened panel mounted but suppressed on excluded routes", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    stubFetch(respond(true, { enabled: true }));
    const { rerender } = render(<AssistantLauncher />);
    fireEvent.click(await screen.findByRole("button", { name: "AI Course Helper" }));
    expect(screen.getByTestId("assistant-panel").getAttribute("data-suppressed")).toBe("false");

    usePathnameMock.mockReturnValue("/admin/assistant");
    rerender(<AssistantLauncher />);
    expect(screen.getByTestId("assistant-panel").getAttribute("data-suppressed")).toBe("true");

    usePathnameMock.mockReturnValue("/course/COMP1000");
    rerender(<AssistantLauncher />);
    expect(screen.getByTestId("assistant-panel").getAttribute("data-suppressed")).toBe("false");
  });

  it("drops the opened panel on sign-out and starts closed after signing back in", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    stubFetch(respond(true, { enabled: true }));
    const { rerender } = render(<AssistantLauncher />);
    fireEvent.click(await screen.findByRole("button", { name: "AI Course Helper" }));
    expect(screen.getByTestId("assistant-panel")).toBeTruthy();

    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false, userId: null });
    rerender(<AssistantLauncher />);
    expect(screen.queryByTestId("assistant-panel")).toBeNull();

    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    rerender(<AssistantLauncher />);
    expect(await screen.findByRole("button", { name: "AI Course Helper" })).toBeTruthy();
    expect(screen.queryByTestId("assistant-panel")).toBeNull();
  });

  it("re-checks access and drops the panel when the signed-in user changes", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
    let resolveUserBAccess!: (value: FakeResponse) => void;
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return respond(true, { enabled: true });
      }
      return new Promise<FakeResponse>((resolve) => {
        resolveUserBAccess = resolve;
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<AssistantLauncher />);
    fireEvent.click(await screen.findByRole("button", { name: "AI Course Helper" }));

    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_b" });
    rerender(<AssistantLauncher />);
    expect(screen.queryByTestId("assistant-panel")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolveUserBAccess(respond(true, { enabled: true }));
    });
    expect(await screen.findByRole("button", { name: "AI Course Helper" })).toBeTruthy();
    expect(screen.queryByTestId("assistant-panel")).toBeNull();
  });
});

describe("isAssistantSuppressed", () => {
  it.each([
    ["/admin", true],
    ["/admin/assistant", true],
    ["/oauth-consent/abc", true],
    ["/sign-in", true],
    ["/sign-up", true],
    ["/administrator", false],
    ["/", false],
    ["/course/COMP1000", false],
    ["/timetable", false],
  ])("%s → %s", (path, expected) => {
    expect(isAssistantSuppressed(path)).toBe(expected);
  });
});
