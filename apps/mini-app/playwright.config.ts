import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "telegram-compact",
      use: {
        ...devices["Pixel 7"],
        viewport: { height: 760, width: 390 },
      },
    },
    {
      name: "telegram-fullscreen",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 900, width: 900 },
      },
    },
  ],
  webServer: {
    command:
      "NEXT_PUBLIC_ENABLE_TEST_BRIDGE=true pnpm exec next dev --hostname 127.0.0.1 --port 3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:3100/health/live",
  },
});
