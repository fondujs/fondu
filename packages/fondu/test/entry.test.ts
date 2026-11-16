// The built server's entry (dist/server/index.js): the port, on Bun and on Node.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { entryCode } from '../src/vite/index.js'

const hasBun = spawnSync('bun', ['--version']).status === 0
const exportLine = (code: string) => code.split('\n').find((l) => l.startsWith('export default'))!

describe('the generated entry: port', () => {
  test('Bun: the default export has no port of its own (Bun reads PORT, else 3000), the websocket kept', () => {
    const code = entryCode({ target: 'bun' }, [])
    expect(exportLine(code)).toBe(
      'export default app.websocket ? { fetch: main.fetch, websocket: app.websocket } : main',
    )
    expect(code).not.toMatch(/\bport:/)
  })
  test('Node: PORT, else 3000', () => {
    expect(entryCode({ target: 'node' }, [])).toContain('port: Number(process.env.PORT) || 3000')
    // an option that is no more is not read
    expect(entryCode({ target: 'node', port: 4567 } as never, [])).not.toContain('4567')
    expect(entryCode({ target: 'bun', port: 4567 } as never, [])).not.toContain('4567')
  })
})

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as { port: number }
      s.close(() => resolve(port))
    })
  })

describe.skipIf(!hasBun)('the generated entry, run by Bun', { timeout: 30_000 }, () => {
  // the entry beside a stub app, inside the package (its node_modules: hono): answers on `expected`
  const check = async (env: Record<string, string>, websocket: boolean, expected: number) => {
    const dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.entry-'))
    let child: ChildProcess | undefined
    let exited: Promise<unknown> = Promise.resolve()
    try {
      mkdirSync(join(dir, 'server'))
      writeFileSync(
        join(dir, 'server/index.js'),
        entryCode({ target: 'bun' }, []).replace(
          /await import\('\/app\/server\.ts'\)/,
          "await import('./app.js')",
        ),
      )
      writeFileSync(
        join(dir, 'server/app.js'),
        `import { Hono } from 'hono'\nconst app = new Hono()\napp.get('/', (c) => c.text('ok'))\n${websocket ? 'app.websocket = { message() {} }\n' : ''}export default app\n`,
      )
      // started once its files are written (before, Bun may find no module: a start that never answers)
      child = spawn('bun', [join(dir, 'server/index.js')], {
        env: { ...process.env, PORT: '', BUN_PORT: '', ...env },
        stdio: 'ignore',
      })
      exited = new Promise((r) => child!.once('exit', r))
      let answer: string | null = null
      for (let i = 0; i < 300 && answer === null; i++)
        answer = await fetch(`http://127.0.0.1:${expected}/`)
          .then((r) => r.text())
          .catch(() => new Promise<null>((r) => setTimeout(r, 50, null)))
      expect(answer).toBe('ok')
    } finally {
      child?.kill()
      await exited
      rmSync(dir, { recursive: true })
    }
  }
  test('PORT sets the port', async () => {
    const port = await freePort()
    await check({ PORT: String(port) }, false, port)
  })
  test('with a websocket, the same', async () => {
    const port = await freePort()
    await check({ PORT: String(port) }, true, port)
  })
})
