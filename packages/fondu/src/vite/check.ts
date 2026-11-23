import { join } from 'node:path'

import type { Plugin } from 'vite'

import { checkSpecialFiles } from '../paths.js'
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
      checkSpecialFiles(walk(join(root, 'app/routes')))
    },
  }
}
