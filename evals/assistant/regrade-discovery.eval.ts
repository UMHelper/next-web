import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { regradeDiscoveryArtifact, type DiscoverySavedArtifact } from "./discovery-grade";

const sources = (process.env.ASSISTANT_REGRADE ?? "")
  .split(",")
  .map((file) => file.trim())
  .filter((file) => file !== "");

describe.skipIf(sources.length === 0)("regrade saved discovery traces", () => {
  it("regrades every discovery artifact under the v2 rubric", () => {
    for (const source of sources) {
      const saved = JSON.parse(readFileSync(source, "utf8")) as DiscoverySavedArtifact;
      const regraded = regradeDiscoveryArtifact(source, saved);
      expect(regraded.record.regradedPass + regraded.record.regradedFail, source).toBe(saved.traces.length);
      mkdirSync(path.dirname(regraded.outputPath), { recursive: true });
      writeFileSync(regraded.outputPath, JSON.stringify(regraded.record, null, 2));
      console.info(
        JSON.stringify(
          {
            file: regraded.outputPath,
            source: regraded.record.source,
            sourceLabel: regraded.record.sourceLabel,
            regradedPass: regraded.record.regradedPass,
            regradedFail: regraded.record.regradedFail,
            summary: regraded.record.summary,
          },
          null,
          2,
        ),
      );
    }
  });
});
