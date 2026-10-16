import tailwindcss from '@tailwindcss/vite'
import fondu from 'fondu/vite'
import { defineConfig } from 'vite'

// dev: `vite`; production: `vite build` (the client into dist/client, the server into
// dist/server), then `bun dist/server/index.js`
export default defineConfig({
  plugins: [fondu({ target: 'bun' }), tailwindcss()],
})
