import type { ComponentType, ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeStorage } from "@/tests/helpers/fake-storage";

type SidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: string;
  labels: { modalHeaderTitle: string; chatInputPlaceholder: string };
  header: { titleContent: ComponentType<{ children: ReactNode }>; closeButton: Record<string, string> };
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
    const Title = props.header.titleContent;
    return (
      <div data-testid="copilot-sidebar" data-open={String(props.open)}>
        <Title>{props.labels.modalHeaderTitle}</Title>
        <button type="button" {...props.header.closeButton} onClick={() => props.onOpenChange(false)} />
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
  document.documentElement.style.removeProperty("--assistant-width");
});

describe("AssistantPanel", () => {
  it("hides on the header close button and comes back from the reopen pill", () => {
    render(<AssistantPanel plan={undefined} />);
    const sidebar = screen.getByTestId("copilot-sidebar");
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(screen.getByText("AI 選課助手")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("AI Course Helper")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AI 選課助手" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "收起助手" }));
    expect(sidebar.getAttribute("data-open")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "AI 選課助手" }));
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(screen.queryByRole("button", { name: "AI 選課助手" })).toBeNull();
  });

  it("uses CopilotKit's header and input with Chinese labels", () => {
    render(<AssistantPanel plan={undefined} />);
    expect(lastSidebarProps().labels).toMatchObject({
      modalHeaderTitle: "AI 選課助手",
      chatInputPlaceholder: "輸入你的問題…",
    });
  });

  it("removes CopilotKit's floating toggle, attach button, and dev inspector", () => {
    render(<AssistantPanel plan={undefined} />);
    const { toggleButton: Toggle, input } = lastSidebarProps();
    const AddMenu = input.addMenuButton;
    expect(render(<Toggle />).container.innerHTML).toBe("");
    expect(render(<AddMenu />).container.innerHTML).toBe("");
    expect(providerSpy.mock.lastCall![0].enableInspector).toBe(false);
  });

  it("offers the three example questions before the first message", () => {
    render(<AssistantPanel plan={undefined} />);
    const questions = [
      "有哪些和 accounting 相關的課？",
      "ACCT1000 是什麼課？幾個學分？",
      "ACCT1000 有哪些 section？什麼時間上課？",
    ];
    expect(suggestionsSpy).toHaveBeenCalledWith({
      available: "before-first-message",
      suggestions: questions.map((question) => ({ title: question, message: question })),
    });
  });

  it("sizes the sidebar from the resizable width variable", () => {
    render(<AssistantPanel plan={undefined} />);
    expect(lastSidebarProps().width).toBe("var(--assistant-width, 380px)");
    expect(document.documentElement.style.getPropertyValue("--assistant-width")).toBe("380px");
    expect(screen.getByRole("separator", { name: "調整助手寬度" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "收起助手" }));
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("shows the intro and example chips above the input on the welcome screen", () => {
    render(<AssistantPanel plan={undefined} />);
    const Welcome = lastSidebarProps().welcomeScreen!;
    render(
      <Welcome
        input={<div data-testid="input" />}
        suggestionView={<div data-testid="chips" />}
      />,
    );
    expect(screen.getByText(/可以問課程、教授、評價和 section 時間/)).toBeTruthy();
    expect(screen.getByText("只讀，不會改動課表 · 單次對話最多 30 輪")).toBeTruthy();
    expect(screen.getByTestId("chips")).toBeTruthy();
    expect(screen.getByTestId("input")).toBeTruthy();
  });

  it("renders the disclaimer as one compact line with both official links", () => {
    render(<AssistantPanel plan={undefined} />);
    const Disclaimer = lastSidebarProps().input.disclaimer;
    const { container } = render(<Disclaimer />);
    expect(container.textContent).toMatch(/^本站不是 myUM · Pre-Enrolment · Add\/Drop · 數據更新於 /);
    expect(container.textContent).toContain("Not myUM · Pre-Enrolment · Add/Drop · Updated ");
    expect(screen.getByRole("link", { name: "Pre-Enrolment" }).getAttribute("href")).toContain(
      "pre-enrolment",
    );
    expect(screen.getByRole("link", { name: "Add/Drop" }).getAttribute("href")).toContain(
      "course-add-drop",
    );
  });
});
