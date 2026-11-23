import { cloudflare } from '@cloudflare/vite-plugin'
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from '@tailwindcss/vite'
import fondu from 'fondu/vite'
import { defineConfig } from 'vite'

// The Cloudflare plugin runs the Worker in workerd in dev too, with its bindings (D1). setLocale() keeps a choice in a
// cookie too, which only a first visit reads (routes/[[locale]]/_middleware.ts).
export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './app/paraglide',
      strategy: ['url', 'cookie', 'baseLocale'],
      trailingSlash: 'never',
    }),
    fondu({ target: 'cloudflare', progress: { forms: false } }),
    tailwindcss(),
  ],
})
