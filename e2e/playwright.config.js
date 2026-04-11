import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests",
  timeout: 10_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./global-setup.js",
  use: {
    baseURL: process.env.E2E_BASE_URL,
  },
})
