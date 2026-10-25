import { relative, sep } from 'node:path'

import type { Plugin } from 'vite'

type CacheKeyGenerator = (context: { id: string }) => string | false | undefined
type CacheKeyContext = {
  defineCacheKeyGenerator?: (generator: CacheKeyGenerator) => void
  /** Vitest 4's name for it */
  experimental_defineCacheKeyGenerator?: (generator: CacheKeyGenerator) => void
}

/**
 * Vitest's file cache keys a transformed module by its code. The entry's transform reads more than that: `app/app.tsx`
 * is not cached, its transform writing the lists of pages and layouts (`import.meta.glob`) and the code Fondu's options
 * add. Vitest itself skips only modules whose own code has `import.meta.glob`.
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
      define?.(({ id }) =>
        relative(root, id.split('?')[0]!).split(sep).join('/') === entry ? false : undefined,
      )
    },
  }
}
