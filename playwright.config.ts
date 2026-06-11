import { defineConfig } from "@playwright/test";

// E2E smoke against the production server in mock mode: hermetic (no API key,
// no real transcripts needed for the tiles; fixtures replay through the real
// reducer) and exactly the binary users run. `pnpm build` must have run first
// (CI does; locally `pnpm build` or `clarmy start` once).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:3123",
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  },
  webServer: {
    command: "node --experimental-transform-types server.ts",
    url: "http://127.0.0.1:3123/api/health",
    timeout: 60_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: "production",
      COCKPIT_PORT: "3123",
      COCKPIT_MOCK: "1",
      COCKPIT_NO_RESUME: "1",
    },
  },
});
