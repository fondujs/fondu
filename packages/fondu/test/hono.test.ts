import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from 'vitest'

import { HONO } from '../src/vite/hono.js'

test('HONO lists the Hono modules fondu imports', () => {
  const src = fileURLToPath(new URL('../src', import.meta.url))
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) =>
    f.endsWith('.ts'),
  )
  const imported = new Set(
    files.flatMap((f) =>
      [
        ...readFileSync(join(src, f), 'utf8').matchAll(
          /^import (?!type )[^']*'(hono(?:\/[\w-]+)*)'/gm,
        ),
      ].map((m) => m[1]!),
    ),
  )
  expect([...imported].sort()).toEqual([...HONO].sort())
})
