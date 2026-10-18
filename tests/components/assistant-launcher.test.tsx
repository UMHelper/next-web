import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({ useAuth: useAuthMock }));
vi.mock("next/dynamic", () => ({
  default: () =>
    function MockPanel() {
      return <div data-testid="assistant-panel" />;
    },
}));

import AssistantLauncher from "@/components/assistant/assistant-launcher";

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
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AssistantLauncher", () => {
  it("renders nothing and makes no request while Clerk is loading", () => {
    useAuthMock.mockReturnValue({ isLoaded: false, isSignedIn: false });
    const fetchMock = stubFetch(respond(true, { enabled: true }));
    const { container } = render(<AssistantLauncher plan={undefined} />);
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders nothing and makes no request for signed-out visitors", () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const fetchMock = stubFetch(respond(true, { enabled: true }));
    const { container } = render(<AssistantLauncher plan={undefined} />);
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks the access endpoint once and shows the button when enabled", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    const fetchMock = stubFetch(respond(true, { enabled: true }));
    render(<AssistantLauncher plan={undefined} />);

    expect(await screen.findByRole("button", { name: "AI 选课助手" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant/access", expect.objectContaining({ cache: "no-store" }));
  });

  it.each([
    ["disabled", respond(true, { enabled: false })],
    ["a non-200 response", respond(false, { error: { code: "forbidden" } })],
    ["a malformed body", respond(true, { enabled: "yes" })],
    ["a network error", new Error("offline")],
  ])("renders nothing for %s", async (_label, result) => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    const fetchMock = stubFetch(result);
    const { container } = render(<AssistantLauncher plan={undefined} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(container.innerHTML).toBe("");
  });

  it("loads the panel only after the user opens it", async () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    stubFetch(respond(true, { enabled: true }));
    render(<AssistantLauncher plan={undefined} />);

    const button = await screen.findByRole("button", { name: "AI 选课助手" });
    expect(screen.queryByTestId("assistant-panel")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByTestId("assistant-panel")).toBeTruthy();
  });
});
