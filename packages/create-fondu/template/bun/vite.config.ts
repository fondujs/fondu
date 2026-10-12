import tailwindcss from '@tailwindcss/vite'
import fondu from 'fondu/vite'
import { defineConfig } from 'vite'

// dev: `vite`; production: `vite build --mode client && vite build`, then `bun dist/index.js`
export default defineConfig({
  plugins: [fondu({ target: 'bun' }), tailwindcss()],
})
