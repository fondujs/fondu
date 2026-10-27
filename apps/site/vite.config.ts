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
import type { ShikiTransformer } from 'shiki'
import { defineConfig } from 'vite'

import { markdown } from './markdown.ts'

// fondu.dev: the docs are MDX pages (app/routes/docs/), highlighted at build time (Shiki, both themes: app.css picks
// one), each page exporting its headings (`toc`). Every page is static (routes/_middleware.ts); `bun run build`
// then indexes them for the search (Pagefind). Each page is also Markdown (markdown.ts).
/** ```sh title="npm": the block's title, for <CodeTabs> (components/code.tsx). ```text wrap: lines wrapped (app.css) */
const title: ShikiTransformer = {
  pre(node) {
    const title = /title="([^"]+)"/.exec(this.options.meta?.__raw ?? '')?.[1]
    if (title) node.properties['data-title'] = title
    if (/(^|\s)wrap(\s|$)/.test(this.options.meta?.__raw ?? '')) node.properties['data-wrap'] = ''
  },
}

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
              themes: { light: 'github-light-default', dark: 'github-dark' },
              // its comments' gray, a shade darker: 4.5:1 on the code's background (WCAG AA)
              colorReplacements: { 'github-light-default': { '#6e7781': '#59636e' } },
              defaultColor: false,
              defaultLanguage: 'text',
              langs: [],
              lazy: true,
              transformers: [transformerMetaWordHighlight(), title],
            },
          ],
        ],
      }),
    },
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    fondu({ target: 'cloudflare', prerender: true }),
    tailwindcss(),
    markdown(),
  ],
})
