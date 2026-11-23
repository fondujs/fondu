import fondu from 'fondu/vite'
import { defineConfig } from 'vite'

// The pages the e2e tests compare with the browser's own navigations (e2e/): Node, some pages prerendered.
// `FONDU_VIEW_TRANSITIONS=1`: the build with `viewTransitions` on, every navigation's default. The Playwright config
// selects its commit/history cases; the transition specs remove the browser API per case to check the fallback.

export default defineConfig({
  plugins: [
    fondu({
      target: 'node',
      progress: false,
      viewTransitions: process.env.FONDU_VIEW_TRANSITIONS === '1',
    }),
  ],
})
