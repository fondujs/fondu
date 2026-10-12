import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import fondu from 'fondu/vite'
import { defineConfig } from 'vite'

// The Cloudflare plugin runs the Worker (wrangler.jsonc `main`: app/server.ts) in workerd, in dev too.
// One `vite build` writes the client and the Worker; `wrangler deploy` ships it.
export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), fondu({ target: 'cloudflare' }), tailwindcss()],
})
