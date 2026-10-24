import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SUITES } from "./suites";
import { EVAL_CATALOG_FACTS } from "./catalog";
import { evalFingerprint, failureLines, regradeTraces, resultFileName, type RegradedRun, type SavedRun } from "./results";

const sources = (process.env.ASSISTANT_REGRADE ?? "")
  .split(",")
  .map((file) => file.trim())
  .filter((file) => file !== "");

describe.skipIf(sources.length === 0)("regrade saved assistant eval traces", () => {
  it("regrades every file under the current rules", () => {
    for (const source of sources) {
      const saved = JSON.parse(readFileSync(source, "utf8")) as SavedRun;
      const suiteCases = SUITES[saved.suite ?? "navigation"];
      expect(suiteCases, `${source}: unknown suite "${saved.suite}"`).toBeDefined();
      const regraded = regradeTraces(saved.traces, suiteCases, saved.settings.maxSteps, EVAL_CATALOG_FACTS, saved.repeats);
      expect(regraded.unmatched, `${source}: saved turns whose case was removed`).toEqual([]);

      const record: RegradedRun = {
        kind: "regraded",
        source: path.basename(source),
        label: saved.label,
        sourceSettings: saved.settings,
        sourceStepsUsed: saved.stepsUsed,
        sourceStoppedEarly: saved.stoppedEarly,
        evalFingerprint: evalFingerprint(suiteCases),
        repeats: saved.repeats,
        missing: regraded.missing,
        failures: failureLines(regraded.grades, saved.traces),
        summary: regraded.summary,
        grades: regraded.grades,
      };
      const file = path.join(".eval-results", "assistant", resultFileName(new Date(), `regrade-${saved.label}`, true));
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(record, null, 2));
      const { grades: _grades, ...printed } = record;
      console.info(JSON.stringify({ file, ...printed }, null, 2));
    }
  });
});
