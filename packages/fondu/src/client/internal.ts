/**
 * For the Vite plugin only (the entries it generates: virtual:fondu/entry, virtual:fondu/ssr), not for an app: it may
 * change in any release. It re-exports the module `fondu/client` does (./app.js), so the two share one React context
 * and one navigation state: the plugin's optimizeDeps pre-bundles both in one run (vite/index.ts).
 */
export { __entry, renderPage } from './app.js'
