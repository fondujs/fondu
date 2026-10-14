// Scaffolds an app for each target with the fondu of this repository (packed, as npm would ship it), installs it,
// runs it in development (`dev`), then builds, typechecks and runs it in production (`start` / `preview`): the home
// page server-rendered, a 404 page, the server saying where it listens. `bun run test [target]` here.
import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stripVTControlCharacters } from 'node:util'

const here = new URL('..', import.meta.url).pathname
const work = mkdtempSync(join(tmpdir(), 'create-fondu-'))
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })
const tarball = join(work, sh('npm', ['pack', '--silent', '--pack-destination', work], join(here, '../fondu')).trim())

const production = {
  node: { script: 'start', port: 3000, says: 'Listening on http://localhost:3000' },
  bun: { script: 'start', port: 3000, says: 'Started server: http://localhost:3000' },
  cloudflare: { script: 'preview', port: 4173, says: 'http://localhost:4173' },
}
let failed = false
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`)
  failed ||= !ok
}

for (const target of Object.keys(production).filter((t) => !process.argv[2] || t === process.argv[2])) {
  const app = join(work, `my_app.${target}-2.0`) // a name with characters a Worker's name may not have
  sh('node', [join(here, 'index.js'), app, '--target', target, '--no-install'], work)
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  pkg.dependencies.fondu = `file:${tarball}`
  writeFileSync(join(app, 'package.json'), JSON.stringify(pkg, null, 2))
  sh('bun', ['install'], app)

  // development: the page renders, and every module the browser would load is served without Vite finding a
  // dependency late (which reloads the page)
  await run(app, 'dev', 5173, async (base, output) => {
    const html = await (await page(base + '/')).text()
    await crawl(base, html)
    check(
      `${target} dev: home server-rendered`,
      html.includes('data-server-rendered') && html.includes('Hello from Hono'),
      output(),
    )
    check(
      `${target} dev: no reload for a late dependency`,
      !output().includes('optimized dependencies changed'),
      output(),
    )
  })

  // Node / Bun: the home page prerendered (Cloudflare's static pages are checked by fondu.dev's build)
  const prerendered = target !== 'cloudflare'
  if (prerendered) {
    const config = join(app, 'vite.config.ts')
    writeFileSync(
      config,
      readFileSync(config, 'utf8').replace(`target: '${target}' }`, `target: '${target}', prerender: true }`),
    )
    writeFileSync(
      join(app, 'app/routes/index.ts'),
      readFileSync(join(app, 'app/routes/index.ts'), 'utf8') + 'export const prerender = true\n',
    )
  }
  sh('bun', ['run', 'build'], app)
  if (target === 'cloudflare')
    check(
      'cloudflare build: the client manifest is not deployed',
      readFileSync(join(app, 'dist/client/.assetsignore'), 'utf8').split('\n').includes('.vite'),
    )
  sh('bun', ['run', 'typecheck'], app) // after the build: it writes app/fondu.gen.d.ts
  const { script, port, says } = production[target]
  await run(app, script, port, async (base, output) => {
    const home = await page(base + '/')
    const html = await home.text()
    const missing = await page(base + '/nope')
    check(
      `${target} ${script}: home server-rendered`,
      home.status === 200 && html.includes('data-server-rendered') && html.includes('Hello from Hono'),
    )
    check(
      `${target} ${script}: an unknown URL, the error page with 404`,
      missing.status === 404 && (await missing.text()).includes('"component":"error"'),
    )
    check(
      `${target} ${script}: a Content Security Policy`,
      /script-src 'self' 'nonce-/.test(home.headers.get('content-security-policy') ?? ''),
    )
    if (prerendered)
      check(
        `${target} ${script}: the home page from its prerendered file, with the security headers`,
        html === readFileSync(join(app, 'dist/client/index.html'), 'utf8') &&
          home.headers.has('content-security-policy'),
      )
    check(`${target} ${script}: says where it listens`, output().includes(says), output())
  })
}
rmSync(work, { recursive: true, force: true })
process.exit(failed ? 1 : 0)

/** `bun run <script>` in the app until `test` is done, with what it printed */
async function run(app, script, port, test) {
  const args = script === 'start' ? ['run', script] : ['run', script, '--port', String(port)] // start: PORT, default 3000
  const server = spawn('bun', args, { cwd: app, detached: true })
  let log = ''
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => (log += chunk))
  try {
    await page(`http://localhost:${port}/`)
    await test(`http://localhost:${port}`, () => stripVTControlCharacters(log))
  } finally {
    process.kill(-server.pid)
    await new Promise((r) => server.on('exit', r))
  }
}

/** a document request, retried while the server starts */
async function page(url) {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, { headers: { Accept: 'text/html' } })
    } catch (error) {
      if (i === 120) throw error
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

/** requests the page's scripts and what they import, as a browser would */
async function crawl(base, html) {
  const seen = new Set()
  const queue = [...html.matchAll(/<script type="module" src="([^"]+)"/g)].map((m) => m[1])
  while (queue.length) {
    const url = queue.shift()
    if (seen.has(url) || !url.startsWith('/')) continue
    seen.add(url)
    const code = await (await fetch(base + url)).text()
    for (const m of code.matchAll(/(?:from|import)\s*\(?\s*["'](\/[^"']+)["']/g)) queue.push(m[1])
  }
  await new Promise((r) => setTimeout(r, 1500)) // a late optimisation would be logged by now
}
