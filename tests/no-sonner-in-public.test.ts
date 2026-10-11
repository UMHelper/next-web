import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SONNER = /from\s+["']sonner["']/;
const FACADE = /from\s+["']@\/lib\/notify["']/;

const PUBLIC = [
  "components/report-dialog.tsx",
  "components/review-notice.tsx",
  "components/timetable-schedule-card.tsx",
  "components/submit/submit-comment-form.tsx",
  "components/review/comment-card.tsx",
  "components/timetable/share-dialog.tsx",
  "components/timetable/planner-sidebar.tsx",
];

const ADMIN = [
  "app/admin/update/update-client.tsx",
  ...readdirSync(join(process.cwd(), "components/admin"))
    .filter((f) => /^admin-.*-client\.tsx$/.test(f))
    .map((f) => `components/admin/${f}`),
];

describe("toast routing boundaries", () => {
  it.each(PUBLIC)("%s goes through the notify facade", (file) => {
    const src = read(file);
    expect(src).toMatch(FACADE);
    expect(src).not.toMatch(SONNER);
  });

  it("covers the five admin client components plus the update client", () => {
    expect(ADMIN).toHaveLength(6);
  });

  it.each(ADMIN)("%s keeps using sonner directly", (file) => {
    const src = read(file);
    expect(src).toMatch(SONNER);
    expect(src).not.toMatch(FACADE);
  });
});
