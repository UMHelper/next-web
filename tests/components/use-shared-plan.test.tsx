import React from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useSharedPlan } from "@/lib/timetable/use-shared-plan";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useSharedPlan", () => {
  it("loads a shared plan", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          plan: {
            name: "A",
            year: 2026,
            sem: 1,
            revision: 3,
            updatedAt: "2026-09-21T00:00:00.000Z",
            payload: { schemaVersion: 1, sections: [] },
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useSharedPlan("a".repeat(43)));

    await waitFor(() => expect(result.current.plan?.name).toBe("A"));
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/timetable/shares/"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });
});
