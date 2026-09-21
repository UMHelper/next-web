import { describe, expect, it, vi } from "vitest";
import { createRelayClient } from "@/lib/update/relay-client";

describe("createRelayClient", () => {
  it("points supabase-js at the relay base url", () => {
    const client = createRelayClient({
      origin: "http://localhost:3000",
      publishableKey: "sb_publishable_test",
    });
    expect((client as any).supabaseUrl).toBe("http://localhost:3000/api/admin/supabase");
  });

  it("strips Authorization so Clerk falls back to the session cookie", async () => {
    const globalFetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", globalFetch);

    const client = createRelayClient({
      origin: "http://localhost:3000",
      publishableKey: "sb_publishable_test",
    });

    await (client as any).fetch("http://localhost:3000/api/admin/supabase/rest/v1/rpc/admin_reset_offered", {
      method: "POST",
      headers: { Authorization: "Bearer evil", apikey: "sb_publishable_test" },
      body: "{}",
    });

    const [, init] = globalFetch.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(init.credentials).toBe("same-origin");
    vi.unstubAllGlobals();
  });
});
