import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import ShareDialog from "@/components/timetable/share-dialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ShareDialog", () => {
  it("creates a share link", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ shared: false }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: "https://example.com/compare/token" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ShareDialog
        plan={{
          clientRef: "plan-1",
          serverId: 1,
          name: "A",
          year: 2026,
          sem: 1,
          payload: { schemaVersion: 1, sections: [] },
          revision: 1,
          syncState: "idle",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Share/i }));
    await waitFor(() => expect(screen.getByText("Create share link")).toBeTruthy());
    fireEvent.click(screen.getByText("Create share link"));
    await waitFor(() =>
      expect(screen.getByText("https://example.com/compare/token")).toBeTruthy(),
    );
  });
});
