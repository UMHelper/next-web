import { useEffect, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeStorage } from "@/tests/helpers/fake-storage";

const { useAuthMock, usePathnameMock, providerLife } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/"),
  providerLife: { mounts: 0, live: 0 },
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: useAuthMock }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
vi.mock("next/dynamic", async () => {
  const panel = await import("@/components/assistant/assistant-panel");
  return { default: () => panel.default };
});
vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: ({ children }: { children: ReactNode }) => {
    useEffect(() => {
      providerLife.mounts += 1;
      providerLife.live += 1;
      return () => {
        providerLife.live -= 1;
      };
    }, []);
    return <>{children}</>;
  },
  CopilotSidebar: (props: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    header: { closeButton: Record<string, string> };
  }) => (
    <div data-testid="copilot-sidebar" data-open={String(props.open)}>
      <button type="button" {...props.header.closeButton} onClick={() => props.onOpenChange(false)} />
    </div>
  ),
  useAgentContext: () => {},
  useFrontendTool: () => {},
  useConfigureSuggestions: () => {},
}));
vi.mock("@/lib/timetable/catalog-client", () => ({ getSections: vi.fn() }));
vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: () => ({ activePlan: undefined }),
}));

import AssistantLauncher from "@/components/assistant/assistant-launcher";
import DesktopAssistantGate from "@/components/assistant/desktop-assistant-gate";

const BUTTON = { name: "AI 選課助手" };

// Evaluates min-width queries against a mutable width, the way a browser would.
const viewport = { width: 1280, listeners: new Set<() => void>() };

function installViewport(width: number) {
  viewport.width = width;
  viewport.listeners.clear();
  window.matchMedia = vi.fn((query: string) => {
    const minWidth = /^\(min-width: (\d+)px\)$/.exec(query);
    if (!minWidth) throw new Error(`unexpected media query: ${query}`);
    return {
      media: query,
      get matches() {
        return viewport.width >= Number(minWidth[1]);
      },
      addEventListener: (_type: string, listener: () => void) => viewport.listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => viewport.listeners.delete(listener),
    };
  }) as unknown as typeof window.matchMedia;
}

function resizeTo(width: number) {
  act(() => {
    viewport.width = width;
    viewport.listeners.forEach((listener) => listener());
  });
}

type FakeResponse = { ok: boolean; json: () => Promise<unknown> };
const enabledResponse = (): FakeResponse => ({ ok: true, json: async () => ({ enabled: true }) });

function stubFetch() {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => enabledResponse());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderAssistant() {
  return render(
    <DesktopAssistantGate>
      <AssistantLauncher />
    </DesktopAssistantGate>,
  );
}

async function openPanel() {
  fireEvent.click(await screen.findByRole("button", BUTTON));
  expect(screen.getByTestId("copilot-sidebar").getAttribute("data-open")).toBe("true");
}

beforeEach(() => {
  installFakeStorage();
  installViewport(1280);
  useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true, userId: "user_a" });
  providerLife.mounts = 0;
  providerLife.live = 0;
});

afterEach(() => {
  cleanup();
  usePathnameMock.mockReturnValue("/");
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.documentElement.style.removeProperty("--assistant-width");
  document.documentElement.removeAttribute("data-assistant-open");
});

describe("DesktopAssistantGate", () => {
  it.each([320, 375, 430, 768, 1023])(
    "mounts nothing and asks for no access at %ipx",
    async (width) => {
      installViewport(width);
      const fetchMock = stubFetch();
      const { container } = renderAssistant();
      await act(async () => {});

      expect(container.innerHTML).toBe("");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(providerLife.mounts).toBe(0);
    },
  );

  it.each([1024, 1280, 1440])("offers the launcher at %ipx", async (width) => {
    installViewport(width);
    const fetchMock = stubFetch();
    renderAssistant();

    expect(await screen.findByRole("button", BUTTON)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(providerLife.mounts).toBe(0);
  });

  it("renders nothing on the server and hydrates on desktop without a mismatch", async () => {
    const tree = (
      <DesktopAssistantGate>
        <p data-testid="desktop-only">assistant</p>
      </DesktopAssistantGate>
    );
    const html = renderToString(tree);
    expect(html).toBe("");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const recoverable = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = await act(async () => hydrateRoot(container, tree, { onRecoverableError: recoverable }));

    expect(container.querySelector("[data-testid='desktop-only']")).not.toBeNull();
    expect(recoverable).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    act(() => root.unmount());
    container.remove();
    consoleError.mockRestore();
  });

  it("unmounts the open assistant below 1024px and clears its page layout", async () => {
    stubFetch();
    const { container } = renderAssistant();
    await openPanel();
    const root = document.documentElement;
    expect(root.hasAttribute("data-assistant-open")).toBe(true);
    expect(root.style.getPropertyValue("--assistant-width")).not.toBe("");
    expect(providerLife.live).toBe(1);

    resizeTo(1023);

    expect(container.innerHTML).toBe("");
    expect(root.hasAttribute("data-assistant-open")).toBe(false);
    expect(root.style.getPropertyValue("--assistant-width")).toBe("");
    expect(providerLife.live).toBe(0);
  });

  it("drops an access check still in flight when the viewport shrinks", async () => {
    let resolveAccess!: (response: FakeResponse) => void;
    const fetchMock = vi.fn(
      (_url: string, _init?: RequestInit) =>
        new Promise<FakeResponse>((resolve) => {
          resolveAccess = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderAssistant();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0][1]!.signal!;

    resizeTo(800);
    expect(signal.aborted).toBe(true);
    await act(async () => resolveAccess(enabledResponse()));

    expect(container.innerHTML).toBe("");
  });

  it("checks access on entering desktop and starts a fresh, closed assistant", async () => {
    installViewport(375);
    const fetchMock = stubFetch();
    renderAssistant();
    await act(async () => {});
    expect(fetchMock).not.toHaveBeenCalled();

    resizeTo(1280);
    await openPanel();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(providerLife.mounts).toBe(1);

    resizeTo(375);
    resizeTo(1280);

    expect(await screen.findByRole("button", BUTTON)).toBeTruthy();
    expect(screen.queryByTestId("copilot-sidebar")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(providerLife.live).toBe(0);
  });

  it("keeps one listener, one launcher and one provider through repeated resizing", async () => {
    const fetchMock = stubFetch();
    const { unmount } = renderAssistant();
    await openPanel();

    for (let i = 0; i < 5; i += 1) {
      resizeTo(1023);
      expect(providerLife.live).toBe(0);
      resizeTo(1440);
      expect(await screen.findAllByRole("button", BUTTON)).toHaveLength(1);
      expect(viewport.listeners.size).toBe(1);
    }
    expect(fetchMock).toHaveBeenCalledTimes(6);

    fireEvent.click(screen.getByRole("button", BUTTON));
    resizeTo(1100);
    resizeTo(1920);
    resizeTo(1024);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(providerLife.live).toBe(1);
    expect(screen.getAllByTestId("copilot-sidebar")).toHaveLength(1);

    unmount();
    expect(viewport.listeners.size).toBe(0);
    expect(providerLife.live).toBe(0);
  });

  it("keeps the same conversation through close, reopen and navigation on desktop", async () => {
    stubFetch();
    const { rerender } = renderAssistant();
    await openPanel();

    fireEvent.click(screen.getByRole("button", { name: "收起助手" }));
    fireEvent.click(screen.getByRole("button", BUTTON));
    usePathnameMock.mockReturnValue("/course/COMP1000");
    rerender(
      <DesktopAssistantGate>
        <AssistantLauncher />
      </DesktopAssistantGate>,
    );

    expect(screen.getByTestId("copilot-sidebar").getAttribute("data-open")).toBe("true");
    expect(providerLife.mounts).toBe(1);
    expect(providerLife.live).toBe(1);
  });

  it("drops the assistant on sign-out while on desktop", async () => {
    stubFetch();
    const { container, rerender } = renderAssistant();
    await openPanel();

    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false, userId: null });
    rerender(
      <DesktopAssistantGate>
        <AssistantLauncher />
      </DesktopAssistantGate>,
    );

    expect(container.innerHTML).toBe("");
    expect(providerLife.live).toBe(0);
  });
});
