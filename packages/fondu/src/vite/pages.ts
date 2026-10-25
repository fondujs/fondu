import { relative, sep } from 'node:path'

import type { Plugin } from 'vite'

import { isPageFile } from '../paths.js'

type Node = { type: string; [key: string]: unknown }
type Name = { name?: string; value?: string }
const nameOf = (n: Name) => n.name ?? n.value

/** a module that exports a default, as a page does (`export default`, `export { X as default }`, `export * as default`) */
function hasDefaultExport(program: { body: Node[] }): boolean {
  return program.body.some(
    (node) =>
      node.type === 'ExportDefaultDeclaration' ||
      (node.type === 'ExportAllDeclaration' &&
        node.exported &&
        nameOf(node.exported as Name) === 'default') ||
      (node.type === 'ExportNamedDeclaration' &&
        (node.specifiers as Array<{ exported: Name }>).some(
          (s) => nameOf(s.exported) === 'default',
        )),
  )
}

/**
 * A page is its module's default export: a file in `app/pages/` without one (a component put there by mistake) is an
 * error, not a page nobody can render.
 */
export function pages(): Plugin {
  let root = process.cwd()
  return {
    name: 'fondu:pages',
    enforce: 'post', // after the JSX and MDX are compiled: plain JavaScript to read
    configResolved(c) {
      root = c.root
    },
    transform(code, id) {
      const rel = relative(`${root}/app/pages`, id.split('?')[0]!).split(sep).join('/')
      if (rel.startsWith('..') || !isPageFile(rel)) return
      if (!hasDefaultExport(this.parse(code) as unknown as { body: Node[] }))
        this.error(
          `fondu: app/pages/${rel} has no default export. A page is its module's default export; a file in app/pages/ that is not a page goes elsewhere (components/, say), or its name starts with _`,
        )
    },
  }
}
