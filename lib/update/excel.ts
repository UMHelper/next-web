import * as XLSX from "xlsx";

import type { ScheduleMode, ScheduleRow } from "@/lib/update/types";

const WEEKDAYS = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);

const COLUMNS: Record<string, string[]> = {
  code: ["Course Code"],
  title: ["Course Title"],
  section: ["Section"],
  offeringUnit: ["Offering Unit"],
  offeringDept: ["Offering Department"],
  mediumInstruction: ["Medium of Instruction"],
  teacherRaw: ["Teacher Information"],
  day: ["Day"],
  timeFrom: ["Time From"],
  timeTo: ["Time To"],
  location: ["Classroom"],
};

const REQUIRED = ["code"];

function cellText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function normalizeDay(value: unknown): string | null {
  const text = cellText(value).toUpperCase();
  if (!text) return null;
  const three = text.slice(0, 3);
  return WEEKDAYS.has(three) ? three : null;
}

export function toHHMM(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round((value % 1) * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  const match = cellText(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function findHeaderRow(rows: unknown[][]): number | null {
  for (let index = 0; index < Math.min(rows.length, 20); index += 1) {
    const row = rows[index] ?? [];
    if (row.some((cell) => cellText(cell) === "Course Code")) return index;
  }
  return null;
}

function buildColumnIndex(header: unknown[]): Record<string, number> {
  const lookup = new Map<string, number>();
  header.forEach((cell, index) => {
    const name = cellText(cell);
    if (name) lookup.set(name, index);
  });

  const columns: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(COLUMNS)) {
    const found = aliases.map((alias) => lookup.get(alias)).find((value) => value !== undefined);
    if (found !== undefined) columns[key] = found;
  }
  return columns;
}

function cellAt(row: unknown[], columns: Record<string, number>, key: string): unknown {
  const index = columns[key];
  return index === undefined ? null : row[index];
}

export function parseScheduleWorkbook(
  data: ArrayBuffer,
  options: { mode: ScheduleMode; sheetName?: string },
): ScheduleRow[] {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName = options.sheetName ?? workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  const headerRow = findHeaderRow(rows);
  if (headerRow === null) return [];

  const columns = buildColumnIndex(rows[headerRow] ?? []);
  for (const key of REQUIRED) {
    if (columns[key] === undefined) return [];
  }

  const parsed: ScheduleRow[] = [];
  for (const row of rows.slice(headerRow + 1)) {
    const code = cellText(cellAt(row, columns, "code")).toUpperCase();
    if (!code) continue;

    const timeFrom = toHHMM(cellAt(row, columns, "timeFrom"));
    const timeTo = toHHMM(cellAt(row, columns, "timeTo"));

    parsed.push({
      offeringUnit: cellText(cellAt(row, columns, "offeringUnit")),
      offeringDept: cellText(cellAt(row, columns, "offeringDept")),
      code,
      title: cellText(cellAt(row, columns, "title")),
      section: cellText(cellAt(row, columns, "section")),
      mediumInstruction: cellText(cellAt(row, columns, "mediumInstruction")),
      teacherRaw: cellText(cellAt(row, columns, "teacherRaw")),
      day: normalizeDay(cellAt(row, columns, "day")),
      times: timeFrom && timeTo ? `${timeFrom}-${timeTo}` : null,
      location: cellText(cellAt(row, columns, "location")) || null,
    });
  }

  return parsed;
}
