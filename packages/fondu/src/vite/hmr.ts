import { relative, sep } from 'node:path'

import type { EnvironmentModuleNode, Plugin } from 'vite'

import { isPageFile } from '../paths.js'

/** the browser's event for "the current page's props may have changed" (the client entry: `reload()`) */
export const PROPS_EVENT = 'fondu:props'

/** the global the dev preamble reads: the named exports of each page module (`__getReactRefreshIgnoredExports`) */
export const PAGE_EXPORTS = '__fondu_pageExports'

type Node = { file: string | null; importers: Set<Node> }

/**
 * What a change to a module reaches on the server, through the app's own modules only (app/, not node_modules nor
 * fondu): a route (`app/routes/…`: what it renders may have changed), and the document (`app/server.ts`, reached
 * other than through a route or the pages' entry). `app/app.tsx` is the pages' entry: the browser's own HMR.
 */
export function reach(start: Iterable<Node>, root: string): { routes: boolean; document: boolean } {
  const found = { routes: false, document: false }
  const seen = new Set<Node>()
  const queue = [...start]
  while (queue.length) {
    const mod = queue.shift()!
    if (seen.has(mod) || !mod.file) continue
    seen.add(mod)
    const rel = relative(root, mod.file).split(sep).join('/')
    if (rel.startsWith('..') || rel.includes('node_modules/') || !rel.startsWith('app/')) continue
    if (rel.startsWith('app/routes/')) found.routes = true
    else if (rel === 'app/server.ts') found.document = true
    else if (rel !== 'app/app.tsx') queue.push(...mod.importers)
  }
  return found
}

/**
 * Dev: a change updates what it changes, without reloading the page where it can.
 * - The browser's code: React Fast Refresh (`@vitejs/plugin-react`), MDX pages too. A page module's other exports
 *   (an MDX page's `toc`) are left out of Fast Refresh's check: the server reads them, and the next rule applies.
 * - What a route depends on: the browser asks for the page's props again (fondu/client's `reload()`), its state
 *   and scroll kept, as React Router's "Hot Data Revalidation".
 * - The document (`server.ts` and what only it imports): the page reloads.
 */
export function hmr(): Plugin {
  let root = process.cwd()
  return {
    name: 'fondu:hmr',
    apply: 'serve',
    configResolved(c) {
      root = c.root
    },
    // the named exports of a page module, for the dev preamble's `__getReactRefreshIgnoredExports`
    transform: {
      order: 'post',
      handler(code, id) {
        if (this.environment.config.consumer !== 'client') return
        const file = id.split('?')[0]!
        const rel = relative(`${root}/app/pages`, file).split(sep).join('/')
        if (rel.startsWith('..') || !isPageFile(rel)) return
        const names = namedExports(this.parse(code) as unknown as Program)
        if (!names.length) return
        return {
          code: `${code}\n;(window.${PAGE_EXPORTS} ??= {})[${JSON.stringify(file)}] = ${JSON.stringify(names)};\n`,
          map: null,
        }
      },
    },
    hotUpdate({ file, server }) {
      if (this.environment.name !== 'client') return
      const servers = Object.values(server.environments).filter((env) => env.name !== 'client')
      const onServer = servers.flatMap((env) => [...(env.moduleGraph.getModulesByFile(file) ?? [])])
      if (!onServer.length) return // the browser's only (or a file a stylesheet watches, as Tailwind's sources)
      const { routes, document } = reach(onServer as unknown as Node[], root)
      const client = this.environment
      if (document) {
        client.hot.send({ type: 'full-reload' })
        return []
      }
      // once the server's modules are updated (they are, in this same update, after the browser's)
      if (routes) setTimeout(() => client.hot.send(PROPS_EVENT, {}))
      const inBrowser = [...(client.moduleGraph.getModulesByFile(file) ?? [])].some(
        (m: EnvironmentModuleNode) => m.type === 'js',
      )
      if (!inBrowser) return []
    },
  }
}

type AstNode = { type: string; [key: string]: unknown }
type Program = { body: AstNode[] }

/** the names a module exports other than `default` */
function namedExports(program: Program): string[] {
  const names: string[] = []
  for (const node of program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue
    const declaration = node.declaration as {
      id?: { name: string } | null
      declarations?: Array<{ id: { type: string; name?: string } }>
    } | null
    if (declaration?.id) names.push(declaration.id.name)
    for (const d of declaration?.declarations ?? [])
      if (d.id.type === 'Identifier') names.push(d.id.name!)
    for (const s of (node.specifiers as Array<{ exported: { name?: string; value?: string } }>) ??
      [])
      names.push(s.exported.name ?? s.exported.value!)
  }
  return names.filter((n) => n !== 'default')
}
