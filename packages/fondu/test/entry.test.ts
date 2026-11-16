// The built server's entry (dist/server/index.js): the port, on Bun and on Node.
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, test } from 'vitest'

import { entryCode } from '../src/vite/index.js'

const hasBun = spawnSync('bun', ['--version']).status === 0
const exportLine = (code: string) => code.split('\n').find((l) => l.startsWith('export default'))!

describe('the generated entry: port', () => {
  test('Bun: the option is the server’s port, PORT first, the websocket kept', () => {
    const line = exportLine(entryCode({ target: 'bun', port: 4567 }, []))
    expect(line).toContain('port: Number(process.env.PORT) || 4567')
    expect(line).toContain('fetch: main.fetch')
    expect(line).toContain('websocket: app.websocket')
  })
  test('Bun without the option: as before (Bun reads PORT, else 3000)', () => {
    expect(exportLine(entryCode({ target: 'bun' }, []))).toBe(
      'export default app.websocket ? { fetch: main.fetch, websocket: app.websocket } : main',
    )
  })
  test('Node: the option, PORT first, else 3000', () => {
    expect(entryCode({ target: 'node', port: 4567 }, [])).toContain(
      'port: Number(process.env.PORT) || 4567',
    )
    expect(entryCode({ target: 'node' }, [])).toContain('port: Number(process.env.PORT) || 3000')
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
  const check = async (
    options: { port?: number },
    env: Record<string, string>,
    websocket: boolean,
    expected: number,
  ) => {
    const dir = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), '.entry-'))
    const child = spawn('bun', [join(dir, 'server/index.js')], {
      env: { ...process.env, PORT: '', BUN_PORT: '', ...env },
      stdio: 'ignore',
    })
    const exited = new Promise((r) => child.once('exit', r))
    try {
      mkdirSync(join(dir, 'server'))
      writeFileSync(
        join(dir, 'server/index.js'),
        entryCode({ target: 'bun', ...options }, []).replace(
          /import app from '[^']*'/,
          "import app from './app.js'",
        ),
      )
      writeFileSync(
        join(dir, 'server/app.js'),
        `import { Hono } from 'hono'\nconst app = new Hono()\napp.get('/', (c) => c.text('ok'))\n${websocket ? 'app.websocket = { message() {} }\n' : ''}export default app\n`,
      )
      let answer: string | null = null
      for (let i = 0; i < 300 && answer === null; i++)
        answer = await fetch(`http://127.0.0.1:${expected}/`)
          .then((r) => r.text())
          .catch(() => new Promise<null>((r) => setTimeout(r, 50, null)))
      expect(answer).toBe('ok')
    } finally {
      child.kill()
      await exited
      rmSync(dir, { recursive: true })
    }
  }
  test('the option sets the port', async () => {
    const port = await freePort()
    await check({ port }, {}, false, port)
  })
  test('PORT wins over the option', async () => {
    const [port, other] = [await freePort(), await freePort()]
    await check({ port }, { PORT: String(other) }, false, other)
  })
  test('with a websocket, the same', async () => {
    const port = await freePort()
    await check({ port }, {}, true, port)
  })
  test('PORT alone, as before', async () => {
    const port = await freePort()
    await check({}, { PORT: String(port) }, false, port)
  })
})
