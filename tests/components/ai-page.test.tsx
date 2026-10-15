import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Page from "@/app/ai/page";

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/ai-onboarding");
  vi.resetModules();
});

const renderPage = async (lang?: string) => {
  const element = await Page({ searchParams: Promise.resolve(lang ? { lang } : {}) });
  return render(element);
};

describe("/ai onboarding page", () => {
  it("renders the English onboarding by default", async () => {
    const view = await renderPage();

    expect(view.container.textContent).toContain("Choose your tool");
    expect(view.container.textContent).toContain("https://umeh.top/mcp");
  });

  it("serves a Traditional Chinese version at ?lang=zh", async () => {
    const view = await renderPage("zh");

    expect(view.container.textContent).toContain("選擇你的工具");
    expect(view.container.textContent).toContain("https://umeh.top/mcp");
  });

  it("shows the paid-plan precondition for ChatGPT", async () => {
    const view = await renderPage();

    // The whole point of the page's layout is that nobody walks the ChatGPT path
    // before learning it needs a paid plan.
    expect(view.container.textContent).toContain("Needs a paid ChatGPT plan");
    expect(view.container.textContent).toContain("Free or Go");
  });

  it("promises the read-only scope and the data boundary", async () => {
    const view = await renderPage();
    const text = view.container.textContent ?? "";

    expect(text).toContain("umhelper:read");
    expect(text).toContain("not an official University of Macau statement");
  });

  it("hides the registry pointer until the entry is published", async () => {
    const view = await renderPage();

    expect(view.container.querySelector('a[href*="install.apicommons.org"]')).toBeNull();
  });

  it("shows the registry pointer once MCP_REGISTRY_PUBLISHED flips", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ai-onboarding", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/ai-onboarding")>()),
      MCP_REGISTRY_PUBLISHED: true,
    }));

    const { default: PublishedPage } = await import("@/app/ai/page");
    const element = await PublishedPage({ searchParams: Promise.resolve({}) });
    const view = render(element);

    const pointer = view.container.querySelector('a[href*="install.apicommons.org"]');
    expect(pointer).not.toBeNull();
    expect(pointer?.getAttribute("href")).toContain("io.github.UMHelper");
  });
});
