#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { Client } from "pg";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/apply-sql.mjs <file.sql>");
  process.exit(1);
}

if (!process.env.SUPABASE_DB_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // .env.local is optional; the environment may be provided by the shell.
  }
}

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("SUPABASE_DB_URL is required, or run the SQL in Supabase Dashboard");
  process.exit(2);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  const sql = readFileSync(file, "utf8");
  const result = await client.query(sql);
  const results = Array.isArray(result) ? result : [result];
  for (const item of results) {
    if (item.rows?.length) {
      console.table(item.rows);
    }
  }
  console.log(`SQL applied: ${file}`);
} catch (error) {
  console.error(`SQL failed: ${file}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
