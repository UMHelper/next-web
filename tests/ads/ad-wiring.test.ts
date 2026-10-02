import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MASONRY_CALLERS = [
  "components/course-filter.tsx",
  "components/comments.tsx",
  "components/course/course-instructors.tsx",
  "app/professor/[...name]/page.tsx",
  "app/search/instructor/[...name]/page.tsx",
];

const SALT_PASSERS = [
  "app/catalog/[...departments]/page.tsx",
  "app/search/course/[code]/page.tsx",
];

function source(file: string): string {
  return readFileSync(file, "utf8");
}

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("masonry ad wiring", () => {
  it("routes every masonry list through withAdSlots", () => {
    for (const file of MASONRY_CALLERS) {
      const text = source(file);
      expect(text, file).toContain("withAdSlots");
      expect(text, file).toContain("salt");
    }
  });

  it("gives the client side course filter a server salt", () => {
    for (const file of SALT_PASSERS) {
      const text = source(file);
      expect(text, file).toContain("createAdSalt");
      expect(text, file).toContain("adSalt={");
    }
  });

  it("keeps the salt generator out of client components", () => {
    const offenders = [
      ...collectSourceFiles("app"),
      ...collectSourceFiles("components"),
      ...collectSourceFiles("lib"),
    ].filter((file) => {
      const text = source(file);
      const isClient = text.includes('"use client"') || text.includes("'use client'");
      return isClient && text.includes("lib/ads/ad-salt");
    });

    expect(offenders).toEqual([]);
  });

  it("keeps Math.random out of the ad rendering path", () => {
    const guarded = [
      "lib/ads/ad-slots.tsx",
      "lib/ads/request-ad.ts",
      ...collectSourceFiles("components/ads"),
    ];
    for (const file of guarded) {
      expect(source(file), file).not.toContain("Math.random");
    }
  });

  it("leaves Masonry itself untouched", () => {
    const masonry = source("components/masonry.tsx");
    expect(masonry).not.toContain("adsbygoogle");
    expect(masonry).not.toContain("AdSlot");
  });
});
