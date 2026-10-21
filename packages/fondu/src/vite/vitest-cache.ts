import { relative, sep } from 'node:path'

import type { Plugin } from 'vite'

import { isPageFile } from '../paths.js'
import { layoutChain } from './layouts.js'

type CacheKeyGenerator = (context: { id: string }) => string | false | undefined
type CacheKeyContext = {
  defineCacheKeyGenerator?: (generator: CacheKeyGenerator) => void
  /** Vitest 4's name for it */
  experimental_defineCacheKeyGenerator?: (generator: CacheKeyGenerator) => void
}

/**
 * Vitest's file cache keys a transformed module by its code. Two modules' transforms read more than that, so the next
 * run would see them as they were: a page's layout chain (the `_layout.tsx` files above it) goes in its key; the
 * entry, `app/app.tsx`, is not cached, its transform writing the list of pages (`@inertiajs/vite`'s glob) and the code
 * Fondu's options add. Vitest itself skips only modules whose own code has `import.meta.glob`.
 */
export function vitestCache(
  entry: string,
): Plugin & { configureVitest(context: CacheKeyContext): void } {
  let root = process.cwd()
  return {
    name: 'fondu:vitest-cache',
    configResolved(c) {
      root = c.root
    },
    configureVitest(context) {
      const define = context.defineCacheKeyGenerator ?? context.experimental_defineCacheKeyGenerator
      define?.(({ id }) => {
        const file = relative(root, id.split('?')[0]!).split(sep).join('/')
        if (file === entry) return false
        const page = file.startsWith('app/pages/') ? file.slice('app/pages/'.length) : undefined
        if (page === undefined || !isPageFile(page)) return undefined
        return `fondu:layouts:${layoutChain(root, page).join('|')}`
      })
    },
  }
}
