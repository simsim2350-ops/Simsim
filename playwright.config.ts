import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  // Shared settings applied to every project
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
    // Custom Chromium binary for CI (Linux runner provides /usr/bin/chromium)
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium' },
  },

  projects: [
    // Default project — preserves the existing Desktop Chrome behaviour.
    // All legacy npm scripts pin --project=desktop to keep this behaviour explicit.
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },

    // Mobile project — opt-in via --project=mobile or npm run test:e2e:mobile.
    // Device: Pixel 7 (412×915 CSS px, deviceScaleFactor 2.625, hasTouch true,
    // defaultBrowserType chromium — consistent with the shared launchOptions above).
    // Primary use-case: public menu / cart / checkout flow tested at mobile viewport.
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
