import { describe, expect, it } from "vitest";
import {
  getDepartmentOptions,
  parsePlannerQuery,
  serializePlannerQuery,
} from "@/lib/timetable/planner-query";

describe("planner query", () => {
  it("parses defaults and invalid page", () => {
    expect(parsePlannerQuery(new URLSearchParams())).toEqual({
      mode: "course",
      q: "",
      faculty: "",
      department: "",
      code: "",
      prof: "",
      page: 1,
    });
    expect(parsePlannerQuery(new URLSearchParams("page=0&mode=nope")).page).toBe(1);
  });

  it("round-trips query state", () => {
    const query = parsePlannerQuery(
      new URLSearchParams("mode=instructor&q=CHAN&faculty=FAH&page=3"),
    );
    expect(serializePlannerQuery(query)).toContain("mode=instructor");
    expect(serializePlannerQuery(query)).toContain("page=3");
    expect(parsePlannerQuery(new URLSearchParams(serializePlannerQuery(query)))).toEqual(query);
  });

  it("filters departments by faculty", () => {
    expect(
      getDepartmentOptions(["A", "B"], "F1", { F1: ["A"] }),
    ).toEqual(["A"]);
    expect(getDepartmentOptions(["A", "B"], "", {})).toEqual(["A", "B"]);
  });
});
