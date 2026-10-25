import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  PREVIEW_READONLY_CODE,
  READONLY_RPC_ALLOWLIST,
  createReadonlyFetch,
  evaluateSupabaseRequest,
  isReadonlyPreview,
} from "@/lib/supabase/readonly-guard";

describe("isReadonlyPreview", () => {
  it("is on only for exactly '1'", () => {
    expect(isReadonlyPreview({ PREVIEW_DB_READONLY: "1" })).toBe(true);
    expect(isReadonlyPreview({})).toBe(false);
    expect(isReadonlyPreview({ PREVIEW_DB_READONLY: "0" })).toBe(false);
    expect(isReadonlyPreview({ PREVIEW_DB_READONLY: "true" })).toBe(false);
    expect(isReadonlyPreview({ PREVIEW_DB_READONLY: "" })).toBe(false);
  });
});

describe("evaluateSupabaseRequest", () => {
  it("allows GET and HEAD on any path", () => {
    expect(evaluateSupabaseRequest("GET", "/rest/v1/course_noporf").allowed).toBe(true);
    expect(evaluateSupabaseRequest("HEAD", "/rest/v1/course_noporf").allowed).toBe(true);
    expect(evaluateSupabaseRequest("get", "/rest/v1/comment").allowed).toBe(true);
  });

  it("allows POST to an allowlisted rpc only", () => {
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/get_schedule_list").allowed).toBe(true);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/get_schedule_list/").allowed).toBe(true);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/consume_rate_limit").allowed).toBe(false);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/insert_comment_and_refresh_prof_stats").allowed).toBe(false);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/admin_apply_schedule").allowed).toBe(false);
  });

  it("matches rpc names exactly", () => {
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/GET_SCHEDULE_LIST").allowed).toBe(false);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/get_schedule_list/extra").allowed).toBe(false);
    expect(evaluateSupabaseRequest("POST", "/rest/v1/rpc/get_schedule_list_x").allowed).toBe(false);
  });

  it("rejects every other write", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post", "patch"]) {
      const decision = evaluateSupabaseRequest(method, "/rest/v1/comment");
      expect(decision.allowed).toBe(false);
    }
    expect(evaluateSupabaseRequest("DELETE", "/storage/v1/object/bucket/file").allowed).toBe(false);
    expect(evaluateSupabaseRequest("POST", "/auth/v1/admin/users").allowed).toBe(false);
  });

  it("rejects unknown methods", () => {
    expect(evaluateSupabaseRequest("OPTIONS", "/rest/v1/comment").allowed).toBe(false);
    expect(evaluateSupabaseRequest("TRACE", "/rest/v1/comment").allowed).toBe(false);
  });

  it("never allowlists consume_rate_limit", () => {
    expect(READONLY_RPC_ALLOWLIST.has("consume_rate_limit")).toBe(false);
  });
});

describe("createReadonlyFetch", () => {
  const ok = () => new Response("[]", { status: 200 });

  it("rejects a write with a PostgREST-shaped 403 and never calls the network", async () => {
    const base = vi.fn(ok);
    const guarded = createReadonlyFetch(base as unknown as typeof fetch);

    const response = await guarded("https://x.supabase.co/rest/v1/comment", {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("content-type")).toContain("application/json");
    const body = await response.json();
    expect(body.code).toBe(PREVIEW_READONLY_CODE);
    expect(typeof body.message).toBe("string");
    expect(base).not.toHaveBeenCalled();
  });

  it("passes reads through with the original arguments", async () => {
    const base = vi.fn(ok);
    const guarded = createReadonlyFetch(base as unknown as typeof fetch);
    const init = { headers: { apikey: "k" } };

    const response = await guarded("https://x.supabase.co/rest/v1/comment?select=*", init);

    expect(response.status).toBe(200);
    expect(base).toHaveBeenCalledWith("https://x.supabase.co/rest/v1/comment?select=*", init);
  });

  it("passes an allowlisted rpc through", async () => {
    const base = vi.fn(ok);
    const guarded = createReadonlyFetch(base as unknown as typeof fetch);

    await guarded("https://x.supabase.co/rest/v1/rpc/get_popular_courses", { method: "POST", body: "{}" });

    expect(base).toHaveBeenCalledTimes(1);
  });

  it("reads the method and url from a Request or URL input", async () => {
    const base = vi.fn(ok);
    const guarded = createReadonlyFetch(base as unknown as typeof fetch);

    const blocked = await guarded(
      new Request("https://x.supabase.co/rest/v1/comment", { method: "DELETE" }),
    );
    expect(blocked.status).toBe(403);

    const allowed = await guarded(new URL("https://x.supabase.co/rest/v1/comment"));
    expect(allowed.status).toBe(200);
    expect(base).toHaveBeenCalledTimes(1);
  });
});

describe("READONLY_RPC_ALLOWLIST", () => {
  const root = process.cwd();
  const sqlFiles = [
    path.join(root, "supabase/schema.sql"),
    ...fs
      .readdirSync(path.join(root, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .map((name) => path.join(root, "supabase/migrations", name)),
  ];
  const sources = sqlFiles.map((file) => fs.readFileSync(file, "utf8"));

  /** Returns every definition body (text between the $tag$ delimiters) of `public.<name>`. */
  function definitionBodies(name: string): string[] {
    const bodies: string[] = [];
    const header = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\s*\\(`, "gi");
    for (const text of sources) {
      for (const match of text.matchAll(header)) {
        const afterHeader = text.slice(match.index! + match[0].length);
        const open = afterHeader.match(/\$([A-Za-z_]*)\$/);
        if (!open || open.index === undefined) continue;
        const delimiter = `$${open[1]}$`;
        const bodyStart = open.index + delimiter.length;
        const bodyEnd = afterHeader.indexOf(delimiter, bodyStart);
        if (bodyEnd === -1) continue;
        bodies.push(afterHeader.slice(bodyStart, bodyEnd));
      }
    }
    return bodies;
  }

  const WRITE_PATTERN =
    /\b(insert\s+into|update\s+[\w."]+\s+set|delete\s+from|truncate\b|alter\s+table|drop\s+(table|function)|create\s+table)/i;

  it.each([...READONLY_RPC_ALLOWLIST])("%s is defined in SQL and contains no write statement", (name) => {
    const bodies = definitionBodies(name);
    expect(bodies.length, `no definition of public.${name} found in supabase/`).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toMatch(WRITE_PATTERN);
    }
  });
});
