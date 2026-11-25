import { defineConfig } from "vitest/config";

// Unit tests only; Playwright specs in e2e/ are run by `pnpm e2e`.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
