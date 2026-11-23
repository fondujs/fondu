import { defineConfig, devices } from '@playwright/test'

// `conformance.spec.ts` compares fondu/client with the browser's own navigation in each engine.
// `bun run test` here builds the app, then runs it; `-- --project=chromium` for one engine.
// `CONFORMANCE_PORT` moves the app and the tests to another port (two runs on one machine), 3100 by default.
const port = Number(process.env.CONFORMANCE_PORT ?? 3100)
const transitions = process.env.FONDU_VIEW_TRANSITIONS === '1'
const mode = transitions ? 'on' : 'off'

export default defineConfig({
  testDir: 'e2e',
  // The on build exercises the transition commit/history path, not server rendering or validation itself.
  // Keep conformance's JS cases (including its unique form cases); CI reuses the off build's native outcomes.
  testMatch: transitions
    ? [
        '**/conformance.spec.ts',
        '**/transitions.spec.ts',
        '**/transition-per-navigation.spec.ts',
        '**/traversal.spec.ts',
        '**/scroll-storage.spec.ts',
        '**/shallow.spec.ts',
        '**/shallow-path.spec.ts',
        '**/links.spec.ts',
        '**/static-query.spec.ts',
        '**/dialog.spec.ts',
        '**/search.spec.ts',
      ]
    : undefined,
  // A browser with JavaScript disabled cannot see the build flag; these cases run in the off build only.
  grepInvert: transitions ? /without JavaScript/ : undefined,
  fullyParallel: true,
  // CI: a case that fails is run once more, then reported as flaky if it passes (with a trace of the retry)
  retries: process.env.CI ? 1 : 0,
  // Keep every build's traces and per-spec timings; a later run must not clear an earlier failure.
  outputDir: `test-results/${mode}`,
  reporter: process.env.CI
    ? [['github'], ['json', { outputFile: `test-results/${mode}.json` }]]
    : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'on-first-retry' },
  webServer: { command: 'node dist/server/index.js', port, env: { PORT: String(port) } },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
    { name: 'firefox', use: devices['Desktop Firefox'] },
    { name: 'webkit', use: devices['Desktop Safari'] },
  ],
})
