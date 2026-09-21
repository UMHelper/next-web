import { describe, expect, it } from "vitest";
import { migrateLegacyCart } from "@/lib/timetable/migrate-legacy-cart";

describe("migrateLegacyCart", () => {
  it("maps and dedupes legacy cart items", () => {
    const result = migrateLegacyCart(
      [
        {
          code: "acct1000",
          prof: "CHAN",
          section: "A01",
          schedules: [
            { date: "Mon", time: "09:00 - 10:15", location: "E4" },
          ],
        },
        {
          code: "ACCT1000",
          prof: "CHAN",
          section: "A01",
          schedules: [],
        },
      ],
      { year: 2026, sem: 1 },
    );

    expect(result?.sections).toHaveLength(1);
    expect(result?.sections[0].key).toBe("ACCT1000|CHAN|A01");
  });

  it("returns null when there is nothing to migrate", () => {
    expect(migrateLegacyCart([], { year: 2026, sem: 1 })).toBeNull();
  });
});
