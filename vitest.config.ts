import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // tsconfig.json keeps "jsx": "preserve" for Next, so esbuild would otherwise
  // fall back to the classic runtime and require `import React` in every
  // component under test. Next 14 compiles with the automatic runtime.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd()),
    },
  },
  test: {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SECRET_KEY: "test-secret-key",
    },
    environment: "node",
    environmentMatchGlobs: [
      ["tests/components/**", "jsdom"],
      ["tests/ai-elements/**", "jsdom"],
    ],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: true,
    // CopilotKit's React build imports its own CSS, which only Vite (not Node) can load.
    server: { deps: { inline: [/@copilotkit\/react-core/] } },
  },
});
