import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;
const only = process.env.E2E_PROJECT;

const projects = [
  {
    name: "chromium",
    use: { ...devices["Desktop Chrome"], channel: process.env.E2E_CHROMIUM_CHANNEL || undefined },
  },
  {
    name: "webkit-iphone",
    use: { ...devices["iPhone 13"] },
  },
].filter((project) => !only || project.name === only);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL, trace: "off" },
  projects,
  webServer: {
    command: `pnpm exec next dev --port ${port}`,
    url: `${baseURL}/tasarim`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
