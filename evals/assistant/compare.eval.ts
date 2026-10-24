import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { armReport, armTable, checkControlled, intentTable, type Prices, type Vary } from "./compare";
import { resultFileName, type SavedRun } from "./results";
import { SUITES } from "./suites";

const env = process.env;
const files = (env.ASSISTANT_COMPARE ?? "")
  .split(",")
  .map((file) => file.trim())
  .filter((file) => file !== "");
const vary = env.ASSISTANT_COMPARE_VARY ?? "inference";

function prices(): Prices | null {
  const raw = [env.ASSISTANT_EVAL_PRICE_INPUT_MISS, env.ASSISTANT_EVAL_PRICE_INPUT_HIT, env.ASSISTANT_EVAL_PRICE_OUTPUT];
  if (raw.every((value) => value === undefined)) return null;
  const [inputCacheMiss, inputCacheHit, output] = raw.map(Number);
  if (![inputCacheMiss, inputCacheHit, output].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("set all three ASSISTANT_EVAL_PRICE_* values, in USD per million tokens");
  }
  return { inputCacheMiss, inputCacheHit, output };
}

describe.skipIf(files.length === 0)("compare assistant eval runs", () => {
  it("compares runs that change one setting at a time, in the given order", () => {
    expect(["inference", "prompt"], `ASSISTANT_COMPARE_VARY must be "inference" or "prompt", got "${vary}"`).toContain(vary);
    const runs = files.map((file) => ({ file: path.basename(file), run: JSON.parse(readFileSync(file, "utf8")) as SavedRun }));
    expect(checkControlled(runs, vary as Vary)).toEqual([]);
    const pricing = prices();
    const cases = SUITES[runs[0].run.suite ?? "navigation"] ?? [];
    const arms = runs.map(({ file, run }) => armReport(file, run, pricing, cases));
    const out = path.join(".eval-results", "assistant", resultFileName(new Date(), "compare", true));
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ kind: "comparison", vary, prices: pricing, arms }, null, 2));
    console.info(JSON.stringify({ file: out, vary, prices: pricing, arms }, null, 2));
    console.info(`\n${armTable(arms)}\n`);
    for (const arm of arms) console.info(`\n${intentTable(arm)}\n`);
  });
});
