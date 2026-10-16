import type { Toc } from '@stefanprobst/rehype-extract-toc'

import type { TocItem } from '#/docs.ts'

// Each MDX page exports `toc`, its headings (vite.config.ts: rehype-extract-toc); the docs layout lists the h2s and h3s
const tocs = import.meta.glob<Toc>('../pages/docs/**/*.mdx', { import: 'toc' })

export async function tocOf(slug: string): Promise<TocItem[]> {
  const flat = (toc: Toc): TocItem[] =>
    toc.flatMap((e) => [
      ...(e.id && (e.depth === 2 || e.depth === 3)
        ? [{ id: e.id, title: e.value, depth: e.depth as 2 | 3 }]
        : []),
      ...flat(e.children ?? []),
    ])
  return flat((await tocs[`../pages/docs/${slug || 'index'}.mdx`]?.()) ?? [])
}
