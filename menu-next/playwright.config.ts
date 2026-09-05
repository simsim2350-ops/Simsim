import { defineConfig, devices } from '@playwright/test'

// Regression suite for the customer-facing menu app. Runs against a real,
// locally-built production server (`next build && next start`) — the same
// artifact class deployed to Preview — using this machine's own .env.local
// (real, publishable/anon-class Supabase credentials only, never hardcoded
// here or in any spec file; CI must supply the same two env vars itself).
export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],

  use: {
    baseURL: 'http://127.0.0.1:4500',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },

  webServer: {
    command: 'npm run build && npm run start -- -p 4500',
    url: 'http://127.0.0.1:4500',
    reuseExistingServer: false,
    timeout: 120_000,
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-360', use: { viewport: { width: 360, height: 740 } } },
    { name: 'mobile-390', use: { viewport: { width: 390, height: 844 } } },
    { name: 'mobile-430', use: { viewport: { width: 430, height: 932 } } },
  ],
})
