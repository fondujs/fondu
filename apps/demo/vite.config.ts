import { cloudflare } from '@cloudflare/vite-plugin'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import fondu from 'fondu/vite'
import { defineConfig } from 'vite'

// The Cloudflare plugin runs the Worker (wrangler.jsonc `main`: app/server.ts) in workerd, in dev too, with its
// bindings (D1). One `vite build` writes the client and the Worker; `wrangler deploy` ships it. Paraglide compiles
// messages/ to app/paraglide/ (the /i18n page): the URL decides the language; setLocale() keeps a choice in a
// cookie too, which only a first visit reads (routes/[[locale]]/_middleware.ts). Its links end without a slash.
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './app/paraglide',
      strategy: ['url', 'cookie', 'baseLocale'],
      trailingSlash: 'never',
    }),
    fondu({ target: 'cloudflare' }),
    tailwindcss(),
  ],
})
