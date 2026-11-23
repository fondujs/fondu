import { readFile } from 'node:fs/promises'
import { relative, sep } from 'node:path'

import { parseAst, type Plugin } from 'vite'

import {
  CONFIG,
  checkExportNames,
  checkRouteName,
  isRouteFile,
  HANDLERS,
  isPageFile,
  METHODS,
} from '../paths.js'

const SERVER_EXPORTS = new Set<string>([...HANDLERS, ...CONFIG, ...METHODS])

type Node = { type: string; start: number; end: number; [key: string]: unknown }
type Name = { name?: string; value?: string }
const nameOf = (n: Name) => (n.name ?? n.value)!

function bound(node: Node | null | undefined, out: string[] = []): string[] {
  if (!node) return out
  switch (node.type) {
    case 'Identifier':
      out.push(node.name as string)
      break
    case 'VariableDeclaration':
      for (const d of node.declarations as Node[]) bound(d.id as Node, out)
      break
    case 'FunctionDeclaration':
    case 'TSDeclareFunction':
    case 'ClassDeclaration':
    case 'TSEnumDeclaration':
    case 'TSImportEqualsDeclaration':
      if (!node.declare && node.importKind !== 'type') bound(node.id as Node, out)
      break
    case 'TSModuleDeclaration': {
      // a namespace (`namespace A.B {}` declares A); `declare module 'x'` and `declare global` declare no name
      let id = node.id as Node
      while (id.type === 'TSQualifiedName') id = id.left as Node
      if (!node.declare && id.type === 'Identifier') out.push(id.name as string)
      break
    }
    case 'TSParameterProperty':
      bound(node.parameter as Node, out)
      break
    case 'ObjectPattern':
      for (const p of node.properties as Node[])
        bound((p.type === 'RestElement' ? p.argument : p.value) as Node, out)
      break
    case 'ArrayPattern':
      for (const e of node.elements as Array<Node | null>) bound(e, out)
      break
    case 'RestElement':
      bound(node.argument as Node, out)
      break
    case 'AssignmentPattern':
      bound(node.left as Node, out)
      break
  }
  return out
}

type Scope = Set<string>

// Errs on the side of a name referred to, never the other way. It reads TSX: a JSX element's name (`<Card>`, not `<div>`)
// is a reference; a type is not (gone once compiled), what runs is (an enum's values, a namespace's body, `x as T`'s x).
function references(node: unknown, out = new Set<string>(), scopes: Scope[] = []): Set<string> {
  const visit = (n: unknown, inner: Scope[] = scopes) => references(n, out, inner)
  if (Array.isArray(node)) {
    for (const n of node) visit(n)
    return out
  }
  if (!node || typeof node !== 'object' || typeof (node as Node).type !== 'string') return out
  const n = node as Node
  switch (n.type) {
    case 'Identifier':
      if (!scopes.some((s) => s.has(n.name as string))) out.add(n.name as string)
      return out
    case 'MemberExpression':
      visit(n.object)
      if (n.computed) visit(n.property)
      return out
    case 'Property':
    case 'MethodDefinition':
    case 'PropertyDefinition':
    case 'AccessorProperty':
      if (n.computed) visit(n.key)
      visit(n.value)
      return out
    case 'LabeledStatement':
      visit(n.body)
      return out
    case 'BreakStatement':
    case 'ContinueStatement':
    case 'MetaProperty':
    case 'JSXIdentifier':
    case 'JSXNamespacedName':
    case 'JSXClosingElement':
      return out
    case 'JSXAttribute':
      visit(n.value)
      return out
    case 'JSXOpeningElement': {
      const tag = n.name as Node
      let root = tag
      while (root.type === 'JSXMemberExpression') root = root.object as Node
      const name = root.name as string
      if (root.type === 'JSXIdentifier' && (root !== tag || !/^[a-z]/.test(name)))
        visit({ type: 'Identifier', name, start: root.start, end: root.end })
      visit(n.attributes)
      return out
    }
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
    case 'TSInstantiationExpression':
    case 'TSExportAssignment':
    case 'TSParameterProperty':
      visit(n.expression)
      visit(n.parameter)
      visit(n.decorators)
      return out
    case 'TSEnumDeclaration': {
      if (n.declare) return out
      const members = ((n.body as Node | undefined)?.members ?? n.members) as Node[]
      const own: Scope = new Set(bound(n.id as Node))
      for (const m of members) if (!m.computed) own.add(nameOf(m.id as Name))
      for (const m of members) {
        if (m.computed) visit(m.id, [...scopes, own])
        visit(m.initializer, [...scopes, own])
      }
      return out
    }
    case 'TSImportEqualsDeclaration': {
      let root = n.moduleReference as Node
      while (root.type === 'TSQualifiedName') root = root.left as Node
      if (n.importKind !== 'type') visit(root)
      return out
    }
    case 'TSModuleDeclaration':
      // a namespace's body runs; `declare namespace` and `declare module 'x'` do not
      if (!n.declare) visit(n.body)
      return out
    case 'TSModuleBlock':
      visit(n.body, [...scopes, lexical(n.body as Node[])])
      return out
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      // the parameters' scope: what their default expressions see. The body's declarations are another scope, inside it
      const params: Scope = new Set()
      if (n.type === 'FunctionExpression') bound(n.id as Node, []).forEach((x) => params.add(x))
      for (const p of n.params as Node[]) bound(p).forEach((x) => params.add(x))
      const body: Scope = new Set()
      vars(n.body, body)
      if ((n.body as Node).type === 'BlockStatement') lexical((n.body as Node).body as Node[], body)
      visit(n.params, [...scopes, params])
      visit(n.body, [...scopes, params, body])
      return out
    }
    case 'ClassDeclaration':
    case 'ClassExpression': {
      visit(n.superClass)
      visit(n.decorators)
      visit(n.body, [...scopes, new Set(bound(n.id as Node))])
      return out
    }
    case 'BlockStatement':
    case 'StaticBlock':
      visit(n.body, [...scopes, lexical(n.body as Node[])])
      return out
    case 'SwitchStatement':
      visit(n.discriminant)
      visit(n.cases, [
        ...scopes,
        lexical((n.cases as Node[]).flatMap((c) => c.consequent as Node[])),
      ])
      return out
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement': {
      const head = (n.init ?? n.left) as Node | null
      const scope =
        head?.type === 'VariableDeclaration' && head.kind !== 'var'
          ? new Set(bound(head))
          : new Set<string>()
      for (const key of ['init', 'test', 'update', 'left', 'right', 'body'])
        visit(n[key], [...scopes, scope])
      return out
    }
    case 'CatchClause': {
      const scope: Scope = new Set(bound(n.param as Node))
      visit(n.param, [...scopes, scope])
      visit(n.body, [...scopes, scope])
      return out
    }
  }
  if (n.type.startsWith('TS')) return out
  for (const key in n) if (key !== 'type' && key !== 'start' && key !== 'end') visit(n[key])
  return out
}

function vars(node: unknown, scope: Scope): void {
  if (Array.isArray(node)) for (const n of node) vars(n, scope)
  else if (node && typeof node === 'object' && typeof (node as Node).type === 'string') {
    const n = node as Node
    if (/Function|Class/.test(n.type)) return
    if (n.type === 'VariableDeclaration' && n.kind === 'var') bound(n).forEach((x) => scope.add(x))
    for (const key in n) if (key !== 'type' && key !== 'start' && key !== 'end') vars(n[key], scope)
  }
}

function lexical(statements: Node[], scope: Scope = new Set()): Scope {
  for (let s of statements) {
    if (s.type === 'ExportNamedDeclaration' && s.declaration) s = s.declaration as Node
    if (
      (s.type === 'VariableDeclaration' && s.kind !== 'var') ||
      s.type === 'FunctionDeclaration' ||
      s.type === 'ClassDeclaration' ||
      s.type === 'TSEnumDeclaration' ||
      s.type === 'TSModuleDeclaration' ||
      s.type === 'TSImportEqualsDeclaration'
    )
      bound(s).forEach((x) => scope.add(x))
  }
  return scope
}

const DECLARATIONS = [
  'VariableDeclaration',
  'FunctionDeclaration',
  'ClassDeclaration',
  'TSEnumDeclaration',
  'TSModuleDeclaration',
  'TSImportEqualsDeclaration',
]

interface Part {
  node: Node
  declares: string[]
  uses: Set<string>
  values?: Array<Node & { local: Name }>
  text?: string
}

// Type-only imports and exports go too: `verbatimModuleSyntax` would keep them as `import {} from 'x.server'` and load a
// server module. Conservative: a name the code kept refers to keeps its declaration, so what is left over is at worst
// unused code, which the server-only guard stops when it is server code. Lines stay where they were.
export function stripServerCode(code: string, program: { body: Node[] }, file: string): string {
  const fail = (why: string): never => {
    throw new Error(`fondu: routes/${file}: ${why}`)
  }
  // the server exports removed, by name: code left that names one would keep it in the browser, or fail there
  const removed = new Set<string>()
  const parts: Part[] = program.body.map((node) => ({
    node,
    declares: [],
    uses: node.type === 'ImportDeclaration' ? new Set<string>() : references(node),
  }))
  for (const part of parts) {
    const { node } = part
    if (node.type === 'ExportAllDeclaration') fail('`export *` is not for a route file')
    if (node.type === 'ExportNamedDeclaration') {
      if (node.exportKind === 'type') {
        part.text = ''
        part.uses = new Set()
        continue
      }
      const declaration = node.declaration as Node | null
      if (declaration) {
        const declared = bound(declaration)
        const server = declared.filter((n) => SERVER_EXPORTS.has(n))
        if (server.length && server.length !== declared.length)
          fail(`declare ${server.join(', ')} on a line of their own`)
        if (server.length) {
          part.text = ''
          for (const name of server) removed.add(name)
        }
        continue
      }
      const specifiers = node.specifiers as Array<Node & { local: Name; exported: Name }>
      const kept = specifiers.filter(
        (s) => !SERVER_EXPORTS.has(nameOf(s.exported)) && s.exportKind !== 'type',
      )
      if (kept.length === specifiers.length) continue
      const source = node.source
        ? ` from ${code.slice((node.source as Node).start, (node.source as Node).end)}`
        : ''
      part.text = kept.length
        ? `export { ${kept.map((s) => code.slice(s.start, s.end)).join(', ')} }${source};`
        : ''
      part.uses = references(kept.map((s) => s.local))
      continue
    }
    if (node.type === 'ImportDeclaration') {
      const specifiers = node.specifiers as Array<Node & { local: Name; importKind?: string }>
      if (node.importKind === 'type') part.text = ''
      else if (specifiers.length) {
        part.values = specifiers.filter((s) => s.importKind !== 'type')
        part.declares = part.values.map((s) => nameOf(s.local))
        if (part.values.length < specifiers.length)
          part.text = part.values.length ? importOf(code, node, part.values) : ''
      }
    } else if (DECLARATIONS.includes(node.type)) part.declares = bound(node)
  }

  // what the code kept reaches stays, the rest goes: declarations that only name each other (a loader's helpers
  // calling one another) go together
  const kept = (part: Part) => part.text !== ''
  const live = new Set(parts.filter((part) => kept(part) && !part.declares.length))
  const reached = new Set<string>()
  for (const queue = [...live]; queue.length;)
    for (const name of queue.pop()!.uses) {
      if (reached.has(name)) continue
      reached.add(name)
      for (const part of parts)
        if (kept(part) && !live.has(part) && part.declares.includes(name)) {
          live.add(part)
          queue.push(part)
        }
    }
  for (const part of parts) {
    if (!kept(part) || !part.declares.length) continue
    if (part.node.type === 'ImportDeclaration') {
      const used = part.values!.filter((s) => reached.has(nameOf(s.local)))
      if (used.length < (part.node.specifiers as Node[]).length)
        part.text = used.length ? importOf(code, part.node, used) : ''
    } else if (!live.has(part)) part.text = ''
  }

  for (const part of parts)
    if (part.text !== '')
      for (const name of removed)
        if (part.uses.has(name))
          fail(
            `${name} is server code, removed from the browser's copy: set it where it is declared`,
          )

  let out = ''
  let at = 0
  for (const { node, text } of parts) {
    if (text === undefined) continue
    // the lines a removed statement took stay, empty: the line numbers of the rest don't change
    const removed = code.slice(node.start, node.end)
    out += code.slice(at, node.start) + text + '\n'.repeat(removed.split('\n').length - 1)
    at = node.end
  }
  return out + code.slice(at)
}

function importOf(code: string, node: Node, kept: Array<Node & { local: Name }>): string {
  const source = code.slice((node.source as Node).start, (node.source as Node).end)
  const first = kept[0]!
  if (first.type === 'ImportNamespaceSpecifier' && kept.length === 1)
    return `import ${code.slice(first.start, first.end)} from ${source};`
  const byDefault = kept.find((s) => s.type === 'ImportDefaultSpecifier')
  const named = kept.filter((s) => s.type === 'ImportSpecifier')
  const namespace = kept.find((s) => s.type === 'ImportNamespaceSpecifier')
  const clauses = [
    byDefault && code.slice(byDefault.start, byDefault.end),
    namespace && code.slice(namespace.start, namespace.end),
    named.length && `{ ${named.map((s) => code.slice(s.start, s.end)).join(', ')} }`,
  ].filter(Boolean)
  return `import ${clauses.join(', ')} from ${source};`
}

// Remove just the declaration and the import bindings used only by it, leaving side effects, other exports and line positions alone.
export function withoutLayout(code: string, body: Node[]): string {
  const declaration = body.find(
    (n) => n.type === 'ExportNamedDeclaration' && bound(n.declaration as Node).includes('layout'),
  )!
  const others = body.filter((n) => n !== declaration && n.type !== 'ImportDeclaration')
  const used = references(others)
  if (used.has('layout')) return code // the component itself uses them; they really are its dependencies
  const mentioned = references(declaration)
  let out = code
  for (const n of [...body].reverse()) {
    let text = ''
    if (n !== declaration) {
      if (n.type !== 'ImportDeclaration') continue
      const specs = n.specifiers as Array<Node & { local: Name }>
      const kept = specs.filter((s) => !mentioned.has(nameOf(s.local)) || used.has(nameOf(s.local)))
      if (kept.length === specs.length) continue
      if (kept.length) text = importOf(code, n, kept)
    }
    out =
      out.slice(0, n.start) +
      text +
      '\n'.repeat(code.slice(n.start, n.end).split('\n').length - 1) +
      out.slice(n.end)
  }
  return out
}

export function exportedNames(body: ReturnType<typeof parseAst>['body']): string[] {
  const names = new Set<string>()
  for (const node of body) {
    if ('exportKind' in node && node.exportKind === 'type') continue
    if (node.type === 'ExportDefaultDeclaration') {
      const { type } = node.declaration
      if (type !== 'TSInterfaceDeclaration' && type !== 'TSDeclareFunction') names.add('default')
    } else if (node.type === 'ExportAllDeclaration') {
      if (node.exported) names.add(nameOf(node.exported))
    } else if (node.type === 'ExportNamedDeclaration') {
      if (node.declaration?.type !== 'TSDeclareFunction')
        for (const name of bound(node.declaration as Node | null)) names.add(name)
      for (const specifier of node.specifiers)
        if (specifier.exportKind !== 'type') names.add(nameOf(specifier.exported))
    }
  }
  return [...names].sort()
}

const SPECIAL_FILE = /(?:^|\/)_(?:middleware\.ts|layout\.tsx|error\.tsx)$/

const OTHER_MODULE = /[?&](?:raw|url|inline|no-inline|worker|sharedworker)(?:[&=]|$)/

// In `load`, on the source: the stripped text is the module's source from there on, so a source map's `sourcesContent` is
// stripped too. `?worker_file`, `?direct`, `?html-proxy` and `?t=` are the same file: stripped alike.
export function stripRoutes(): Plugin {
  let root = process.cwd()
  return {
    name: 'fondu:strip-routes',
    enforce: 'post', // after the JSX is compiled: plain JavaScript to read (a layout)
    configResolved(c) {
      root = c.root
    },
    load: {
      order: 'pre',
      filter: { id: /\/app\/routes\/[^?]*\.tsx(?:\?|$)/ },
      async handler(id) {
        if (this.environment.config.consumer !== 'client' || OTHER_MODULE.test(id)) return
        const path = id.split('?')[0]!
        const file = relative(`${root}/app/routes`, path).split(sep).join('/')
        if (file.startsWith('..') || !isPageFile(file)) return
        const code = await readFile(path, 'utf8')
        let program: unknown
        try {
          program = parseAst(code, { lang: 'tsx' })
        } catch (error) {
          // the parser's message does not name the file
          throw new Error(`fondu: routes/${file}: ${(error as Error).message}`, { cause: error })
        }
        return stripServerCode(code, program as never, file)
      },
    },
    transform(code, id) {
      const file = relative(`${root}/app/routes`, id.split('?')[0]!).split(sep).join('/')
      if (file.startsWith('..')) return
      if (this.environment.config.consumer === 'server') {
        if (this.environment.mode !== 'build') return
        if (id.includes('?') || !(isRouteFile(file) || SPECIAL_FILE.test(file))) return
        return void checkExportNames(file, exportedNames(this.parse(code).body))
      }
      if (isRouteFile(file)) checkRouteName(file)
      // a layout or the error page is not stripped: what the server refuses at startup fails the build
      if (/(?:^|\/)_(?:layout|error)\.tsx$/.test(file) && !/\?fondu-(?:view|outer)$/.test(id)) {
        return void checkExportNames(file, exportedNames(this.parse(code).body))
      }
    },
  }
}
