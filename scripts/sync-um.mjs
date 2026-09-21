#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import pLimit from "p-limit";

const UM_API_BASE = "https://api.data.um.edu.mo/service/academic/course_catalog/all";
const PAGE_SIZE = 1000;
const SYNC_CONCURRENCY = Number(process.env.SYNC_CONCURRENCY || 4);

function loadEnv() {
  if (process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Environment can be provided by the shell / GitHub Actions secrets.
  }
}

function normalizeText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export function hasCompleteCourseInfo(courseInfo) {
  return Boolean(
    normalizeText(courseInfo?.["courseTitleEng"]) &&
      normalizeText(courseInfo?.["offeringProgLevel"]) &&
      normalizeText(courseInfo?.["Credits"]) &&
      normalizeText(courseInfo?.["Offering_Department"]) &&
      normalizeText(courseInfo?.["Offering_Unit"]) &&
      normalizeText(courseInfo?.["Medium_of_Instruction"]) &&
      normalizeText(courseInfo?.["gradingSystem"]) &&
      normalizeText(courseInfo?.["courseType"]) &&
      normalizeText(courseInfo?.["Course_Duration"]) &&
      normalizeText(courseInfo?.["courseDescription"]) &&
      normalizeText(courseInfo?.["ilo"]),
  );
}

export function mapRemoteCourseInfoToLocalPatch(remote, local, code) {
  return {
    New_code: code.toUpperCase(),
    courseTitleEng: normalizeText(remote["courseTitle"]) ?? normalizeText(local["courseTitleEng"]),
    offeringProgLevel: normalizeText(remote["offeringProgLevel"]) ?? normalizeText(local["offeringProgLevel"]),
    suggestedYearOfStudy: remote["suggestedYearOfStudy"] ?? local["suggestedYearOfStudy"],
    Credits: normalizeText(remote["credits"]) ?? normalizeText(local["Credits"]),
    Offering_Department: normalizeText(remote["offeringDept"]) ?? normalizeText(local["Offering_Department"]),
    Offering_Unit: normalizeText(remote["offeringUnit"]) ?? normalizeText(local["Offering_Unit"]),
    Medium_of_Instruction:
      normalizeText(remote["mediumOfInstruction"]) ?? normalizeText(local["Medium_of_Instruction"]),
    gradingSystem: normalizeText(remote["gradingSystem"]) ?? normalizeText(local["gradingSystem"]),
    courseType: normalizeText(remote["courseType"]) ?? normalizeText(local["courseType"]),
    Course_Duration: normalizeText(remote["duration"]) ?? normalizeText(local["Course_Duration"]),
    courseDescription:
      normalizeText(remote["courseDescription"]) ?? normalizeText(local["courseDescription"]),
    ilo: normalizeText(remote["ilo"]) ?? normalizeText(local["ilo"]),
  };
}

export async function fetchUMCourse(code, token = process.env.UM_OPEN_DATA_TOKEN) {
  if (!token) throw new Error("UM_OPEN_DATA_TOKEN is not configured");

  const response = await fetch(`${UM_API_BASE}?course_code=${encodeURIComponent(code.toUpperCase())}`, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (!response.ok) return null;
  const body = await response.json();
  return body?._embedded?.[0] ?? null;
}

function createSupabaseClient() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function loadLocalCourse(client, code) {
  const { data, error } = await client.from("course_noporf").select("*").eq("New_code", code).maybeSingle();
  if (error) throw error;
  return data;
}

// PostgREST caps responses at 1000 rows by default, so paginate to see the whole table.
export async function selectAllCodes(client, columns) {
  const out = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("course_noporf")
      .select(columns)
      .order("New_code", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return out;
}

export function compactPatch(patch) {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== null && value !== undefined),
  );
}

export function buildInsertPatch(patch, code) {
  return {
    New_code: code.toUpperCase(),
    Offering_Unit: "",
    Offering_Department: "",
    Old_code: "",
    courseTitleEng: "",
    courseTitleChi: "",
    Credits: "",
    Course_Duration: "",
    Medium_of_Instruction: "",
    Is_Offered: 0,
    ...patch,
  };
}

export async function syncCourseByCode(client, code) {
  const remote = await fetchUMCourse(code);
  if (!remote) return { code, status: "not_found" };

  const local = await loadLocalCourse(client, code);
  const mapped = mapRemoteCourseInfoToLocalPatch(remote, local ?? {}, code);
  const patch = compactPatch(mapped);

  if (local) {
    const { error } = await client.from("course_noporf").update(patch).eq("New_code", code);
    if (error) return { code, status: "failed", error: error.message };
    return { code, status: "updated" };
  }

  const insertPatch = buildInsertPatch(patch, code);
  const { error } = await client.from("course_noporf").insert([insertPatch]);
  if (error) return { code, status: "failed", error: error.message };
  return { code, status: "created" };
}

function applyLimit(codes, limit) {
  return limit === null ? codes : codes.slice(0, limit);
}

async function loadIncompleteCodes(client, limit) {
  const data = await selectAllCodes(
    client,
    'New_code, courseTitleEng, offeringProgLevel, Credits, Offering_Department, Offering_Unit, Medium_of_Instruction, gradingSystem, courseType, Course_Duration, courseDescription, ilo',
  );
  return applyLimit(data.filter((course) => !hasCompleteCourseInfo(course)).map((course) => course.New_code), limit);
}

async function loadAllCodes(client, limit) {
  const data = await selectAllCodes(client, "New_code");
  return applyLimit(data.map((course) => course.New_code), limit);
}

export function parseArgs(argv) {
  const args = {
    mode: "missing",
    limit: 100,
    code: null,
  };

  for (const arg of argv) {
    if (arg === "--all") args.mode = "all";
    else if (arg === "--missing") args.mode = "missing";
    else if (arg === "--limit=all" || arg === "--no-limit") args.limit = null;
    else if (arg.startsWith("--limit=")) args.limit = Number(arg.slice("--limit=".length));
    else if (arg.startsWith("--code=")) args.code = arg.slice("--code=".length).trim().toUpperCase();
  }

  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error("--limit must be a positive integer or 'all'");
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = createSupabaseClient();

  const codes = args.code
    ? [args.code]
    : args.mode === "all"
      ? await loadAllCodes(client, args.limit)
      : await loadIncompleteCodes(client, args.limit);

  const stats = { scanned: codes.length, updated: 0, created: 0, not_found: 0, failed: 0 };
  const startedAt = Date.now();
  const limit = pLimit(SYNC_CONCURRENCY);

  await Promise.all(
    codes.map((code) =>
      limit(async () => {
        try {
          const result = await syncCourseByCode(client, code);
          if (result.status === "updated") stats.updated += 1;
          else if (result.status === "created") stats.created += 1;
          else if (result.status === "not_found") stats.not_found += 1;
          else {
            stats.failed += 1;
            console.error(`[sync-um] ${code} failed: ${result.error}`);
          }
        } catch (error) {
          stats.failed += 1;
          console.error(`[sync-um] ${code} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }),
    ),
  );

  console.log(
    JSON.stringify(
      {
        ...stats,
        durationMs: Date.now() - startedAt,
        mode: args.code ? "code" : args.mode,
        limit: args.limit === null ? "all" : args.limit,
        concurrency: SYNC_CONCURRENCY,
      },
      null,
      2,
    ),
  );

  if (stats.failed > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("[sync-um] fatal:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
