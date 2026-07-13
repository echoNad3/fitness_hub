import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Windows already has Chrome; CI installs an isolated Chromium build in the workflow.
    channel: process.env.CI ? undefined : 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'narrow-phone', use: { viewport: { width: 360, height: 800 } } },
    { name: 'pixel-9-pro-xl', use: { viewport: { width: 412, height: 915 } } },
  ],
  webServer: {
    // Launch Vite directly so Playwright owns one process and can stop it cleanly on Windows.
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
