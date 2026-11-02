import { defineConfig, devices } from "@playwright/test";

// End-to-end stack on its own ports (5190/2590), so it never collides with an
// agent's dev stack (HANDOFF.md section 5). Run with `pnpm test:e2e`.
const WEB_PORT = 5190;
const SERVER_PORT = 2590;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Schedule bound: ready ~70 s + ~230 s, pills up to ~190 s after online,
  // then the walk observation — all serial worst cases under SwiftShader.
  timeout: 900_000,
  expect: { timeout: 90_000 },
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], headless: true },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter @office/server dev",
      // Relaxed heartbeat: headless software rendering stalls past 3s x 2 (P3-A).
      env: { PORT: String(SERVER_PORT), WS_PING_RELAXED: "1" },
      port: SERVER_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @office/web dev",
      env: {
        WEB_PORT: String(WEB_PORT),
        VITE_SERVER_URL: `http://localhost:${SERVER_PORT}`,
      },
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
