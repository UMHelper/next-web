import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DISCOVERY_CASES_V2 } from "@/evals/assistant/discovery-cases";
import {
  gradeDiscovery,
  regradeDiscoveryArtifact,
  summarizeDiscovery,
  type DiscoveryExpect,
  type DiscoveryGrade,
} from "@/evals/assistant/discovery-grade";
import type { TurnTrace } from "@/evals/assistant/grade";

const CONTRADICTORY_WINDOW =
  "Find GEST courses that must start after 18:00 and end before 08:00 every meeting.";

const PASSING_CHECKS = {
  discovery: true,
  mention: true,
  forbid: true,
  falseFitClaims: true,
  maxToolCalls: true,
};

const outputs: string[] = [];

afterEach(() => {
  for (const file of outputs) rmSync(file, { force: true });
  outputs.length = 0;
});

function turnTrace(input: {
  caseId: string;
  repeat: number;
  turn: number;
  message: string;
  reply: string;
  toolCalls?: TurnTrace["toolCalls"];
}): TurnTrace {
  return {
    caseId: input.caseId,
    repeat: input.repeat,
    turn: input.turn,
    message: input.message,
    pathnameBefore: "/",
    pathnameAfter: "/",
    toolCalls: input.toolCalls ?? [],
    runs: [],
    reply: input.reply,
    ms: 0,
    runCapHit: false,
  };
}

function caseExpect(caseId: string, turn: number): DiscoveryExpect {
  const found = DISCOVERY_CASES_V2.find((item) => item.id === caseId)?.turns[turn];
  if (!found) throw new Error(`missing ${caseId} turn ${turn}`);
  return found.expect;
}

function gradedTurn(trace: TurnTrace, expect: DiscoveryExpect): DiscoveryGrade {
  const graded = gradeDiscovery(trace, expect);
  return {
    caseId: trace.caseId,
    repeat: trace.repeat,
    turn: trace.turn,
    pass: graded.pass,
    checks: graded.checks,
    falseFitClaims: graded.falseFitClaims,
    toolCalls: graded.toolCalls,
    discoveryRequired: expect.discovery === "required",
    toolChoice: graded.toolChoice,
    discoveryBucket: graded.discoveryBucket,
    difficulty: graded.difficulty,
  };
}

function commitRegrade(sourcePath: string) {
  const saved = JSON.parse(readFileSync(sourcePath, "utf8")) as {
    label: string;
    suite?: string;
    grades: Array<{
      caseId: string;
      repeat: number;
      turn: number;
      pass: boolean;
      checks: Record<string, boolean>;
    }>;
    traces: TurnTrace[];
  };
  const result = regradeDiscoveryArtifact(sourcePath, saved);
  outputs.push(result.outputPath);
  mkdirSync(path.dirname(result.outputPath), { recursive: true });
  writeFileSync(result.outputPath, JSON.stringify(result.record, null, 2));
  return result;
}

function tempArtifact(artifact: unknown) {
  const dir = mkdtempSync(path.join(tmpdir(), "discovery-regrade-"));
  const sourcePath = path.join(dir, "artifact.json");
  writeFileSync(sourcePath, JSON.stringify(artifact));
  const beforeBytes = readFileSync(sourcePath);
  const beforeMtime = statSync(sourcePath).mtimeMs;
  return {
    sourcePath,
    assertUnchanged() {
      expect(readFileSync(sourcePath).equals(beforeBytes)).toBe(true);
      expect(statSync(sourcePath).mtimeMs).toBe(beforeMtime);
    },
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("regradeDiscoveryArtifact", () => {
  it("flips a parenthetical no-clash false positive and keeps a genuine miss failing", () => {
    const falsePositive = turnTrace({
      caseId: "easy_gest",
      repeat: 0,
      turn: 3,
      message: "Could the ones you listed still sit with the classes I already kept?",
      reply: "The options I kept have no clash with the timetable you saved (GEGA1000-007).",
    });
    const genuineMiss = turnTrace({
      caseId: "easy_gest",
      repeat: 1,
      turn: 3,
      message: "What about GEST1006 on its own?",
      reply: "GEST1006 has no clash with the classes already on your plan.",
    });
    const fitExpect = caseExpect("easy_gest", 3);
    const artifact = {
      label: "b1.dev/holdout_v2",
      suite: "dev",
      grades: [
        {
          caseId: "easy_gest",
          repeat: 0,
          turn: 0,
          pass: true,
          checks: PASSING_CHECKS,
        },
        {
          caseId: "easy_gest",
          repeat: 1,
          turn: 3,
          pass: false,
          checks: {
            discovery: false,
            mention: false,
            forbid: false,
            falseFitClaims: false,
            maxToolCalls: false,
          },
        },
        {
          caseId: "history_ge",
          repeat: 0,
          turn: 0,
          pass: true,
          checks: PASSING_CHECKS,
        },
        {
          caseId: "easy_gest",
          repeat: 0,
          turn: 3,
          pass: false,
          checks: { ...PASSING_CHECKS, falseFitClaims: false },
        },
      ],
      traces: [falsePositive, genuineMiss],
    };
    const fixture = tempArtifact(artifact);
    try {
      const result = commitRegrade(fixture.sourcePath);
      fixture.assertUnchanged();

      expect(result.outputPath).toBe(
        path.resolve(".eval-results/assistant/discovery-regrade-b2-b1.dev-holdout_v2.json"),
      );
      expect(path.resolve(result.outputPath)).not.toBe(path.resolve(fixture.sourcePath));
      expect(JSON.parse(readFileSync(result.outputPath, "utf8"))).toEqual(result.record);
      expect(result.record).toMatchObject({
        kind: "discovery-regrade",
        source: fixture.sourcePath,
        sourceLabel: "b1.dev/holdout_v2",
        rubricVersion: "b2-v2",
        sourceRubricVersion: "b1",
      });
      expect(result.record.diffs).toEqual([
        {
          caseId: "easy_gest",
          repeat: 0,
          turn: 3,
          was: "fail",
          now: "pass",
          changedChecks: ["falseFitClaims"],
        },
        {
          caseId: "easy_gest",
          repeat: 1,
          turn: 3,
          was: "fail",
          now: "fail",
          changedChecks: ["discovery", "mention", "forbid", "maxToolCalls"],
        },
      ]);
      expect(result.record.regradedPass).toBe(1);
      expect(result.record.regradedFail).toBe(1);
      expect(result.record.regradedPass + result.record.regradedFail).toBe(artifact.traces.length);
      expect(result.record.summary).toEqual(
        summarizeDiscovery(
          [gradedTurn(falsePositive, fitExpect), gradedTurn(genuineMiss, fitExpect)],
          DISCOVERY_CASES_V2.map((item) => item.id),
        ),
      );
      expect(result.record.summary.falseFitClaims).toBe(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("grades the contradictory-window sentence with no_candidates_invalid_window", () => {
    const trace = turnTrace({
      caseId: "no_candidates",
      repeat: 2,
      turn: 0,
      message: CONTRADICTORY_WINDOW,
      reply: "That window is empty, so there is no course in it.",
    });
    expect(gradeDiscovery(trace, caseExpect("no_candidates_invalid_window", 0)).pass).toBe(true);
    expect(gradeDiscovery(trace, caseExpect("no_candidates", 0)).pass).toBe(false);

    const artifact = {
      label: "contradictory-window",
      suite: "dev",
      grades: [
        {
          caseId: "no_candidates",
          repeat: 0,
          turn: 0,
          pass: true,
          checks: PASSING_CHECKS,
        },
        {
          caseId: "no_candidates",
          repeat: 2,
          turn: 0,
          pass: false,
          checks: { ...PASSING_CHECKS, discovery: false },
        },
      ],
      traces: [trace],
    };
    const fixture = tempArtifact(artifact);
    try {
      const result = commitRegrade(fixture.sourcePath);
      fixture.assertUnchanged();
      expect(result.record.diffs).toEqual([
        {
          caseId: "no_candidates",
          repeat: 2,
          turn: 0,
          was: "fail",
          now: "pass",
          changedChecks: ["discovery"],
        },
      ]);
      expect(result.record.regradedPass).toBe(1);
      expect(result.record.regradedFail).toBe(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("grades any other no_candidates trace on the v2 case", () => {
    const trace = turnTrace({
      caseId: "no_candidates",
      repeat: 0,
      turn: 0,
      message: "GEST classes only after 18:00, please.",
      reply: "That window is empty, so there is no course in it.",
    });
    const artifact = {
      label: "evening-start",
      suite: "dev",
      grades: [
        {
          caseId: "no_candidates",
          repeat: 0,
          turn: 0,
          pass: true,
          checks: PASSING_CHECKS,
        },
      ],
      traces: [trace],
    };
    const fixture = tempArtifact(artifact);
    try {
      const result = commitRegrade(fixture.sourcePath);
      fixture.assertUnchanged();
      expect(result.record.diffs[0]).toMatchObject({
        was: "pass",
        now: "fail",
        changedChecks: ["discovery"],
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("selects holdout-v1 when the suite is holdout", () => {
    const trace = turnTrace({
      caseId: "holdout-easy_ge",
      repeat: 0,
      turn: 0,
      message: "Any easy afternoon GEST class?",
      reply: "I have not looked anything up.",
    });
    const artifact = {
      label: "holdout-run",
      suite: "holdout",
      grades: [
        {
          caseId: "holdout-easy_ge",
          repeat: 0,
          turn: 0,
          pass: true,
          checks: PASSING_CHECKS,
        },
      ],
      traces: [trace],
    };
    const fixture = tempArtifact(artifact);
    try {
      const result = commitRegrade(fixture.sourcePath);
      fixture.assertUnchanged();
      expect(result.record.diffs[0]).toMatchObject({ was: "pass", now: "fail" });
      expect(result.record.regradedPass + result.record.regradedFail).toBe(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("selects dev-v2 for a discovery suite other than holdout", () => {
    const trace = turnTrace({
      caseId: "easy_gest",
      repeat: 0,
      turn: 3,
      message: "Would the shortlist still fit?",
      reply: "The options I kept have no clash with the timetable you saved (GEGA1000-007).",
    });
    const artifact = {
      label: "baseline-arm",
      suite: "baseline",
      grades: [
        {
          caseId: "easy_gest",
          repeat: 0,
          turn: 3,
          pass: false,
          checks: { ...PASSING_CHECKS, falseFitClaims: false },
        },
      ],
      traces: [trace],
    };
    const fixture = tempArtifact(artifact);
    try {
      const result = commitRegrade(fixture.sourcePath);
      fixture.assertUnchanged();
      expect(result.record.diffs[0]).toMatchObject({ was: "fail", now: "pass" });
      expect(result.outputPath).toBe(
        path.resolve(".eval-results/assistant/discovery-regrade-b2-baseline-arm.json"),
      );
    } finally {
      fixture.cleanup();
    }
  });

  it("accepts supported fit evidence without a planner version override", () => {
    const trace = turnTrace({
      caseId: "easy_gest",
      repeat: 0,
      turn: 3,
      message: "Does GEST1005 still fit?",
      reply: "GEST1005 has no clash with the classes already on your plan.",
      toolCalls: [
        {
          name: "check_plan_conflicts",
          args: { courseCode: "GEST1005" },
          result: JSON.stringify({
            status: "checked",
            courseCode: "GEST1005",
            instructor: "CHEUNG WAI",
            plan: { name: "Plan", term: "2026/2027 AY Sem 1" },
            planComplete: true,
            unscheduled: [],
            sectionListComplete: true,
            plannerVersion: "snapshot-a",
            sections: ["001", "002"].map((section) => ({
              section,
              meetings: ["TUE 15:00-16:15"],
              conflicts: [],
              complete: true,
              fit: "verified_no_clash",
            })),
          }),
        },
      ],
    });
    const fitExpect = caseExpect("easy_gest", 3);
    expect(gradeDiscovery(trace, fitExpect).pass).toBe(true);
    expect(gradeDiscovery(trace, fitExpect, { plannerVersion: "snapshot-b" }).pass).toBe(false);

    const artifact = {
      label: "supported-fit",
      suite: "dev",
      grades: [
        {
          caseId: "easy_gest",
          repeat: 0,
          turn: 3,
          pass: false,
          checks: { ...PASSING_CHECKS, falseFitClaims: false },
        },
      ],
      traces: [trace],
    };
    const fixture = tempArtifact(artifact);
    try {
      const result = commitRegrade(fixture.sourcePath);
      fixture.assertUnchanged();
      expect(result.record.diffs[0]).toMatchObject({
        was: "fail",
        now: "pass",
        changedChecks: ["falseFitClaims"],
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("throws when a trace has no saved grade and does not write the output", () => {
    const output = path.resolve(".eval-results/assistant/discovery-regrade-b2-missing-grade.json");
    rmSync(output, { force: true });
    const artifact = {
      label: "missing-grade",
      suite: "dev",
      grades: [],
      traces: [
        turnTrace({
          caseId: "easy_gest",
          repeat: 0,
          turn: 3,
          message: "Would the shortlist still fit?",
          reply: "Nothing claimed.",
        }),
      ],
    };
    const fixture = tempArtifact(artifact);
    try {
      let error: unknown;
      try {
        commitRegrade(fixture.sourcePath);
      } catch (caught) {
        error = caught;
      }
      fixture.assertUnchanged();
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/saved grade/);
      expect(existsSync(output)).toBe(false);
    } finally {
      fixture.cleanup();
    }
  });

  it("throws when the trace case is not in the selected case set", () => {
    const artifact = {
      label: "unknown-case",
      suite: "dev",
      grades: [
        {
          caseId: "not_a_case",
          repeat: 0,
          turn: 0,
          pass: false,
          checks: {},
        },
      ],
      traces: [
        turnTrace({
          caseId: "not_a_case",
          repeat: 0,
          turn: 0,
          message: "Hello",
          reply: "Hello",
        }),
      ],
    };
    const fixture = tempArtifact(artifact);
    try {
      expect(() => commitRegrade(fixture.sourcePath)).toThrow(/not_a_case/);
      fixture.assertUnchanged();
    } finally {
      fixture.cleanup();
    }
  });

  it("refuses to write when the output path is the source file", () => {
    const canonical = path.resolve(".eval-results/assistant/discovery-regrade-b2-same-path.json");
    mkdirSync(path.dirname(canonical), { recursive: true });
    const artifact = { label: "same-path", suite: "dev", grades: [], traces: [] };
    writeFileSync(canonical, JSON.stringify(artifact));
    const beforeBytes = readFileSync(canonical);
    const beforeMtime = statSync(canonical).mtimeMs;
    const aliased = `${path.dirname(canonical)}/../assistant/${path.basename(canonical)}`;
    try {
      let error: unknown;
      try {
        commitRegrade(aliased);
      } catch (caught) {
        error = caught;
      }
      expect(readFileSync(canonical).equals(beforeBytes)).toBe(true);
      expect(statSync(canonical).mtimeMs).toBe(beforeMtime);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/refused to overwrite the source file/);
    } finally {
      rmSync(canonical, { force: true });
    }
  });
});
