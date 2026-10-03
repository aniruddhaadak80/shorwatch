import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke test for the primary journey.
 *
 * By default Playwright starts a real local server with the zero-config embedded
 * store, so no secrets and no external database are involved. Set
 * SKIP_WEBSERVER=1 together with BASE_URL to run against an existing
 * deployment instead.
 */
const external = process.env.SKIP_WEBSERVER === "1";
const port = process.env.E2E_PORT ?? "3500";
const baseURL = process.env.BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
        command: `node scripts/start-local.mjs ${port} .pglite-e2e`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
      },
});