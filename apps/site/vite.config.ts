import { cloudflare } from '@cloudflare/vite-plugin'
import mdx from '@mdx-js/rollup'
import rehypeShiki from '@shikijs/rehype'
import { transformerMetaWordHighlight } from '@shikijs/transformers'
import rehypeExtractToc from '@stefanprobst/rehype-extract-toc'
import rehypeExportToc from '@stefanprobst/rehype-extract-toc/mdx'
import tailwindcss from '@tailwindcss/vite'
import fondu from 'fondu/vite'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import { defineConfig } from 'vite'

import { llms } from './llms.ts'

// fondu.dev: the docs are MDX pages (app/pages/docs/), highlighted at build time (Shiki, both themes: app.css picks
// one), each page exporting its headings (`toc`). Every page is static (routes/_middleware.ts); `bun run build`
// then indexes them for the search (Pagefind).
export default defineConfig({
  plugins: [
    {
      enforce: 'pre',
      ...mdx({
        providerImportSource: '@mdx-js/react',
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          rehypeExtractToc,
          [rehypeExportToc, { name: 'toc' }],
          [
            rehypeShiki,
            {
              themes: { light: 'vitesse-light', dark: 'vitesse-dark' },
              defaultColor: false,
              transformers: [transformerMetaWordHighlight()],
            },
          ],
        ],
      }),
    },
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    fondu({ target: 'cloudflare', prerender: true }),
    tailwindcss(),
    llms(),
  ],
})
