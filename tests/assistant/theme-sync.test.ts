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

  it("never defines a custom property from itself, which the browser treats as invalid", () => {
    const css = readFileSync(themePath, "utf8");
    const selfReferences = [...css.matchAll(/(--[\w-]+):([^;]*);/g)]
      .filter(([, name, value]) => value.includes(`var(${name})`) || value.includes(`var(${name},`))
      .map(([declaration]) => declaration);
    expect(selfReferences).toEqual([]);
  });

  it("reads CopilotKit's color tokens as full colors inside the panel", () => {
    const css = readFileSync(themePath, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const panelRules = css.slice(css.indexOf("}", css.indexOf(":root {")) + 1);
    const tokens = "background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring";
    expect(panelRules).not.toMatch(new RegExp(`hsl\\(var\\(--(${tokens})(-foreground)?\\)`));
  });

  it("gives the user's message bubble a surface distinct from the panel", () => {
    const css = readFileSync(themePath, "utf8");
    expect(css).toMatch(/\[data-testid="copilot-user-message"\][^{]*\{[^}]*background-color: hsl\(var\(--brand\)/);
  });

  it("overrides CopilotKit through cascade layers, not !important", () => {
    expect(readFileSync(themePath, "utf8")).not.toContain("!important");
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

    const darkStart = css.indexOf(".dark [data-copilot-sidebar]");
    const darkSidebarBlock = css.slice(darkStart, css.indexOf("}", darkStart));
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

  const ruleFor = (css: string, selector: string) => {
    const start = css.indexOf(selector);
    expect(start, `missing rule for ${selector}`).toBeGreaterThan(-1);
    return css.slice(start, css.indexOf("}", start));
  };

  it("wraps long links and inline identifiers inside assistant replies", () => {
    const css = readFileSync(themePath, "utf8");
    for (const selector of ['[data-streamdown="link"]', '[data-streamdown="inline-code"]']) {
      expect(ruleFor(css, `[data-copilotkit] ${selector}`)).toContain("overflow-wrap: anywhere");
    }
  });

  it("keeps wide tables scrolling inside their own box with wrapping, compact cells", () => {
    const css = readFileSync(themePath, "utf8");
    expect(ruleFor(css, '[data-copilotkit] [data-streamdown="table-wrapper"] > div')).toContain("overflow-x: auto");
    const cells = ruleFor(css, '[data-copilotkit] [data-streamdown="table-header-cell"]');
    expect(cells).toContain("white-space: normal");
    expect(cells).toContain("padding:");
  });

  it("keeps headings in replies close to body size", () => {
    const css = readFileSync(themePath, "utf8");
    expect(ruleFor(css, "[data-copilotkit] .copilotKitAssistantMessage :is(h1, h2, h3, h4)")).toContain("font-size: 1em");
  });

  it("stops chat scrolling from scrolling the page behind the sidebar", () => {
    const css = readFileSync(themePath, "utf8");
    expect(ruleFor(css, "div[data-sidebar-chat] .cpk\\:overflow-y-auto")).toContain("overscroll-behavior: contain");
  });

  it("widens the sidebar input and keeps example chips flush with the intro", () => {
    const css = readFileSync(themePath, "utf8");
    expect(css).toMatch(
      /div\[data-sidebar-chat\] \.cpk\\:\\\[div\\\[data-sidebar-chat\\\]_\\&\\\]\\:px-8 \{\s*padding-inline: 0\.75rem;/,
    );
    expect(css).toMatch(
      /div\[data-sidebar-chat\] \[data-testid="copilot-suggestions"\] \{\s*margin-inline: 0;\s*padding-inline: 0;/,
    );
  });
});
