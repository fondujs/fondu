import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import fondu from 'fondu/vite'

// The Cloudflare plugin runs the Worker (wrangler.jsonc `main`: app/server.ts) in workerd, in dev too, with its
// bindings (D1). One `vite build` writes the client and the Worker; `wrangler deploy` ships it.
export default defineConfig({
  plugins: [cloudflare({ viteEnvironment: { name: 'ssr' } }), fondu({ target: 'cloudflare' }), tailwindcss()],
})
