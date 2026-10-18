import type { ComponentType, ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeStorage } from "@/tests/helpers/fake-storage";

type SidebarProps = {
  open: boolean;
  width: string;
  header: ComponentType;
  toggleButton: ComponentType;
  welcomeScreen?: ComponentType<{ input: ReactNode; suggestionView: ReactNode }>;
  input: { addMenuButton: ComponentType; disclaimer: ComponentType; showDisclaimer: boolean };
};

const { sidebarSpy, providerSpy, suggestionsSpy } = vi.hoisted(() => ({
  sidebarSpy: vi.fn(),
  providerSpy: vi.fn(),
  suggestionsSpy: vi.fn(),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: (props: { children: ReactNode; enableInspector?: boolean }) => {
    providerSpy(props);
    return <>{props.children}</>;
  },
  CopilotSidebar: (props: SidebarProps) => {
    sidebarSpy(props);
    const Header = props.header;
    return (
      <div data-testid="copilot-sidebar" data-open={String(props.open)}>
        <Header />
      </div>
    );
  },
  useAgentContext: () => {},
  useFrontendTool: () => {},
  useConfigureSuggestions: suggestionsSpy,
}));
vi.mock("@/lib/timetable/catalog-client", () => ({ getSections: vi.fn() }));

import AssistantPanel from "@/components/assistant/assistant-panel";

const lastSidebarProps = () => sidebarSpy.mock.lastCall![0] as SidebarProps;

beforeEach(() => {
  installFakeStorage();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AssistantPanel", () => {
  it("hides on the header close button and comes back from the reopen pill", () => {
    render(<AssistantPanel plan={undefined} />);
    const sidebar = screen.getByTestId("copilot-sidebar");
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(screen.getByText("AI 选课助手")).toBeTruthy();
    expect(screen.getByText("试点")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AI 选课助手" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "收起助手" }));
    expect(sidebar.getAttribute("data-open")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "AI 选课助手" }));
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(screen.queryByRole("button", { name: "AI 选课助手" })).toBeNull();
  });

  it("removes CopilotKit's floating toggle, attach button, and dev inspector", () => {
    render(<AssistantPanel plan={undefined} />);
    const { toggleButton: Toggle, input } = lastSidebarProps();
    const AddMenu = input.addMenuButton;
    expect(render(<Toggle />).container.innerHTML).toBe("");
    expect(render(<AddMenu />).container.innerHTML).toBe("");
    expect(providerSpy.mock.lastCall![0].enableInspector).toBe(false);
  });
});
