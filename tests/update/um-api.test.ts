import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUmFetcher } from "@/lib/update/um-api";

describe("createUmFetcher", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ _embedded: [{ offeringUnit: "FBA", courseTitle: "ACCOUNTING", credits: 3 }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  it("dedupes by course code", async () => {
    const fetchCourse = createUmFetcher();
    const first = await fetchCourse("ACCT1000");
    const second = await fetchCourse("ACCT1000");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first?.courseTitle).toBe("ACCOUNTING");
  });

  it("returns null for missing embedded data", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const fetchCourse = createUmFetcher();
    await expect(fetchCourse("ACCT2000")).resolves.toBeNull();
  });
});
