import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createBuilder, type InlineConfig } from 'vite'

import fondu, { type FonduOptions } from '../../src/vite/index.js'

/** inside the package, so the app finds react, hono and fondu in node_modules as a workspace app does */
const TMP = fileURLToPath(new URL('../../.tmp-build/', import.meta.url))

/** an app's files (`app/routes/…`) in a directory of its own, removed by `remove()` */
export function tempApp(files: Record<string, string>) {
  mkdirSync(TMP, { recursive: true })
  const root = mkdtempSync(join(TMP, 'app-'))
  const all = { 'package.json': '{"type":"module"}', 'app/server.ts': '', ...files }
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), text)
  }
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) }
}

/** the client build of the app at `root` (dist/client), as `vite build` makes it */
export async function buildClient(
  root: string,
  options: Partial<FonduOptions> = {},
  config: InlineConfig = {},
) {
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [fondu({ target: 'node', ...options })],
    ...config,
  })
  await builder.build(builder.environments.client!)
}
