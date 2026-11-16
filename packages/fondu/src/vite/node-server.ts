import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * The dev server's own `@hono/node-server`, as an ES module (its CommonJS build would be another class): found
 * through `@hono/vite-dev-server` (its dependency, not the app's), by the path of its main file (`dist/index.js`, a
 * directory below the package) and by the shape of its `exports` (`'.'`: `import`, a path or `{ default }`). That is
 * what this relies on: when it no longer holds, the error says so (test/node-globals.test.ts runs it on the
 * installed version).
 */
export async function devServerNodeServer(
  devServer = createRequire(import.meta.url).resolve('@hono/vite-dev-server'),
): Promise<{ getRequestListener: (fetch: () => Response) => unknown }> {
  let looked = `.../@hono/node-server/dist/index.js (its CommonJS main), resolved from ${devServer}`
  const fail = (why: string, cause?: unknown): never => {
    throw new Error(
      `fondu: @hono/vite-dev-server's own @hono/node-server was not found as expected: ${why}. Fondu looks for ` +
        `${looked}; then ../package.json with exports['.'].import, an ES module with getRequestListener. ` +
        `Report it: https://github.com/fondujs/fondu/issues, with the versions of @hono/vite-dev-server and @hono/node-server.`,
      { cause },
    )
  }
  let dir = ''
  try {
    dir = dirname(dirname(createRequire(devServer).resolve('@hono/node-server'))) // …/dist/index.js
  } catch (error) {
    return fail('it cannot be resolved', error)
  }
  looked = `${join(dir, 'package.json')}`
  let pkg: { version?: string; exports?: { '.'?: { import?: string | { default?: string } } } }
  try {
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  } catch (error) {
    return fail('its package.json cannot be read', error)
  }
  looked = `${join(dir, 'package.json')} (version ${pkg.version ?? 'unknown'})`
  const entry = pkg.exports?.['.']?.import
  const file = typeof entry === 'string' ? entry : entry?.default
  if (typeof file !== 'string') return fail("it has no exports['.'].import")
  let module: { getRequestListener?: unknown }
  try {
    module = await import(pathToFileURL(join(dir, file)).href)
  } catch (error) {
    return fail(`${file} cannot be imported`, error)
  }
  if (typeof module.getRequestListener !== 'function')
    return fail(`${file} has no getRequestListener`)
  return module as { getRequestListener: (fetch: () => Response) => unknown }
}
