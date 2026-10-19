import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { createSupabaseAdminClient } from "@/lib/supabase/shared";

type ClientOptions = { global?: { fetch?: typeof fetch } };

function optionsPassedToCreateClient(): ClientOptions {
  const call = createClient.mock.calls.at(-1) as unknown as [string, string, ClientOptions];
  return call[2];
}

describe("createSupabaseAdminClient", () => {
  beforeEach(() => {
    createClient.mockClear();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("installs no custom fetch by default", () => {
    createSupabaseAdminClient();
    expect(optionsPassedToCreateClient().global).toBeUndefined();
  });

  it.each(["0", "true", ""])("installs no custom fetch when the flag is %j", (value) => {
    vi.stubEnv("PREVIEW_DB_READONLY", value);
    createSupabaseAdminClient();
    expect(optionsPassedToCreateClient().global).toBeUndefined();
  });

  it("installs a guard fetch that blocks writes when the flag is 1", async () => {
    vi.stubEnv("PREVIEW_DB_READONLY", "1");
    const network = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", network);

    createSupabaseAdminClient();
    const guarded = optionsPassedToCreateClient().global?.fetch;
    expect(guarded).toBeTypeOf("function");

    const blocked = await guarded!("https://x.supabase.co/rest/v1/comment", { method: "POST" });
    expect(blocked.status).toBe(403);
    expect(network).not.toHaveBeenCalled();

    const read = await guarded!("https://x.supabase.co/rest/v1/comment");
    expect(read.status).toBe(200);
    expect(network).toHaveBeenCalledTimes(1);
  });
});
