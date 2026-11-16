import type { FonduOptions } from './index.js'

const TARGETS = ['node', 'bun', 'cloudflare']
const KEYS = ['target', 'ssr', 'react', 'prerender', 'progress']
const PROGRESS_KEYS = ['delay', 'color', 'forms']

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const show = (v: unknown) => (typeof v === 'string' ? `'${v}'` : String(v))

/**
 * Checks the options of `fondu()` when the plugin is created, so that a wrong one fails at once, with the option's
 * name and what it may be (not as a TypeError, or never). The types say it for TypeScript; a `vite.config.js`, or a
 * cast, has no such check. `react` is the options of @vitejs/plugin-react: its keys as its types define them, and
 * the keys it may get later are its own to refuse.
 */
export function checkOptions(options: unknown): asserts options is FonduOptions {
  const fail = (message: string): never => {
    throw new Error(`fondu(): ${message}`)
  }
  if (options === undefined || options === null)
    fail("the options are required, at least `target`: 'node', 'bun' or 'cloudflare'")
  if (!isObject(options)) return fail("the options are an object: `fondu({ target: 'node' })`")
  const unknown = (keys: string[], allowed: string[], prefix = '') => {
    const extra = keys.filter((k) => !allowed.includes(k))
    if (extra.length)
      fail(
        `unknown option${extra.length > 1 ? 's' : ''} ${extra.map((k) => `\`${prefix}${k}\``).join(', ')}. The options are ${allowed.join(', ')}` +
          (!prefix && extra.includes('port')
            ? '. There is no `port` option: the built server listens on the environment variable `PORT`, else 3000 (`PORT=8080 node dist/server/index.js`)'
            : ''),
      )
  }
  unknown(Object.keys(options), KEYS)
  const { target, ssr, prerender, progress, react } = options
  if (target === undefined) fail("`target` is required: 'node', 'bun' or 'cloudflare'")
  if (!TARGETS.includes(target as string))
    fail(`\`target\` must be 'node', 'bun' or 'cloudflare', not ${show(target)}`)
  for (const [name, value] of Object.entries({ ssr, prerender }))
    if (value !== undefined && typeof value !== 'boolean')
      fail(`\`${name}\` must be true or false, not ${show(value)}`)
  if (progress !== undefined && progress !== false) {
    if (!isObject(progress))
      fail(`\`progress\` must be false or an object: ${PROGRESS_KEYS.join(', ')}`)
    const p = progress as Record<string, unknown>
    unknown(Object.keys(p), PROGRESS_KEYS, 'progress.')
    if (p.delay !== undefined && (typeof p.delay !== 'number' || !(p.delay >= 0)))
      fail(`\`progress.delay\` must be a number of milliseconds, 0 or more, not ${show(p.delay)}`)
    if (p.color !== undefined && typeof p.color !== 'string')
      fail(`\`progress.color\` must be a CSS color, a string, not ${show(p.color)}`)
    if (p.forms !== undefined && typeof p.forms !== 'boolean')
      fail(`\`progress.forms\` must be true or false, not ${show(p.forms)}`)
  }
  if (react !== undefined) {
    if (!isObject(react)) fail('`react` must be an object (the options of @vitejs/plugin-react)')
    const r = react as Record<string, unknown>
    if (r.jsxRuntime !== undefined && r.jsxRuntime !== 'automatic' && r.jsxRuntime !== 'classic')
      fail(`\`react.jsxRuntime\` must be 'automatic' or 'classic', not ${show(r.jsxRuntime)}`)
    for (const name of ['jsxImportSource', 'reactRefreshHost'])
      if (r[name] !== undefined && typeof r[name] !== 'string')
        fail(`\`react.${name}\` must be a string, not ${show(r[name])}`)
    for (const name of ['include', 'exclude']) {
      const v = r[name]
      const one = (x: unknown) => typeof x === 'string' || x instanceof RegExp
      if (v !== undefined && !(one(v) || (Array.isArray(v) && v.every(one))))
        fail(`\`react.${name}\` must be a string, a RegExp or an array of them`)
    }
    const compiler = r.compiler
    if (compiler !== undefined && typeof compiler !== 'boolean' && !isObject(compiler))
      fail(`\`react.compiler\` must be true, false or an object, not ${show(compiler)}`)
  }
}
