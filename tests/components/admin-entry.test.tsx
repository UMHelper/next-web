import React from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("@clerk/nextjs", () => ({ useAuth }));
vi.mock("next/link", async () => {
  const ReactModule = await import("react");
  return {
    default: ({ href, children, ...props }: Record<string, unknown>) =>
      ReactModule.createElement("a", { href, ...props }, children as React.ReactNode),
  };
});

import AdminEntry from "@/components/admin-entry";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AdminEntry", () => {
  it("does not render or query for anonymous users", () => {
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(React.createElement(AdminEntry));

    expect(view.queryByLabelText("Admin console")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the admin link when the API confirms admin access", async () => {
    useAuth.mockReturnValue({ isLoaded: true, isSignedIn: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ isAdmin: true }),
      }),
    );

    const view = render(React.createElement(AdminEntry));

    await waitFor(() => {
      expect(view.getByLabelText("Admin console")).toBeTruthy();
    });
  });
});
