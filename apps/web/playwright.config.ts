import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the GitHub Pages (demo) build served by `vite preview`.
 * The demo has no backend, so these tests cover the UI shell, practice mode against bots,
 * the demo labelling, CSP and the absence of third-party requests. Multiplayer, auth and
 * admin flows are covered by the Worker integration tests (apps/worker/test).
 *
 * Locally an installed Chrome can be used: PW_CHANNEL=chrome pnpm e2e
 */
const BASE = "/croco-games/";
const channel = process.env["PW_CHANNEL"];

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:4173${BASE}`,
    trace: "retain-on-failure",
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], ...(channel ? { channel } : {}) } },
    { name: "mobile", use: { ...devices["Pixel 7"], ...(channel ? { channel } : {}) } },
  ],
  webServer: {
    command: `pnpm build:pages && pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort`,
    url: `http://127.0.0.1:4173${BASE}`,
    env: { VITE_BASE_PATH: BASE },
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
