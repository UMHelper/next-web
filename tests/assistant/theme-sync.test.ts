import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const themePath = join(root, "public/assistant/copilotkit-theme.css");
const panelPath = join(root, "components/assistant/assistant-panel.tsx");

describe("assistant theme sync", () => {
  it("ships a non-empty theme stylesheet", () => {
    expect(existsSync(themePath)).toBe(true);
    const css = readFileSync(themePath, "utf8");
    expect(css.trim().length).toBeGreaterThan(200);
  });

  it("maps CopilotKit surfaces to site semantic tokens", () => {
    const css = readFileSync(themePath, "utf8");
    for (const token of ["--background", "--foreground", "--primary", "--border", "--card"]) {
      expect(css).toContain(token);
    }
    expect(css).toMatch(/\[data-copilotkit\]/);
    expect(css).toMatch(/\.dark\s+\[data-copilotkit\]/);
    expect(css).toMatch(/html\[data-skin="island"\]\s+\[data-copilotkit\]/);
  });

  it("styles chat input, send button, and user message bubble", () => {
    const css = readFileSync(themePath, "utf8");
    expect(css).toContain('[data-testid="copilot-chat-input"]');
    expect(css).toContain('[data-testid="copilot-send-button"]');
    expect(css).toContain('[data-testid="copilot-user-message"]');
  });

  it("elevates the sidebar with surface-subtle, border, and layered shadow", () => {
    const css = readFileSync(themePath, "utf8");
    const sidebarBlock = css.slice(
      css.indexOf("[data-copilot-sidebar]"),
      css.indexOf(".dark [data-copilot-sidebar]"),
    );
    expect(sidebarBlock).toContain("--surface-subtle");
    expect(sidebarBlock).toContain("border-left");
    expect(sidebarBlock).toContain("--border-strong");
    expect(sidebarBlock).toContain("box-shadow");

    const darkSidebarBlock = css.slice(
      css.indexOf(".dark [data-copilot-sidebar]"),
      css.indexOf("[data-copilotkit] .copilotKitHeader"),
    );
    expect(darkSidebarBlock).toContain("--surface-subtle");
    expect(darkSidebarBlock).toContain("box-shadow");
  });

  it("loads the theme sheet from the assistant panel after CopilotKit base CSS", () => {
    const panel = readFileSync(panelPath, "utf8");
    expect(panel).toContain('const COPILOTKIT_THEME_HREF = "/assistant/copilotkit-theme.css"');
    expect(panel).toContain("href={COPILOTKIT_THEME_HREF}");
    const baseIdx = panel.indexOf("href={COPILOTKIT_STYLES_HREF}");
    const themeIdx = panel.indexOf("href={COPILOTKIT_THEME_HREF}");
    expect(baseIdx).toBeGreaterThan(-1);
    expect(themeIdx).toBeGreaterThan(baseIdx);
  });
});
