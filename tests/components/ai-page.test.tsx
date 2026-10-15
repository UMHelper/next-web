import { readFileSync } from "node:fs";
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Page from "@/app/ai/page";
import { SITE_SHORT_NAME } from "@/lib/site";

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/ai-onboarding");
  vi.resetModules();
});

const renderPage = async (params: { app?: string } = {}) => {
  const element = await Page({ searchParams: Promise.resolve(params) });
  return render(element);
};

const panel = (view: ReturnType<typeof render>, id: string) =>
  view.container.querySelector(`#ai-panel-${id}`) as HTMLElement | null;

const clientButton = (view: ReturnType<typeof render>, id: string) =>
  view.container.querySelector(`#ai-tab-${id}`) as HTMLElement;

describe("/ai onboarding page", () => {
  it("leads with the icon grid and nothing else", async () => {
    const view = await renderPage();

    // "Pick your app" is only an accessible label now — the icons carry the page.
    expect(view.container.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe(
      "Pick your app",
    );
    expect(view.container.textContent).not.toContain("Pick your app");
    // No descriptive line under the title either: it was removed on request.
    expect(view.container.textContent).not.toContain("Read-only University of Macau");
    expect(view.container.querySelectorAll('[id^="ai-panel-"]')).toHaveLength(6);
    for (const id of ["vscode", "cursor", "openai", "claude", "generic", "askai"]) {
      expect(panel(view, id)?.hasAttribute("hidden")).toBe(true);
    }
  });

  it("has no language switch and no Chinese copy", async () => {
    const view = await renderPage();
    const text = view.container.textContent ?? "";

    expect(view.container.querySelector('a[href*="lang=zh"]')).toBeNull();
    expect(text).not.toContain("閱讀中文版本");
  });

  it("reveals a client after clicking its icon, and hides the previous one", async () => {
    const view = await renderPage();

    fireEvent.click(clientButton(view, "cursor"));
    expect(panel(view, "cursor")?.hasAttribute("hidden")).toBe(false);
    expect(panel(view, "vscode")?.hasAttribute("hidden")).toBe(true);

    fireEvent.click(clientButton(view, "vscode"));
    expect(panel(view, "vscode")?.hasAttribute("hidden")).toBe(false);
    expect(panel(view, "cursor")?.hasAttribute("hidden")).toBe(true);
  });

  it("collapses back to the icon grid when the active icon is clicked again", async () => {
    const view = await renderPage();

    fireEvent.click(clientButton(view, "cursor"));
    expect(panel(view, "cursor")?.hasAttribute("hidden")).toBe(false);

    fireEvent.click(clientButton(view, "cursor"));

    // The panel deliberately stays mounted while the container collapses — hiding it
    // immediately is what made the text flash out before the space closed. So assert
    // the collapsed state instead of `hidden`.
    expect(clientButton(view, "cursor").getAttribute("aria-selected")).toBe("false");
    expect(panel(view, "cursor")?.getAttribute("aria-hidden")).toBe("true");
    expect(panel(view, "cursor")?.hasAttribute("hidden")).toBe(false);

    const container = view.container.querySelector('[role="tablist"]')?.nextElementSibling;
    expect(container?.getAttribute("style")).toContain("grid-template-rows: 0fr");
  });

  it("keeps the tile row fluid so it fills a narrow viewport", async () => {
    const view = await renderPage();

    // Two-up grid on phones, five-up on desktop; fixed widths left a ragged column.
    const tablist = view.container.querySelector('[role="tablist"]');
    expect(tablist?.className).toContain("grid-cols-2");
    expect(tablist?.className).toContain("lg:grid-cols-6");
    expect(clientButton(view, "vscode").className).toContain("w-full");

    // Compact chips must still be a comfortable tap target. Note `min-h-11` is not a
    // real Tailwind 3 utility — it silently did nothing, so the arbitrary value is
    // deliberate and pinned here.
    fireEvent.click(clientButton(view, "vscode"));
    expect(clientButton(view, "vscode").className).toContain("min-h-[44px]");
  });

  it("opens directly on the client named by ?app=", async () => {
    const view = await renderPage({ app: "openai" });

    expect(panel(view, "openai")?.hasAttribute("hidden")).toBe(false);
    expect(panel(view, "vscode")?.hasAttribute("hidden")).toBe(true);
  });

  it("ignores an unknown ?app= value", async () => {
    const view = await renderPage({ app: "not-a-client" });

    for (const id of ["vscode", "cursor", "openai", "claude", "generic", "askai"]) {
      expect(panel(view, id)?.hasAttribute("hidden")).toBe(true);
    }
  });

  it("shows the paid-plan precondition for the OpenAI paths", async () => {
    const view = await renderPage({ app: "openai" });

    // Nobody should walk the ChatGPT/Codex path before learning it needs a paid plan.
    expect(view.container.textContent).toContain("Needs ChatGPT Plus or above");
    expect(view.container.textContent).toContain("Free and Go");
  });

  it("has no support link and no disclosure prose", async () => {
    const view = await renderPage();
    const text = view.container.textContent ?? "";

    expect(view.container.querySelector('a[href="/support"]')).toBeNull();
    expect(text).not.toContain("Nothing is ever written on your behalf");
    expect(text).not.toContain("not an official University of Macau statement");
    expect(text).not.toContain("Good to know");
  });

  it("keeps every client's method text in the HTML even while hidden", async () => {
    const view = await renderPage();
    const text = view.container.textContent ?? "";

    // Hidden panels must still carry their steps: the page is a distribution target,
    // so search engines (and "select all") should see the whole set.
    expect(text).toContain("MCP: Add Server");
    expect(text).toContain("claude mcp add --transport http");
    expect(text).toContain("codex plugin add");
  });

  it("animates the reveal instead of jumping", async () => {
    const source = readFileSync("components/ai-client-picker.tsx", "utf8");

    // The height must transition (0fr↔1fr), not flip instantly via `hidden` alone:
    // a 200px+ jump was the original "text animation is not continuous" complaint.
    expect(source).toContain("transition-[grid-template-rows");
    expect(source).toContain("gridTemplateRows: compact ? '1fr' : '0fr'");
    // Panel content enters in stages; delayed blocks need fill-mode-both or they
    // flash in before their delay elapses.
    expect(source).toContain("animate-in fade-in slide-in-from-bottom-2");
    expect(source).toContain("fill-mode-both");
    expect(source).toContain("motion-reduce:");
  });

  it("offers the paste-into-your-agent prompt as the sixth client", async () => {
    const view = await renderPage({ app: "askai" });

    // Same panel structure as every other client: heading, requirement, steps, snippet.
    expect(panel(view, "askai")?.hasAttribute("hidden")).toBe(false);
    expect(view.container.textContent).toContain("Ask your AI to install it");

    const block = view.container.querySelector("#ai-panel-askai pre code");
    expect(block?.textContent).toContain("Add the What2REG@UM MCP server");
    expect(block?.textContent).toContain("get_course");
    expect(block?.textContent).toContain("https://umeh.top/mcp");
  });

  it("paints brand elements with the site gradient", async () => {
    const view = await renderPage({ app: "openai" });

    // The gradient wraps ONLY the product name — the same usage as the navbar brand
    // lockup. The surrounding words must stay plain, and no sentence gets gradient text.
    const heading = view.container.querySelector("h1");
    const brand = heading?.querySelector("span");
    expect(brand?.textContent).toBe(SITE_SHORT_NAME);
    expect(brand?.className).toContain("from-wordmark-from");
    expect(brand?.className).toContain("bg-clip-text");
    expect(brand?.className).toContain("text-transparent");
    expect(heading?.className).not.toContain("from-wordmark-from");

    // Preconditions are deliberately plain: gradient sentences hurt readability.
    const requirement = view.container.querySelector("#ai-panel-openai p");
    expect(requirement?.textContent).toContain("Needs ChatGPT Plus");
    expect(requirement?.className).not.toContain("from-wordmark-from");

    // The deep-link CTA is a brand surface: brand gradient + white text.
    const cta = view.container.querySelector('#ai-panel-vscode a[href^="vscode:mcp/install"]');
    expect(cta?.className).toContain("from-brand-from");
    expect(cta?.className).toContain("to-brand-to");
    expect(cta?.className).toContain("text-white");
  });

  it("shows the registry pointer now that the entry is live", async () => {
    const view = await renderPage();

    const pointer = view.container.querySelector('a[href*="install.apicommons.org"]');
    expect(pointer).not.toBeNull();
    expect(pointer?.getAttribute("href")).toContain("io.github.UMHelper");
  });

  it("would hide the registry pointer again if the flag went back to false", async () => {
    // The flag is not decoration: it is what keeps an unpublished name from leaking
    // a 404 link. Prove the gate still works in the other direction.
    vi.resetModules();
    vi.doMock("@/lib/ai-onboarding", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/ai-onboarding")>()),
      MCP_REGISTRY_PUBLISHED: false,
    }));

    const { default: UnpublishedPage } = await import("@/app/ai/page");
    const element = await UnpublishedPage({ searchParams: Promise.resolve({}) });
    const view = render(element);

    expect(view.container.querySelector('a[href*="install.apicommons.org"]')).toBeNull();
  });

});
