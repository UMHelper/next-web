import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261028_assistant_admin_ops.sql", "utf8");
const replayCapMigration = readFileSync(
  "supabase/migrations/20261101_assistant_turn_replay_cap.sql",
  "utf8",
);
const minOnlyMigration = readFileSync(
  "supabase/migrations/20261029_assistant_limit_min_only.sql",
  "utf8",
);
const snapshot = readFileSync("supabase/schema.sql", "utf8");

describe("assistant admin ops migration", () => {
  it("adds bounded nullable limit columns", () => {
    expect(migration).toContain("ai_quota_per_hour integer");
    expect(migration).toContain(
      "check (ai_quota_per_hour is null or ai_quota_per_hour between 1 and 500)",
    );
    expect(migration).toContain("ai_max_steps integer");
    expect(migration).toContain("check (ai_max_steps is null or ai_max_steps between 1 and 12)");
  });

  it("creates the idempotent turn ledger", () => {
    expect(migration).toContain("create table if not exists public.assistant_turn_charges");
    expect(migration).toContain("primary key (user_hash, turn_key)");
  });

  it("creates content-free usage events", () => {
    expect(migration).toContain("create table if not exists public.assistant_usage_events");
    expect(migration).toContain("outcome text not null");
    for (const forbidden of ["prompt", "reply", "content", "message_text"]) {
      expect(migration).not.toMatch(new RegExp(`\\b${forbidden}\\b`, "i"));
    }
  });

  it("serializes a user and consumes both windows only after both checks", () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(target_user_hash, 0))");
    const fn = migration.slice(migration.indexOf("create or replace function public.claim_assistant_turn"));
    expect(fn.indexOf("if hour_count + 1 > hour_limit")).toBeLessThan(
      fn.indexOf("insert into public.request_rate_limits"),
    );
    expect(fn.indexOf("if day_count + 1 > day_limit")).toBeLessThan(
      fn.indexOf("insert into public.request_rate_limits"),
    );
    expect(fn).toContain("on conflict (user_hash, turn_key) do update");
  });

  it("grants only service_role and reloads PostgREST", () => {
    expect(migration).toContain(
      "revoke all on public.assistant_usage_events from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant select, insert, update on public.assistant_usage_events to service_role",
    );
    expect(migration).toContain("grant execute on function public.claim_assistant_turn");
    expect(migration).toContain("notify pgrst, 'reload schema'");
    expect(snapshot).toContain("assistant_turn_charges");
    expect(snapshot).toContain("assistant_usage_events");
  });

  it("keeps the bootstrap snapshot runnable without replaying migrations", () => {
    expect(snapshot).toContain("create table if not exists public.request_rate_limits");
    expect(snapshot).toContain("create or replace function public.consume_rate_limit(");
    expect(snapshot).toContain("create or replace function public.claim_assistant_turn(");
    expect(snapshot).toContain("create or replace function public.assistant_usage_daily(");
    expect(snapshot).toContain("create or replace function public.prune_assistant_telemetry(");
    expect(snapshot).not.toContain("are defined in supabase/migrations");
  });

  it("stays compatible with the pinned Postgres 15 local stack", () => {
    expect(snapshot).not.toContain("transaction_timeout");
    expect(snapshot).toContain("create schema if not exists public;");
  });
});

describe("assistant turn replay cap migration", () => {
  it("caps uncharged replays before re-entering the quota windows", () => {
    expect(replayCapMigration).toContain("charge_continuations");
    expect(replayCapMigration).toContain("coalesce(charge_continuations, 0) < 7");
    expect(replayCapMigration).toContain("pg_advisory_xact_lock(hashtextextended(target_user_hash, 0))");
    expect(snapshot).toContain("coalesce(charge_continuations, 0) < 7");
  });
});

describe("assistant limit min-only checks", () => {
  it("relaxes column checks in the follow-up migration", () => {
    expect(minOnlyMigration).toContain("app_config_ai_quota_per_hour_check");
    expect(minOnlyMigration).toContain("ai_quota_per_hour is null or ai_quota_per_hour >= 1");
    expect(minOnlyMigration).toContain("ai_history_turns is null or ai_history_turns >= 0");
    expect(minOnlyMigration).not.toContain("between 1 and 500");
  });

  it("uses min-only checks in the bootstrap snapshot", () => {
    expect(snapshot).toContain("ai_quota_per_hour is null or ai_quota_per_hour >= 1");
    expect(snapshot).toContain("ai_history_turns is null or ai_history_turns >= 0");
    expect(snapshot).not.toMatch(/ai_quota_per_hour between 1 and 500/i);
  });
});
