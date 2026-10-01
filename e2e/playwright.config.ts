import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://frontend";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  // Login lockout is keyed on email+IP; serial runs keep the suite deterministic.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: "/tmp/e2e-results",
  use: {
    baseURL,
    screenshot: "off",
    video: "off",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
