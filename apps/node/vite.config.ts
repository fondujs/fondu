import { defineConfig } from 'vite'
import fondu from 'fondu/vite'

// dev: `vite`; production: `vite build --mode client && vite build`, then `node dist/index.js`
// (with target 'bun': `bun dist/index.js`)
export default defineConfig({
  plugins: [fondu({ target: process.env.TARGET === 'bun' ? 'bun' : 'node' })],
})
