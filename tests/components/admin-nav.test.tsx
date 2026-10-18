import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ href, children, ...props }: Record<string, unknown>) =>
      ReactModule.createElement("a", { href, ...props }, children as React.ReactNode),
  };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/update" }));

import AdminNav from "@/components/admin/admin-nav";

afterEach(cleanup);

describe("AdminNav", () => {
  it("shows the Update entry for platform admins", () => {
    const view = render(<AdminNav isPlatformAdmin />);
    const link = view.getByText("Update");
    expect(link.getAttribute("href")).toBe("/admin/update");
  });

  it("shows the AI Assistant tab last for platform admins", () => {
    const view = render(<AdminNav isPlatformAdmin />);
    const links = view.getAllByRole("link");
    const last = links[links.length - 1];
    expect(last.textContent).toBe("AI Assistant");
    expect(last.getAttribute("href")).toBe("/admin/assistant");
  });

  it("hides the AI Assistant tab from other admins", () => {
    const view = render(<AdminNav isPlatformAdmin={false} />);
    expect(view.queryByText("AI Assistant")).toBeNull();
  });
});
