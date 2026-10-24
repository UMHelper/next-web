#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { Client } from "pg";

/**
 * Regenerates the static equivalence redirect map used by next.config.js.
 *
 * Old course URLs are redirected by Next's built-in redirects (true 308). The
 * page-level `permanentRedirect` remains as a fallback for equivalences added
 * after the last build, but regenerating this file is what keeps the HTTP
 * status a real 308 for every known pair.
 */
function loadEnv() {
  if (process.env.SUPABASE_DB_URL) return;
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI can provide SUPABASE_DB_URL directly.
  }
}

loadEnv();

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("[equivalence-redirects] SUPABASE_DB_URL is not configured");
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  const { rows } = await client.query(`
    select equivalent_code, primary_code
    from public.course_equivalences
    order by equivalent_code, primary_code
  `);

  // A historical code can be shared by more than one new code (TLL C/P).
  // Keep the first primary, matching resolve_course_code()'s ordering.
  const mapping = {};
  for (const row of rows) {
    const equivalent = String(row.equivalent_code ?? "").toUpperCase();
    const primary = String(row.primary_code ?? "").toUpperCase();
    if (!equivalent || !primary || mapping[equivalent]) continue;
    mapping[equivalent] = primary;
  }

  writeFileSync(
    "lib/course-equivalences.generated.json",
    `${JSON.stringify(mapping, null, 2)}\n`,
  );
  console.log(`[equivalence-redirects] wrote ${Object.keys(mapping).length} pairs`);
} finally {
  await client.end();
}
