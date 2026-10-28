import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ default: { rpc } }));

const HOUR = 60 * 60 * 1000;

async function loadPrune() {
  return (await import("@/lib/assistant/telemetry-store")).maybePruneAssistantTelemetry;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  rpc.mockResolvedValue({ error: null });
});

describe("maybePruneAssistantTelemetry", () => {
  it("prunes at most once every six hours per isolate", async () => {
    const prune = await loadPrune();

    await prune(0);
    expect(rpc).toHaveBeenCalledTimes(1);

    await prune(HOUR);
    await prune(5 * HOUR);
    expect(rpc).toHaveBeenCalledTimes(1);

    await prune(7 * HOUR);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("prune_assistant_telemetry");
  });

  it("swallows and logs a prune failure without retrying immediately", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rpc.mockRejectedValueOnce(new Error("db down"));
    const prune = await loadPrune();

    await expect(prune(0)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();

    await prune(HOUR);
    expect(rpc).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("never writes in read-only preview", async () => {
    vi.stubEnv("PREVIEW_DB_READONLY", "1");
    const prune = await loadPrune();

    await prune(0);

    expect(rpc).not.toHaveBeenCalled();
  });
});
