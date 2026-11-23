import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseAst, type Plugin } from 'vite'

import { checkRouteFiles, isRouteFile } from '../paths.js'
import { exportedNames } from './strip.js'
import { walk } from './typegen.js'

// Vite's globs don't list every file of app/routes/
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

// Read from the source before the builds, which prerendering changes. MDX pages can't set it.
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
