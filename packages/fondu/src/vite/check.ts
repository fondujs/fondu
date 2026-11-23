import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseAst, type Plugin } from 'vite'

import { checkRouteFiles, isRouteFile } from '../paths.js'
import { exportedNames } from './strip.js'
import { walk } from './typegen.js'

/** The checks of the server's startup, on every file of `app/routes/` (Vite's globs don't list them all). */
export function checkRoutes(): Plugin {
  let root = process.cwd()
  return {
    name: 'fondu:check-routes',
    apply: 'build',
    configResolved(c) {
      root = c.root
    },
    buildStart() {
      checkRouteFiles(walk(join(root, 'app/routes')))
    },
  }
}

const MIDDLEWARE = /^(?:[^_.][^/]*\/)*_middleware\.ts$/

/**
 * Whether a route file or a `_middleware.ts` exports `prerender`, from the names in the source: known before the
 * client and server builds, which prerendering changes (the entry, what navigations read). MDX pages have no exports of
 * their own to set it.
 */
export function routesPrerender(root: string): boolean {
  const dir = join(root, 'app/routes')
  return walk(dir).some((file) => {
    if (file.endsWith('.mdx') || !(isRouteFile(file) || MIDDLEWARE.test(file))) return false
    const code = readFileSync(join(dir, file), 'utf8')
    if (!code.includes('prerender')) return false
    try {
      const { body } = parseAst(code, { lang: file.endsWith('.tsx') ? 'tsx' : 'ts' })
      return exportedNames(body as never).includes('prerender')
    } catch (error) {
      throw new Error(`fondu: routes/${file}: ${(error as Error).message}`, { cause: error })
    }
  })
}
