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
    LAYOUT_EXTENSIONS.map((ext) => join(pagesDir(), dir, `_layout${ext}`)).find((f) =>
      existsSync(f),
    )
  // a page's module path relative to app/pages/, if it is a page
  const pageOf = (id: string) => {
    const rel = relative(pagesDir(), id.split('?')[0]!).split(sep).join('/')
    return rel.startsWith('..') || !isPageFile(rel) ? undefined : rel
  }
  const chainOf = (page: string) =>
    layoutsOf(page)
      .map(layoutFile)
      .filter((f): f is string => f !== undefined)
  return {
    name: 'fondu:layouts',
    enforce: 'post', // after the JSX and MDX are compiled: plain JavaScript to read
    configResolved(c) {
      root = c.root
    },
    transform(code, id) {
      const rel = pageOf(id)
      if (rel === undefined) return
      const found = defaultExport(this.parse(code) as unknown as Program, code)
      // a component put in app/pages/ by mistake would be a page, named and typed: an error instead
      if (!found) {
        this.error(
          `fondu: app/pages/${rel} has no default export. A page is its module's default export; a file in app/pages/ that is not a page goes elsewhere (components/, say), or its name starts with _`,
        )
      }
      const chain = chainOf(rel)
      if (found.name === undefined) return
      // a re-exported component is wrapped with no layout above too: the app's default layout for this page, not the
      // layouts its other page set on it
      if (!chain.length) return found.wrapped ? { code: found.code, map: null } : undefined
      // added at the end (imports are hoisted) and within a line: the lines stay where they were (`map: null`)
      const imports = chain
        .map((f, i) => `import __fondu_layout_${i} from ${JSON.stringify(f)};`)
        .join('\n')
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

type Specifier = Node & { local: Name; exported: Name }
type Name = Node & { name?: string; value?: string }
const nameOf = (n: Name) => n.name ?? n.value!

/**
 * The name of the module's default export, to set `layout` on: a named function or class as it is; an anonymous one,
 * or an expression, given a name first (`const __fondu_page = …`, exported at the end). A component re-exported from
 * another module (`export { default } from './edit.tsx'`) is wrapped in one of this page's own: two pages may share a
 * component under different layouts. `name: undefined`: a default export to leave alone (`export * as default`).
 */
function defaultExport(
  program: Program,
  code: string,
): { name: string | undefined; code: string; wrapped?: true } | undefined {
  for (const node of program.body) {
    if (node.type === 'ExportAllDeclaration' && node.exported)
      if (nameOf(node.exported as Name) === 'default') return { name: undefined, code }
    if (node.type === 'ExportNamedDeclaration') {
      const specifiers = node.specifiers as Specifier[]
      const specifier = specifiers.find((sp) => nameOf(sp.exported) === 'default')
      if (!specifier) continue
      if (!node.source) return { name: nameOf(specifier.local), code }
      const source = code.slice((node.source as Node).start, (node.source as Node).end)
      const others = specifiers.filter((sp) => sp !== specifier)
      const kept = others.length
        ? `export { ${others.map((sp) => code.slice(sp.start, sp.end)).join(', ')} } from ${source};`
        : ''
      const local = nameOf(specifier.local)
      const imported = /^[A-Za-z_$][\w$]*$/.test(local) ? local : JSON.stringify(local)
      return {
        name: '__fondu_page',
        wrapped: true,
        code:
          `${code.slice(0, node.start)}${kept}${code.slice(node.end)}\n` +
          `import { ${imported} as __fondu_shared } from ${source};\n` +
          `import { createElement as __fondu_h } from 'react';\n` +
          `const __fondu_page = (props) => __fondu_h(__fondu_shared, props);\n` +
          `export default __fondu_page;`,
      }
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
