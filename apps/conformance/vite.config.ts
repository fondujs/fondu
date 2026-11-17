import fondu from 'fondu/vite'
import { defineConfig, type Plugin } from 'vite'

// The pages the e2e tests compare with the browser's own navigations (e2e/): Node, some pages prerendered.
// `FONDU_VIEW_TRANSITIONS=1`: the build with `viewTransitions` on, every navigation's default, and the suite runs again
// against it (CI does both).
// `FONDU_VT_NO_API=1` (with it): the browser has no `document.startViewTransition`, whatever its engine
const noApi: Plugin = {
  name: 'conformance:no-view-transitions',
  transform: {
    filter: { id: /virtual:fondu\/entry/ },
    handler: (code) =>
      `if (typeof document !== 'undefined') delete Document.prototype.startViewTransition\n${code}`,
  },
}

export default defineConfig({
  plugins: [
    fondu({
      target: 'node',
      prerender: true,
      progress: false,
      viewTransitions: process.env.FONDU_VIEW_TRANSITIONS === '1',
    }),
    ...(process.env.FONDU_VT_NO_API === '1' ? [noApi] : []),
  ],
})
