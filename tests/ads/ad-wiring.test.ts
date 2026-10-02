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

const CONFIG_BUILDERS = [
  "app/catalog/[...departments]/page.tsx",
  "app/search/course/[code]/page.tsx",
];

const SERVER_ONLY_AD_MODULES = ["lib/ads/ad-config", "lib/ads/ad-config-server"];

function source(file: string): string {
  return readFileSync(file, "utf8");
}

function isClientFile(text: string): boolean {
  return text.includes('"use client"') || text.includes("'use client'");
}

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectSourceFiles(fullPath);
    return fullPath.endsWith(".ts") || fullPath.endsWith(".tsx") ? [fullPath] : [];
  });
}

function allSourceFiles(): string[] {
  return [
    ...collectSourceFiles("app"),
    ...collectSourceFiles("components"),
    ...collectSourceFiles("lib"),
  ];
}

describe("masonry ad wiring", () => {
  it("routes every masonry list through withAdSlots", () => {
    for (const file of MASONRY_CALLERS) {
      const text = source(file);
      expect(text, file).toContain("withAdSlots");
      expect(text, file).toContain("ads,");
    }
  });

  it("builds the ad config on the server and passes it to the client filter", () => {
    for (const file of CONFIG_BUILDERS) {
      const text = source(file);
      expect(text, file).toContain("createAdConfig");
      expect(text, file).toContain("ads={ads}");
    }
  });

  it("keeps the ad config builder out of client components", () => {
    const offenders = allSourceFiles().filter((file) => {
      const text = source(file);
      return isClientFile(text) && text.includes("lib/ads/ad-config-server");
    });

    expect(offenders).toEqual([]);
  });

  it("keeps NEXT_PUBLIC_GOOGLE_ADS_* out of client components", () => {
    // The production incident: a build without those vars inlined made the
    // client read undefined while the server (runtime env) rendered the unit,
    // so hydration failed and every ad slot was removed. Only server code may
    // read them; the values reach the client through props.
    const offenders = allSourceFiles().filter((file) => {
      const text = source(file);
      return isClientFile(text) && text.includes("NEXT_PUBLIC_GOOGLE_ADS_");
    });

    expect(offenders).toEqual([]);
  });

  it("keeps the env readers out of client components", () => {
    const offenders = allSourceFiles().filter((file) => {
      const text = source(file);
      if (!isClientFile(text)) return false;
      return SERVER_ONLY_AD_MODULES.some((module) => text.includes(module));
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
