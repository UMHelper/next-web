import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    testTimeout: 30 * 60 * 1000,
    env: { COPILOTKIT_TELEMETRY_DISABLED: "true" },
  },
});
