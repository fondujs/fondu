import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

test('the starter suite refuses an unknown target or extra arguments', () => {
  const runner = fileURLToPath(new URL('./run.mjs', import.meta.url))
  for (const args of [['ndoe'], ['constructor'], [''], ['node', 'bun']]) {
    const result = spawnSync(process.execPath, [runner, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Usage: node test\/run\.mjs \[node\|bun\|cloudflare\]/)
  }
})
