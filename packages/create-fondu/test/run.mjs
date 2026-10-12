// Scaffolds an app for each target with the fondu of this repository (packed, as npm would ship it), then
// installs, builds, typechecks and serves it: the home page server-rendered, a 404 page. `bun run test` here.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = new URL('..', import.meta.url).pathname
const work = mkdtempSync(join(tmpdir(), 'create-fondu-'))
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
const tarball = join(work, sh('npm', ['pack', '--silent', '--pack-destination', work], join(here, '../fondu')).trim())

const targets = {
  node: ['node', ['dist/index.js']],
  bun: ['bun', ['dist/index.js']],
  cloudflare: ['npx', ['vite', 'preview', '--port', '4173', '--strictPort']],
}
const ports = { node: 3000, bun: 3000, cloudflare: 4173 }
let failed = false

for (const [target, [cmd, args]] of Object.entries(targets).filter(
  ([t]) => !process.argv[2] || t === process.argv[2],
)) {
  const app = join(work, `app-${target}`)
  sh('node', [join(here, 'index.js'), app, '--target', target, '--no-install'], work)
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  pkg.dependencies.fondu = `file:${tarball}`
  writeFileSync(join(app, 'package.json'), JSON.stringify(pkg, null, 2))
  sh('bun', ['install'], app)
  sh('bun', ['run', 'build'], app)
  sh('bun', ['run', 'typecheck'], app) // after the build: it writes app/fondu.gen.d.ts

  const server = spawn(cmd, args, { cwd: app, stdio: 'ignore', detached: true })
  try {
    const base = `http://localhost:${ports[target]}`
    const home = await retry(() => fetch(base + '/', { headers: { Accept: 'text/html' } }))
    const html = await home.text()
    const missing = await fetch(base + '/nope', { headers: { Accept: 'text/html' } })
    const checks = {
      'home: 200, server-rendered':
        home.status === 200 && html.includes('data-server-rendered') && html.includes('Hello from Hono'),
      'an unknown URL: the error page, 404':
        missing.status === 404 && (await missing.text()).includes('"component":"error"'),
      'a Content Security Policy': /script-src 'self' 'nonce-/.test(home.headers.get('content-security-policy') ?? ''),
    }
    for (const [name, ok] of Object.entries(checks)) {
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${target}: ${name}`)
      failed ||= !ok
    }
  } finally {
    process.kill(-server.pid)
  }
}
rmSync(work, { recursive: true, force: true })
process.exit(failed ? 1 : 0)

async function retry(request) {
  for (let i = 0; ; i++) {
    try {
      return await request()
    } catch (error) {
      if (i === 60) throw error
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}
