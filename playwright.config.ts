import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'api-tests',
      testDir: './tests/api',
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000/access',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
