import { existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import type { Plugin } from 'vite'

import { isPageFile, layoutsOf } from '../paths.js'

const LAYOUT_EXTENSIONS = ['.tsx', '.jsx']

/**
 * `_layout.tsx` in a directory of `app/pages/` wraps the pages below it, outermost first: each page module imports
 * its chain and sets it as the component's `layout` (Inertia's page-level layout), unless the page set its own. So a
 * layout is in the chunks of its pages only, and stays mounted while visits stay among them. A page with no
 * `_layout.tsx` above it gets `createInertiaApp({ layout })`, as Inertia gives any page without its own.
 */
export function layouts(): Plugin {
  let root = process.cwd()
  const pagesDir = () => join(root, 'app/pages')
  // the `_layout.tsx` of a directory of app/pages/ ('' is the root), if there is one
  const layoutFile = (dir: string) =>
    LAYOUT_EXTENSIONS.map((ext) => join(pagesDir(), dir, `_layout${ext}`)).find((f) => existsSync(f))
  return {
    name: 'fondu:layouts',
    enforce: 'post', // after the JSX and MDX are compiled: plain JavaScript to read
    configResolved(c) {
      root = c.root
    },
    transform(code, id) {
      const file = id.split('?')[0]!
      const rel = relative(pagesDir(), file).split(sep).join('/')
      if (rel.startsWith('..') || !isPageFile(rel)) return
      const chain = layoutsOf(rel)
        .map(layoutFile)
        .filter((f): f is string => f !== undefined)
      if (!chain.length) return
      const found = defaultExport(this.parse(code) as unknown as Program, code)
      if (!found) return
      // added at the end (imports are hoisted) and within a line: the lines stay where they were (`map: null`)
      const imports = chain.map((f, i) => `import __fondu_layout_${i} from ${JSON.stringify(f)};`).join('\n')
      const set = `${found.name}.layout ??= [${chain.map((_, i) => `__fondu_layout_${i}`).join(', ')}];`
      return { code: `${found.code}\n${imports}\n${set}\n`, map: null }
    },
    // dev: a `_layout.tsx` added or removed changes the chains of the pages below it: every module transformed anew
    configureServer(server) {
      const changed = (file: string) => {
        const rel = relative(pagesDir(), file).split(sep).join('/')
        if (rel.startsWith('..') || !/(^|\/)_layout\.[jt]sx$/.test(rel)) return
        for (const env of Object.values(server.environments)) env.moduleGraph.invalidateAll()
        server.hot.send({ type: 'full-reload' })
      }
      server.watcher.on('add', changed)
      server.watcher.on('unlink', changed)
    },
  }
}

type Node = { type: string; start: number; end: number; [key: string]: unknown }
type Program = { body: Node[] }

/**
 * The name of the module's default export, to set `layout` on: a named function or class as it is; an anonymous one,
 * or an expression, given a name first (`const __fondu_page = …`, exported at the end)
 */
function defaultExport(program: Program, code: string): { name: string; code: string } | undefined {
  for (const node of program.body) {
    if (node.type === 'ExportNamedDeclaration' && !node.source) {
      const specifiers = node.specifiers as Array<{ local: { name: string }; exported: { name: string } }>
      const specifier = specifiers.find((sp) => sp.exported.name === 'default')
      if (specifier) return { name: specifier.local.name, code }
    }
    if (node.type !== 'ExportDefaultDeclaration') continue
    const declaration = node.declaration as Node & { id?: { name: string } | null }
    if (declaration.id) return { name: declaration.id.name, code }
    return {
      name: '__fondu_page',
      code: `${code.slice(0, node.start)}const __fondu_page = ${code.slice(declaration.start)}\nexport default __fondu_page;`,
    }
  }
}
