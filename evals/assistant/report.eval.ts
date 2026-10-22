import { readFileSync } from "node:fs";

import { describe, it } from "vitest";

import { metricTable, reportColumn, type RegradedRun, type SavedRun } from "./results";

const files = (process.env.ASSISTANT_REPORT ?? "")
  .split(",")
  .map((file) => file.trim())
  .filter((file) => file !== "");

describe.skipIf(files.length === 0)("assistant eval report", () => {
  it("prints one metric table for the given result files", () => {
    const columns = files.map((file) => reportColumn(JSON.parse(readFileSync(file, "utf8")) as SavedRun | RegradedRun));
    console.info(`\n${metricTable(columns)}\n`);
  });
});
