import { relative, sep } from 'node:path'

import type { EnvironmentModuleNode, Plugin } from 'vite'

import { isPageFile } from '../paths.js'
import { exportedNames } from './strip.js'

export const PROPS_EVENT = 'fondu:props'

// read by the dev preamble's `__getReactRefreshIgnoredExports`
export const PAGE_EXPORTS = '__fondu_pageExports'

type Node = { file: string | null; importers: Set<Node> }

// only the app's own modules (not node_modules or fondu); the document is reached other than through a route
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
    else queue.push(...mod.importers)
  }
  return found
}

// A page module's other exports (an MDX page's `toc`) are left out of Fast Refresh's check: the server reads them, so the
// props are asked for again, keeping state and scroll (React Router's "Hot Data Revalidation"). A document change reloads.
export function hmr(): Plugin {
  let root = process.cwd()
  return {
    name: 'fondu:hmr',
    apply: 'serve',
    configResolved(c) {
      root = c.root
    },
    transform: {
      order: 'post',
      handler(code, id) {
        if (this.environment.config.consumer !== 'client' || /\?fondu-(?:view|outer)$/.test(id))
          return
        const file = id.split('?')[0]!
        const rel = relative(`${root}/app/routes`, file).split(sep).join('/')
        if (rel.startsWith('..') || !isPageFile(rel)) return
        const names = exportedNames(this.parse(code).body).filter((name) => name !== 'default')
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
