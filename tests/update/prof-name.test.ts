import { describe, expect, it } from "vitest";
import { normalizeProfName, splitProfNames } from "@/lib/update/prof-name";

describe("prof-name", () => {
  it("unidecodes and trims", () => {
    expect(normalizeProfName("  Ténèbres  ")).toBe("Tenebres");
  });

  it("splits on ' / ' and dedupes", () => {
    expect(splitProfNames("CHAN Tai Man / Wáng Wei / CHAN Tai Man")).toEqual([
      "CHAN Tai Man",
      "Wang Wei",
    ]);
  });

  it("returns an empty array for blanks", () => {
    expect(splitProfNames("   ")).toEqual([]);
  });
});
