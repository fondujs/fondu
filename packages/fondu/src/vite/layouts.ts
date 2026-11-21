import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import { normalizePath, parseAst, type DevEnvironment, type Plugin } from 'vite'

import { isPageFile, layoutsOf } from '../paths.js'
import { writeLayoutChecks } from './layout-checks.js'
import { exportedNames, withoutLayout } from './strip.js'
import { walk } from './typegen.js'

export const VIEW_QUERY = '?fondu-view'
const OUTER_QUERY = '?fondu-outer'
const directoryLayout = /(?:^|\/)_layout\.tsx$/
const MDX_LAYOUTS = 'fondu:mdx-layouts'
export interface LayoutImport {
  source: string
  name: string
}

/** A declaration is a literal list of imports. Never run a route (or its loader's imports) to discover its UI. */
export function layoutImports(code: string, file: string): LayoutImport[] | undefined {
  if (!code.includes('layout')) return
  const { body } = parseAst(code, { lang: 'tsx' })
  const imports = new Map<string, LayoutImport>()
  for (const n of body) {
    if (n.type !== 'ImportDeclaration' || n.importKind === 'type') continue
    for (const s of n.specifiers) {
      if (s.type === 'ImportDefaultSpecifier')
        imports.set(s.local.name, { source: n.source.value, name: 'default' })
      if (s.type === 'ImportSpecifier' && s.importKind !== 'type')
        imports.set(s.local.name, {
          source: n.source.value,
          name: s.imported.type === 'Identifier' ? s.imported.name : s.imported.value,
        })
    }
  }
  const fail = (): never => {
    throw new Error(
      `fondu: routes/${file}: use export const layout = [Site, Feature] with imported components, or []`,
    )
  }
  for (const n of body) {
    if (
      n.type !== 'ExportNamedDeclaration' ||
      n.exportKind === 'type' ||
      !exportedNames([n as never]).includes('layout')
    )
      continue
    const decl = n.declaration
    if (decl?.type !== 'VariableDeclaration') return fail()
    for (const item of decl.declarations) {
      if (item.id.type !== 'Identifier' || item.id.name !== 'layout') continue
      let value = item.init
      while (value?.type === 'TSAsExpression' || value?.type === 'TSSatisfiesExpression')
        value = value.expression
      if (
        decl.kind !== 'const' ||
        decl.declarations.length !== 1 ||
        value?.type !== 'ArrayExpression'
      )
        return fail()
      return value.elements.map((e) => (e?.type === 'Identifier' && imports.get(e.name)) || fail())
    }
    return fail()
  }
}

/** MDX may re-export metadata. Only an actual layout from a wildcard is ambiguous: the compiler hasn't seen its list. */
function checkStarExports(code: string, file: string) {
  if (!code.includes('*') || !code.includes('export')) return
  const message = `fondu: routes/${file}: declare layout in this file with export const layout = [...] instead of a wildcard re-export`
  const checks: string[] = []
  for (const node of parseAst(code, { lang: 'tsx' }).body) {
    if (node.type !== 'ExportAllDeclaration' || node.exportKind === 'type') continue
    if (node.exported) {
      if (
        (node.exported.type === 'Identifier' ? node.exported.name : node.exported.value) ===
        'layout'
      )
        throw new Error(message)
      continue
    }
    let ns = `__fonduStar${checks.length}`
    while (code.includes(ns)) ns += '_'
    checks.push(
      `import * as ${ns} from ${JSON.stringify(node.source.value)}; if ('layout' in ${ns}) throw new Error(${JSON.stringify(message)});`,
    )
  }
  if (checks.length) return { code: [code, ...checks].join('\n'), map: null }
}

function canDeclareLayout(file: string) {
  // Vite's route globs exclude dotfiles and dot directories.
  const segments = file.split('/')
  return (
    !segments.some((part) => part.startsWith('.')) &&
    (isPageFile(file) ||
      (directoryLayout.test(file) && !segments.slice(0, -1).some((dir) => dir.startsWith('_'))))
  )
}

async function readDeclarations(
  root: string,
  readMdx: (file: string) => Promise<LayoutImport[] | undefined>,
) {
  const declarations = new Map<string, LayoutImport[]>()
  for (const file of walk(root).filter(canDeclareLayout)) {
    const refs = file.endsWith('.mdx')
      ? await readMdx(file)
      : layoutImports(readFileSync(resolve(root, file), 'utf8'), file)
    if (refs) declarations.set(file, refs)
  }
  return declarations
}

function mdxDeclarations(file: string, meta?: Record<string, unknown>): LayoutImport[] | undefined {
  if (!meta || !(MDX_LAYOUTS in meta))
    throw new Error(`fondu: routes/${file}: expected compiled MDX layout metadata from Vite`)
  return (meta[MDX_LAYOUTS] as { refs?: LayoutImport[] }).refs
}

/** The dynamic entry of a page re-exports its component and exact layout chain. The document, client navigation
 * and Vite's preload manifest all use these same ESM edges. Importing a layout's component does not wrap it. */
export function layoutChains(): Plugin {
  let root = ''
  let declarations = new Map<string, LayoutImport[]>()
  const edges = new Map<string, string[]>()
  function checkCycle(file: string, parents: string[] = [], checked = new Set<string>()) {
    if (checked.has(file)) return
    if (parents.includes(file))
      throw new Error(
        `fondu: cyclic layout declaration: ${[...parents, file].map((f) => 'routes/' + f).join(' → ')}`,
      )
    for (const parent of edges.get(file) ?? []) checkCycle(parent, [...parents, file], checked)
    checked.add(file)
  }
  const record = (file: string, refs: LayoutImport[] | undefined) => {
    if (refs) declarations.set(file, refs)
    else declarations.delete(file)
  }
  const readDevMdx = async (env: DevEnvironment, file: string, invalidate = false) => {
    const url = '/app/routes/' + file + VIEW_QUERY
    if (invalidate) {
      const mod = await env.moduleGraph.getModuleByUrl(url)
      if (mod) env.moduleGraph.invalidateModule(mod)
    }
    await env.transformRequest(url)
    return mdxDeclarations(file, (await env.moduleGraph.getModuleByUrl(url))?.info?.meta)
  }
  return {
    name: 'fondu:layout-chains',
    enforce: 'pre', // after the app's MDX compiler, before JSX / Fast Refresh
    configResolved(c) {
      root = resolve(c.root, 'app/routes')
    },
    async generateBundle() {
      if (this.environment.name !== 'client') return
      // The client entry already loads all MDX views through the app's compiler.
      const inventory = await readDeclarations(root, async (file) => {
        const id = normalizePath(resolve(root, file)) + VIEW_QUERY
        return mdxDeclarations(file, this.getModuleInfo(id)?.meta)
      })
      writeLayoutChecks(root, inventory)
    },
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        readDeclarations(root, (file) => readDevMdx(server.environments.client, file))
          .then((inventory) => {
            declarations = inventory
            writeLayoutChecks(root, inventory)
          })
          .catch((error) => server.config.logger.error(String(error)))
      })
    },
    async transform(code, id) {
      const [path, query] = id.split('?')
      if (!path || !/\.(tsx|mdx)$/.test(path)) return
      const file = normalizePath(relative(root, path))
      if (file.startsWith('../')) return
      const error = file === '_error.tsx'
      if (
        (!error && !canDeclareLayout(file)) ||
        (query && query !== OUTER_QUERY.slice(1) && query !== VIEW_QUERY.slice(1))
      )
        return
      const refs = error ? undefined : layoutImports(code, file)
      if (!refs) edges.delete(file)
      if (!query && refs === undefined) return error ? undefined : checkStarExports(code, file)
      const meta = file.endsWith('.mdx') ? { [MDX_LAYOUTS]: { refs } } : undefined
      if (refs) {
        const parents: string[] = []
        for (const ref of refs) {
          const imported = await this.resolve(ref.source, path)
          if (!imported)
            this.error(`fondu: routes/${file}: cannot resolve layout import ${ref.source}`)
          if (ref.name === 'default') parents.push(normalizePath(relative(root, imported.id)))
        }
        edges.set(file, parents)
        checkCycle(file)
      }
      if (!query) {
        if (refs && this.environment.config.consumer === 'client')
          return {
            code: withoutLayout(code, parseAst(code, { lang: 'tsx' }).body as never),
            map: null,
          }
        return
      }
      const page = `export { default } from ${JSON.stringify('/app/routes/' + file)};`
      if (refs) {
        // Resolve these ordinary imports relative to the declaring module (also for a directory's ?fondu-outer).
        // Its plain component module must not depend on these parents just because another page imports it.
        const names = refs.map((_, i) => `L${i}`)
        const imports = refs.map(
          ({ source, name }, i) =>
            `import { ${JSON.stringify(name)} as ${names[i]} } from ${JSON.stringify(source)};`,
        )
        const list = `export const layout = [${names.join(', ')}];`
        return {
          code: [...imports, list, ...(query === VIEW_QUERY.slice(1) ? [page] : [])].join('\n'),
          map: null,
          meta,
        }
      }
      const imports: string[] = [],
        chain: string[] = []
      // Walk inwards to outwards; stop as soon as a directory declares its own parents.
      for (const dir of layoutsOf(file).reverse()) {
        const parent = (dir ? dir + '/' : '') + '_layout.tsx'
        const absolute = resolve(root, parent)
        if (!existsSync(absolute)) continue
        this.addWatchFile(absolute)
        const boundary = layoutImports(readFileSync(absolute, 'utf8'), parent) !== undefined
        const name = `L${chain.length}`
        imports.unshift(`import ${name} from ${JSON.stringify('/app/routes/' + parent)};`)
        chain.unshift(name)
        if (boundary) {
          imports.unshift(
            `import {layout as outer} from ${JSON.stringify('/app/routes/' + parent + OUTER_QUERY)};`,
          )
          chain.unshift('...outer')
          break
        }
      }
      return {
        code: [...imports, `export const layout = [${chain.join(', ')}];`, page].join('\n'),
        map: null,
        meta,
      }
    },
    async hotUpdate({ file, type, read, server, timestamp }) {
      const name = normalizePath(relative(root, file))
      if (name.startsWith('../') || this.environment.name !== 'client') return
      const directory = directoryLayout.test(name)
      if (!canDeclareLayout(name)) return
      const before = JSON.stringify(declarations.get(name))
      if (type === 'delete') {
        declarations.delete(name)
        edges.delete(name)
      } else {
        const refs = name.endsWith('.mdx')
          ? await readDevMdx(server.environments.client, name, true)
          : layoutImports(await read(), name)
        record(name, refs)
      }
      if (before === JSON.stringify(declarations.get(name)) && !(directory && type !== 'update'))
        return
      writeLayoutChecks(root, declarations)
      // Adding a layout has no old import edge. Invalidate the generated views on both sides before reloading.
      for (const env of Object.values(server.environments)) {
        for (const mod of env.moduleGraph.idToModuleMap.values()) {
          if (mod.id?.endsWith(VIEW_QUERY) && (directory || mod.file === file))
            env.moduleGraph.invalidateModule(mod, new Set(), timestamp, true)
        }
      }
      this.environment.hot.send({ type: 'full-reload' })
    },
  }
}
