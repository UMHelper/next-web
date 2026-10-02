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
    environment: "node",
    environmentMatchGlobs: [["tests/components/**", "jsdom"]],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: true,
  },
});
