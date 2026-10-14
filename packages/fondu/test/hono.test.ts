import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import { HONO } from '../src/vite/index.js'

// The Worker's dependency optimizer is told what fondu imports from Hono (fondu itself is not pre-bundled): every
// runtime import of src/ is in the list
test('HONO lists the Hono modules fondu imports', () => {
  const src = new URL('../src', import.meta.url).pathname
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'))
  const imported = new Set(
    files.flatMap((f) =>
      [...readFileSync(join(src, f), 'utf8').matchAll(/^import (?!type )[^']*'(hono(?:\/[\w-]+)*)'/gm)].map(
        (m) => m[1]!,
      ),
    ),
  )
  expect([...imported].sort()).toEqual([...HONO].sort())
})
