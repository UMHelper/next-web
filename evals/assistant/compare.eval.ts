import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { armReport, checkControlled, type Prices } from "./compare";
import { resultFileName, type SavedRun } from "./results";

const env = process.env;
const files = (env.ASSISTANT_COMPARE ?? "")
  .split(",")
  .map((file) => file.trim())
  .filter((file) => file !== "");

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
  it("compares runs that differ only in the output budget", () => {
    const runs = files.map((file) => ({ file: path.basename(file), run: JSON.parse(readFileSync(file, "utf8")) as SavedRun }));
    expect(checkControlled(runs)).toEqual([]);
    const pricing = prices();
    const arms = runs
      .map(({ file, run }) => armReport(file, run, pricing))
      .sort((a, b) => a.maxOutputTokens - b.maxOutputTokens);
    const out = path.join(".eval-results", "assistant", resultFileName(new Date(), "compare", true));
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ kind: "comparison", prices: pricing, arms }, null, 2));
    console.info(JSON.stringify({ file: out, prices: pricing, arms }, null, 2));
  });
});
