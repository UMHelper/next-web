import { describe, expect, it } from "vitest";
import { formatAcademicYear } from "@/lib/config/term-format";

describe("formatAcademicYear", () => {
  it("formats the academic year label", () => {
    expect(formatAcademicYear(2026, 1)).toBe("2026/2027 AY Sem 1");
    expect(formatAcademicYear(2026, 2)).toBe("2026/2027 AY Sem 2");
  });
});
