#!/usr/bin/env node
/**
 * Apply pending SQL migrations from supabase/migrations before build/deploy.
 *
 * The repository applied migrations by hand until now, so there is no historical
 * ledger. Files up to and including BASELINE_THROUGH are recorded as applied on
 * the first run instead of being replayed (they are not all idempotent). Only
 * files added after that point are executed automatically.
 *
 * Ledger: public.schema_migrations(filename, checksum, applied_at)
 *
 * Usage:
 *   node scripts/db-migrate.mjs             apply pending; skip when no DB URL
 *   node scripts/db-migrate.mjs --required  apply pending; fail when no DB URL
 *   node scripts/db-migrate.mjs --dry-run   report only, never writes
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");
const LEDGER = "public.schema_migrations";
// Last migration that predates this runner (it was applied manually everywhere).
const BASELINE_THROUGH = "20261018_assistant_access.sql";
const LOCK_KEY = 7242201;
const CONNECT_ATTEMPTS = 3;

const args = new Set(process.argv.slice(2));
const required = args.has("--required");
const dryRun = args.has("--dry-run");

const log = (message) => console.log(`[db:migrate] ${message}`);
const warn = (message) => console.warn(`[db:migrate] WARN ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadDatabaseUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;

  for (const file of [".env.local", ".env"]) {
    const path = join(ROOT, file);
    if (!existsSync(path)) continue;
    try {
      process.loadEnvFile(path);
    } catch {
      // Ignore a malformed env file; the caller still gets the eventual error.
    }
    if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  }

  return undefined;
}

function checksum(file) {
  return createHash("sha256").update(readFileSync(join(MIGRATIONS_DIR, file))).digest("hex");
}

async function connect(url) {
  let lastError;
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
    const client = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15_000,
    });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      log(`connect attempt ${attempt}/${CONNECT_ATTEMPTS} failed: ${error.message}`);
      if (attempt < CONNECT_ATTEMPTS) await sleep(1500 * attempt);
    }
  }
  throw lastError ?? new Error("could not connect");
}

async function main() {
  if (process.env.PREVIEW_DB_READONLY === "1" || process.env.PREVIEW_MODE === "1") {
    log("preview/read-only mode detected, skipping migrations");
    return;
  }

  const url = loadDatabaseUrl();
  if (!url) {
    if (required) {
      throw new Error(
        "SUPABASE_DB_URL is not set; refusing to build/deploy without applying migrations",
      );
    }
    warn("SUPABASE_DB_URL is not set; skipping migrations");
    return;
  }

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    log("no migrations found");
    return;
  }

  const client = await connect(url);
  try {
    await client.query("select pg_advisory_lock($1::bigint)", [LOCK_KEY]);

    const ledger = await client.query("select to_regclass($1) as table_name", [LEDGER]);
    const hasLedger = Boolean(ledger.rows[0]?.table_name);
    const applied = new Map();
    if (hasLedger) {
      const rows = await client.query(`select filename, checksum from ${LEDGER}`);
      for (const row of rows.rows) applied.set(row.filename, row.checksum);
    }

    const baseline = [];
    const pending = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      if (file <= BASELINE_THROUGH) baseline.push(file);
      else pending.push(file);
    }

    for (const [file, sum] of applied) {
      if (!files.includes(file)) warn(`ledger references a missing file: ${file}`);
      else if (checksum(file) !== sum) warn(`migration changed after it was applied: ${file}`);
    }

    log(`target ${new URL(url).host} (ledger ${hasLedger ? "present" : "missing"})`);
    if (dryRun) {
      log(`baseline to record: ${baseline.length}; pending to apply: ${pending.length}`);
      for (const file of pending) log(`pending: ${file}`);
      return;
    }

    if (!hasLedger) {
      await client.query(`
        create table if not exists ${LEDGER} (
          filename text primary key,
          checksum text not null,
          applied_at timestamptz not null default now()
        )
      `);
      await client.query(`alter table ${LEDGER} enable row level security`);
      await client.query(`revoke all on ${LEDGER} from public, anon, authenticated`);
      log(`created ${LEDGER}`);
    }

    let recorded = 0;
    for (const file of baseline) {
      await client.query(
        `insert into ${LEDGER} (filename, checksum) values ($1, $2)
         on conflict (filename) do nothing`,
        [file, checksum(file)],
      );
      recorded += 1;
    }
    if (recorded > 0) {
      log(`recorded ${recorded} pre-automation migration(s) without replaying them`);
    }

    let appliedCount = 0;
    for (const file of pending) {
      log(`applying ${file}`);
      try {
        await client.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      } catch (error) {
        throw new Error(`migration failed: ${file}\n${error.message}`);
      }
      await client.query(
        `insert into ${LEDGER} (filename, checksum) values ($1, $2)
         on conflict (filename) do update set checksum = excluded.checksum`,
        [file, checksum(file)],
      );
      appliedCount += 1;
      log(`applied ${file}`);
    }

    log(appliedCount === 0 ? "database is up to date" : `${appliedCount} migration(s) applied`);
  } finally {
    await client.query("select pg_advisory_unlock($1::bigint)", [LOCK_KEY]).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(`[db:migrate] ERROR ${error.message}`);
  process.exitCode = 1;
});
