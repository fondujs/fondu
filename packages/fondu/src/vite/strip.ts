import { relative, sep } from 'node:path'

import type { Plugin } from 'vite'

import { isPageFile } from '../paths.js'

/** the exports of a page's route file that are server code: the browser gets the page (default) alone */
export const SERVER_EXPORTS = new Set([
  'loader',
  'action',
  'actions',
  'prerender',
  'params',
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
])

type Node = { type: string; start: number; end: number; [key: string]: unknown }
type Name = { name?: string; value?: string }
const nameOf = (n: Name) => (n.name ?? n.value)!

/** the names a declaration binds: `const { a, b: [c] } = …` → a, c */
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
    case 'ClassDeclaration':
      bound(node.id as Node, out)
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

/**
 * The names a node refers to that it does not bind itself: `function f(a) { return a + b }` → b (and f's own
 * scopes: parameters, `var`s, block declarations, a catch's parameter). What a pattern binds is not a reference;
 * nor a property's name, a label, a member's property. Errs on the side of a name referred to, never the other way.
 */
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
      return out
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression': {
      const scope: Scope = new Set()
      if (n.type === 'FunctionExpression') bound(n.id as Node, []).forEach((x) => scope.add(x))
      for (const p of n.params as Node[]) bound(p).forEach((x) => scope.add(x))
      vars(n.body, scope)
      if ((n.body as Node).type === 'BlockStatement')
        lexical((n.body as Node).body as Node[], scope)
      visit(n.params, [...scopes, scope])
      visit(n.body, [...scopes, scope])
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
  for (const key in n) if (key !== 'type' && key !== 'start' && key !== 'end') visit(n[key])
  return out
}

/** the `var`s of a function's body (and its blocks: they are the function's), not of the functions in it */
function vars(node: unknown, scope: Scope): void {
  if (Array.isArray(node)) for (const n of node) vars(n, scope)
  else if (node && typeof node === 'object' && typeof (node as Node).type === 'string') {
    const n = node as Node
    if (/Function|Class/.test(n.type)) return
    if (n.type === 'VariableDeclaration' && n.kind === 'var') bound(n).forEach((x) => scope.add(x))
    for (const key in n) if (key !== 'type' && key !== 'start' && key !== 'end') vars(n[key], scope)
  }
}

/** the names a block's statements declare for the block: `let`, `const`, functions, classes */
function lexical(statements: Node[], scope: Scope = new Set()): Scope {
  for (const s of statements)
    if (
      (s.type === 'VariableDeclaration' && s.kind !== 'var') ||
      s.type === 'FunctionDeclaration' ||
      s.type === 'ClassDeclaration'
    )
      bound(s).forEach((x) => scope.add(x))
  return scope
}

interface Part {
  node: Node
  /** the top-level names it declares, if removing it is a matter of nobody using them */
  declares: string[]
  /** the names it refers to (its own may be among them) */
  uses: Set<string>
  /** replaced by: '' (removed), a shorter statement (an import or an export list), or kept as it is */
  text?: string
}

/**
 * The browser's copy of a page's route file: its server exports removed (`loader`, `action`, `actions`…), then
 * what only they used: the imports and top-level declarations the code kept doesn't reach. Conservative: a
 * name the code kept refers to keeps its declaration, so what is left over is at worst unused code, which
 * Fondu's server-only guard stops when it is server code (`*.server.ts`, `routes/*.ts`). Lines stay where they were.
 */
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
      const kept = specifiers.filter((s) => !SERVER_EXPORTS.has(nameOf(s.exported)))
      if (kept.length === specifiers.length) continue
      const source = node.source
        ? ` from ${code.slice((node.source as Node).start, (node.source as Node).end)}`
        : ''
      part.text = kept.length
        ? `export { ${kept.map((s) => code.slice(s.start, s.end)).join(', ')} }${source};`
        : ''
      // what it exported is only named here now: an import or a declaration it named may go too
      part.uses = references(kept.map((s) => s.local))
      continue
    }
    if (node.type === 'ImportDeclaration' && (node.specifiers as Node[]).length)
      part.declares = (node.specifiers as Array<Node & { local: Name }>).map((s) => nameOf(s.local))
    else if (['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration'].includes(node.type))
      part.declares = bound(node)
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
      const specifiers = part.node.specifiers as Array<Node & { local: Name }>
      const used = specifiers.filter((s) => reached.has(nameOf(s.local)))
      if (used.length < specifiers.length)
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

/** an import with these of its specifiers only: `import a, { b as c } from 'x'` */
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

/** The browser's copy of every page's route file (`.tsx`, `.jsx` in `app/routes/`): its server code removed */
export function stripRoutes(): Plugin {
  let root = process.cwd()
  return {
    name: 'fondu:strip-routes',
    enforce: 'post', // after the JSX is compiled: plain JavaScript to read
    configResolved(c) {
      root = c.root
    },
    transform(code, id) {
      if (this.environment.config.consumer !== 'client') return
      const file = relative(`${root}/app/routes`, id.split('?')[0]!).split(sep).join('/')
      if (file.startsWith('..') || !isPageFile(file) || file.endsWith('.mdx')) return
      const stripped = stripServerCode(code, this.parse(code) as unknown as { body: Node[] }, file)
      return stripped === code ? undefined : { code: stripped, map: null }
    },
  }
}
