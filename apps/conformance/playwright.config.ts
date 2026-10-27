import { defineConfig, devices } from '@playwright/test'

// Each case runs twice, with fondu/client and without JavaScript (the browser's own navigation), in each engine.
// `bun run test` here builds the app, then runs it; `-- --project=chromium` for one engine.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // CI: a case that fails is run once more, then reported as flaky if it passes (with a trace of the retry)
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3100', trace: 'on-first-retry' },
  webServer: { command: 'node dist/server/index.js', port: 3100, env: { PORT: '3100' } },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
})
