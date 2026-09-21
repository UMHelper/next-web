import { afterEach, describe, expect, it, vi } from "vitest";
import { searchCatalog } from "@/lib/timetable/catalog-client";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("catalog client", () => {
  it("builds search query parameters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], page: 1, total: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await searchCatalog({
      type: "course",
      q: "ACCT",
      faculty: "FBA",
      department: "ACC",
      page: 2,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("type=course"),
      expect.objectContaining({ credentials: "same-origin" }),
    );
    expect(fetchMock.mock.calls[0][0]).toContain("faculty=FBA");
    expect(fetchMock.mock.calls[0][0]).toContain("page=2");
  });
});
