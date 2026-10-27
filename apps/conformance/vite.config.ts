import fondu from 'fondu/vite'
import { defineConfig } from 'vite'

// The pages the e2e tests compare with the browser's own navigations (e2e/): Node, some pages prerendered
export default defineConfig({
  plugins: [fondu({ target: 'node', prerender: true, progress: false })],
})
