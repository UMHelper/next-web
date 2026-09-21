import { describe, expect, it } from "vitest";
import { createRelayClient } from "@/lib/update/relay-client";

describe("createRelayClient", () => {
  it("points supabase-js at the relay base url", () => {
    const client = createRelayClient({
      origin: "http://localhost:3000",
      publishableKey: "sb_publishable_test",
    });
    expect((client as any).supabaseUrl).toBe("http://localhost:3000/api/admin/supabase");
  });
});
