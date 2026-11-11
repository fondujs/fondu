// Scaffolds an app for each target with the fondu of this repository (packed, as npm would ship it), installs it,
// runs it in development (`dev`), then builds, typechecks and runs it in production (`start` / `preview`): the home
// page server-rendered, a 404 page, the server saying where it listens. `bun run test [target]` here.
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'

const here = fileURLToPath(new URL('..', import.meta.url))
const windows = process.platform === 'win32'
const shell = windows // npm, bun and bunx are .cmd shims on Windows; node is a program
const work = mkdtempSync(join(tmpdir(), 'create-fondu-'))
const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    shell: shell && cmd !== 'node',
  })
const tarball = join(
  work,
  sh('npm', ['pack', '--silent', '--pack-destination', work], join(here, '../fondu')).trim(),
)

// streamed (not prerendered): the boundary waits 2 s on the server
const SLOW = `import { Suspense, use } from 'react'

export default function Slow() {
  const wait =
    typeof document === 'undefined' ? new Promise<void>((r) => setTimeout(r, 2000)) : undefined
  return (
    <>
      <title>Slow</title>
      <h1>Shell</h1>
      <Suspense fallback={<p id="fallback">Loading</p>}>
        <Later wait={wait} />
      </Suspense>
    </>
  )
}

function Later({ wait }: { wait?: Promise<void> }) {
  if (wait) use(wait)
  return <p id="late">Late content</p>
}
`

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

// without a terminal (stdin not one), or with --yes: nothing asked; where the app runs has to be given
{
  const run = (...args) => {
    const cwd = mkdtempSync(join(work, 'cli-'))
    try {
      execFileSync('node', [join(here, 'index.js'), ...args, '--no-install', '--no-git'], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20_000,
      })
      return { status: 0, made: existsSync(join(cwd, 'my-app')) }
    } catch (error) {
      return { status: error.status, made: existsSync(join(cwd, 'my-app')) }
    }
  }
  const asked = [run('--yes'), run('my-app'), run('--target', 'constructor', '--yes')]
  check(
    'cli: no --target with --yes or without a terminal, or an unknown one: exit 1, nothing made',
    asked.every((r) => r.status === 1 && !r.made),
    JSON.stringify(asked),
  )
  const given = run('--target', 'node')
  check(
    'cli: no terminal, --target given: my-app made',
    given.status === 0 && given.made,
    JSON.stringify(given),
  )
}

for (const target of Object.keys(production).filter(
  (t) => !process.argv[2] || t === process.argv[2],
)) {
  // a name with characters a Worker's name may not have, and one a package's may not (~)
  const app = join(work, `my_app~.${target}-2.0`)
  sh('node', [join(here, 'index.js'), app, '--target', target, '--no-install'], work)
  const agents = readFileSync(join(app, 'AGENTS.md'), 'utf8')
  check(
    `${target}: AGENTS.md filled in, no code checks unless asked`,
    !agents.includes('{{') && !agents.includes('Code checks'),
  )
  const greeting = target === 'cloudflare' ? 'Hello from Cloudflare' : 'Hello from Fondu' // a Worker variable
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  check(
    `${target}: the package named after its folder`,
    pkg.name === `my_app-.${target}-2.0`,
    pkg.name,
  )
  pkg.dependencies.fondu = `file:${tarball}`
  writeFileSync(join(app, 'package.json'), JSON.stringify(pkg, null, 2))
  sh('bun', ['install'], app)
  // a page with a Suspense boundary that is slow on the server: streamed; and a copy of it that is prerendered
  writeFileSync(join(app, 'app/routes/slow.tsx'), SLOW)
  writeFileSync(join(app, 'app/routes/slow-static.tsx'), SLOW + 'export const prerender = true\n')

  // development: the page renders, and every module the browser would load is served without Vite finding a
  // dependency late (which reloads the page)
  await run(app, 'dev', 5173, async (base, output) => {
    const html = await (await page(base + '/')).text()
    await crawl(base, html)
    check(
      `${target} dev: home server-rendered`,
      /<div id="app"><\w/.test(html) && html.includes(greeting),
      output(),
    )
    check(
      `${target} dev: no reload for a late dependency`,
      !output().includes('optimized dependencies changed'),
      output(),
    )
    await bodyLimit(base, output, target, 'dev')
    await streams(base, target, 'dev')
  })

  // the home page prerendered
  const config = join(app, 'vite.config.ts')
  writeFileSync(
    config,
    readFileSync(config, 'utf8').replace(
      `target: '${target}' }`,
      `target: '${target}', prerender: true }`,
    ),
  )
  writeFileSync(
    join(app, 'app/routes/index.tsx'),
    readFileSync(join(app, 'app/routes/index.tsx'), 'utf8') + 'export const prerender = true\n',
  )
  sh('bun', ['run', 'build'], app)
  const dist = join(app, 'dist/client')
  const staticHome = existsSync(join(dist, 'index.html'))
    ? readFileSync(join(dist, 'index.html'), 'utf8')
    : ''
  check(`${target} build: the home page prerendered, its file`, staticHome.includes(greeting))
  const staticSlow = existsSync(join(dist, 'slow-static.html'))
    ? readFileSync(join(dist, 'slow-static.html'), 'utf8')
    : ''
  check(
    `${target} build: a prerendered page with a slow Suspense boundary has its content and no script of React's`,
    staticSlow.includes('<p id="late">Late content</p>') &&
      !staticSlow.includes('id="fallback"') &&
      !staticSlow.includes('$RC'),
    staticSlow.slice(0, 300),
  )
  if (target !== 'cloudflare') {
    const file = join(app, 'dist/server/prerender.json')
    const written = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).headers ?? {}) : {}
    const policy = written['content-security-policy'] ?? ''
    check(
      `${target} build: dist/server/prerender.json has the headers, a Content Security Policy with hashes and no nonce`,
      /script-src 'self' 'sha256-/.test(policy) && !policy.includes("'nonce-"),
      policy,
    )
  }
  if (target === 'cloudflare') {
    const pageFile = join(dist, '_fondu/pages/index.json')
    check(
      'cloudflare build: the home page object, its JSON',
      existsSync(pageFile) && JSON.parse(readFileSync(pageFile, 'utf8')).component === 'index',
    )
    const headersFile = join(dist, '_headers')
    const headers = existsSync(headersFile) ? readFileSync(headersFile, 'utf8') : ''
    const rule = (path) =>
      headers.match(new RegExp(`^${path.replace('*', '\\*')}\\n((?:[ \\t]+.*\\n?)*)`, 'm'))?.[1] ??
      ''
    check(
      'cloudflare build: _headers, a Content Security Policy without a nonce for /*',
      /Content-Security-Policy/i.test(rule('/*')) && !rule('/*').includes("'nonce-"),
      headers,
    )
    check(
      'cloudflare build: _headers, X-Fondu for /_fondu/pages/*',
      /X-Fondu: true/i.test(rule('/_fondu/pages/*')),
      headers,
    )
    check(
      'cloudflare build: the client manifest is not deployed',
      readFileSync(join(dist, '.assetsignore'), 'utf8').split('\n').includes('.vite'),
    )
  }
  // Cloudflare: the Worker's types first (create-fondu writes them after its own install)
  if (target === 'cloudflare') sh('bun', ['run', 'cf-typegen'], app)
  sh('bun', ['run', 'typecheck'], app) // after the build: it writes app/fondu.gen.d.ts
  const { script, port, says } = production[target]
  await run(app, script, port, async (base, output) => {
    const home = await page(base + '/')
    const html = await home.text()
    const missing = await page(base + '/nope')
    check(
      `${target} ${script}: home server-rendered`,
      home.status === 200 && /<div id="app"><\w/.test(html) && html.includes(greeting),
    )
    check(
      `${target} ${script}: an unknown URL, the error page with 404`,
      missing.status === 404 && (await missing.text()).includes('"component":"_error"'),
    )
    await bodyLimit(base, output, target, script)
    await streams(base, target, script)
    const csp = home.headers.get('content-security-policy') ?? ''
    // a static page has no nonce: its policy comes from _headers (Cloudflare) or dist/server/prerender.json
    check(
      `${target} ${script}: a Content Security Policy without a nonce`,
      csp !== '' && !csp.includes("'nonce-"),
      csp,
    )
    if (target !== 'cloudflare') await staticPages(base, app, target, script, home, html, check)
    check(`${target} ${script}: says where it listens`, output().includes(says), output())
  })
}
// --checks: oxfmt and oxlint pass on the app as created; AGENTS.md says how to run them; no git hooks
if (!process.argv[2] || process.argv[2] === 'node') {
  const app = join(work, 'checked')
  sh(
    'node',
    [join(here, 'index.js'), app, '--target', 'node', '--checks', '--yes', '--no-install'],
    work,
  )
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  pkg.dependencies.fondu = `file:${tarball}`
  writeFileSync(join(app, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  execFileSync('bun', ['install'], { cwd: app, stdio: 'ignore', shell })
  const passes = (cmd, ...args) => {
    try {
      sh(cmd, args, app)
      return true
    } catch {
      return false
    }
  }
  check('checks: the new app is formatted (oxfmt --check)', passes('bunx', 'oxfmt', '--check'))
  check('checks: the new app is linted (oxlint)', passes('bunx', 'oxlint'))
  check('checks: and typechecked (the check script)', passes('bun', 'run', 'check'))
  check(
    'checks: no Worker types to ignore outside Cloudflare',
    !readFileSync(join(app, '.oxlintrc.json'), 'utf8').includes('worker-configuration'),
  )
  check(
    "checks: --yes makes a git repository, with no hooks of the app's",
    existsSync(join(app, '.git')) &&
      ['pre-commit', 'commit-msg'].every((hook) => !existsSync(join(app, '.git/hooks', hook))),
  )
  const devDependencies = Object.keys(
    JSON.parse(readFileSync(join(app, 'package.json'), 'utf8')).devDependencies,
  )
  check(
    'checks: no git hook or commit message tools in the app',
    !existsSync(join(app, 'lefthook.yml')) &&
      !existsSync(join(app, 'commitlint.config.js')) &&
      !devDependencies.some((d) => d.includes('lefthook') || d.includes('commitlint')) &&
      devDependencies.includes('oxfmt') &&
      devDependencies.includes('oxlint'),
  )
  const agents = readFileSync(join(app, 'AGENTS.md'), 'utf8')
  check(
    'checks: AGENTS.md says how',
    agents.includes('Code checks') && !agents.includes('lefthook') && !agents.includes('hooks'),
  )
}
rmSync(work, { recursive: true, force: true })
process.exit(failed ? 1 : 0)

/**
 * Node / Bun: the prerendered home page is a file with the build's headers (dist/server/prerender.json), served by
 * the built server's serveStatic before the app; what it must not serve, and what the app answers instead
 */
async function staticPages(base, app, target, script, home, html, check) {
  // the 10 MB upload above may have left a connection the server closed: undici would reuse it once
  const send = async (url, init) => {
    try {
      return await fetch(url, init)
    } catch {
      return fetch(url, init)
    }
  }
  const name = (what) => `${target} ${script}: ${what}`
  const file = (...path) => readFileSync(join(app, ...path), 'utf8')
  const headers = JSON.parse(file('dist/server/prerender.json')).headers
  const csp = home.headers.get('content-security-policy') ?? ''
  const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(([, attrs]) => / nonce="/.test(attrs) && !/\ssrc=/.test(attrs))
    .map(([, , code]) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`)
  check(
    name('the home page from its prerendered file, a hash-based policy and no nonce'),
    html === file('dist/client/index.html') &&
      /script-src 'self' 'sha256-/.test(csp) &&
      !csp.includes("'nonce-") &&
      hashes.length > 0 &&
      hashes.every((h) => csp.includes(h)) &&
      Object.entries(headers).every(([k, v]) => home.headers.get(k) === v) &&
      home.headers.get('cache-control') === 'private, no-cache' &&
      (home.headers.get('content-type') ?? '').startsWith('text/html'),
    `${csp} | ${JSON.stringify(Object.fromEntries(home.headers))}`,
  )
  const object = await send(`${base}/_fondu/pages/index.json`)
  const text = await object.text()
  check(
    name("the home page's page object, from its file, with X-Fondu and the security headers"),
    object.status === 200 &&
      object.headers.get('x-fondu') === 'true' &&
      object.headers.get('content-type') === 'application/json' &&
      object.headers.get('cache-control') === 'private, no-cache' &&
      Object.entries(headers).every(([k, v]) => object.headers.get(k) === v) &&
      text === file('dist/client/_fondu/pages/index.json') &&
      JSON.parse(text).component === 'index',
    `${object.status} ${JSON.stringify(Object.fromEntries(object.headers))}`,
  )
  const head = await send(base + '/', { method: 'HEAD', headers: { Accept: 'text/html' } })
  check(
    name('HEAD of the home page: its headers'),
    head.status === 200 && head.headers.get('content-security-policy') === csp,
  )
  const version = JSON.parse(text).version
  const visit = await send(base + '/', {
    headers: { 'X-Fondu': 'true', ...(version && { 'X-Fondu-Version': version }) },
  })
  const visited = await visit.text()
  check(
    name("a navigation to the home page's own URL is answered by the app, not its file"),
    visit.status === 200 &&
      JSON.parse(visited).component === 'index' &&
      (visit.headers.get('vary') ?? '').includes('X-Fondu') &&
      (visit.headers.get('content-security-policy') ?? '').includes("'nonce-"),
    `${visit.status} ${visited.slice(0, 80)}`,
  )
  const answers = []
  for (const path of ['/index', '/%69ndex']) {
    const res = await page(base + path)
    const body = await res.text()
    answers.push(
      res.status === 404 &&
        body.includes('"component":"_error"') &&
        (res.headers.get('content-security-policy') ?? '').includes("'nonce-"),
    )
  }
  check(
    name('a URL ending in index is answered by the app, never by the home page file'),
    answers.every(Boolean),
    String(answers),
  )
  // the client's manifest: a string only it has
  const manifest = file('dist/client/.vite/manifest.json')
  const only = '"isEntry"'
  const url = new URL(base)
  const outside = []
  for (const path of [
    '/.vite/manifest.json',
    '/_fondu/pages/%2e%2e/%2e%2e/.vite/manifest.json',
    '/_fondu/pages/x%5C..%5C..%5C..%5C.vite%5Cmanifest.json',
    '/_fondu/pages/..%2f..%2f.vite%2fmanifest.json',
    '/_fondu/pages/../../.vite/manifest.json',
    '/%2e%2e/secret',
    '/%00',
    '/_fondu/pages/index%00.json',
  ])
    for (const headers of [{ Accept: 'text/html' }, { 'X-Fondu': 'true' }]) {
      const res = await raw(url, path, headers)
      outside.push(
        res.status < 500 &&
          (res.status !== 200) === true &&
          !res.body.includes(only) &&
          res.body !== manifest,
      )
      if (!outside.at(-1))
        console.log(
          `  ${path} ${JSON.stringify(headers)} -> ${res.status} ${res.body.slice(0, 80)}`,
        )
    }
  check(
    name('the client manifest and files outside the build are not served (the path as sent)'),
    manifest.includes(only) && outside.every(Boolean),
    String(outside),
  )
}

/** a request with its path exactly as given (`fetch` would normalize `%2e%2e`) */
function raw(url, path, headers) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: url.hostname, port: url.port, path, method: 'GET', headers },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (d) => (body += d))
        res.on('end', () => resolve({ status: res.statusCode, body }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

// a body over 10 MB is refused (createApp's bodyLimit), a small one is not. An URL of no page, so that a prerendered
// home (a static file on Cloudflare, answered 405 to a POST) doesn't hide the app
async function bodyLimit(base, log, target, script) {
  const json = { 'Content-Type': 'application/json' }
  let status, error
  try {
    const big = await fetch(base + '/nope', {
      method: 'POST',
      headers: json,
      body: 'a'.repeat(10 * 1024 * 1024 + 1),
    })
    await big.text()
    status = big.status
  } catch (e) {
    error = e.message
  }
  // Cloudflare's local preview: the Worker answers 413 before the upload ends; the preview's proxy then fails the
  // request it was still sending (500), which a deployed Worker's client does not see. So the Worker's answer is
  // read from its log
  let logged = false
  if (target === 'cloudflare' && script === 'preview' && status !== 413)
    for (let i = 0; i < 20 && !logged; i++) {
      logged = /POST \/nope 413/.test(log())
      if (!logged) await new Promise((r) => setTimeout(r, 100))
    }
  const small = await fetch(base + '/nope', { method: 'POST', headers: json, body: '{}' })
  await small.text()
  check(
    `${target} ${script}: a request body over 10 MB is refused with 413, a small one is not`,
    (status === 413 || logged) && small.status !== 413,
    `over 10 MB: ${status ?? `no status (${error})`}, the Worker's log has its 413: ${logged}, small: ${small.status}`,
  )
}

/** `bun run <script>` in the app until `test` is done, with what it printed */
async function run(app, script, port, test) {
  const args = script === 'start' ? ['run', script] : ['run', script, '--port', String(port)] // start: PORT, default 3000
  const server = spawn('bun', args, { cwd: app, detached: !windows, shell })
  let log = ''
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => (log += chunk))
  try {
    await page(`http://localhost:${port}/`)
    await test(`http://localhost:${port}`, () => stripVTControlCharacters(log))
  } finally {
    if (windows)
      execFileSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-server.pid) // the process group
    await new Promise((r) => server.on('exit', r))
  }
}

/**
 * A document read chunk by chunk: the shell is sent at once and the boundary 2 s later, so the first chunk has the
 * fallback and not the content, and the last comes at least 1.5 s after it (a gap: a cold start doesn't matter).
 * Where a target buffers, assert the full body only, and say which target in a comment.
 */
async function streams(base, target, script) {
  await (await page(base + '/slow')).text() // dev compiles the page on its first request
  const res = await page(base + '/slow')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const chunks = []
  const t0 = Date.now()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push({ at: Date.now() - t0, text: decoder.decode(value, { stream: true }) })
  }
  const text = chunks.map((c) => c.text).join('')
  const first = chunks[0]
  const last = chunks.at(-1)
  check(
    `${target} ${script}: a page with a slow Suspense boundary streams: the shell first, the boundary after its data`,
    res.status === 200 &&
      chunks.length >= 2 &&
      first.text.includes('id="fallback"') &&
      !first.text.includes('Late content') &&
      text.includes('<p id="late">Late content</p>') &&
      last.at - first.at >= 1500,
    JSON.stringify(chunks.map((c) => [c.at, c.text.length])),
  )
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
