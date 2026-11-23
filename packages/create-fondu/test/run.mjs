// Scaffolds an app for each target with the fondu of this repository (packed, as npm would ship it), installs it, runs it in
// development, then builds, typechecks and runs it in production. `bun run test [target]` here.
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'

import { bodyLimit, observeUploads } from './body-limit.mjs'

const here = fileURLToPath(new URL('..', import.meta.url))
const windows = process.platform === 'win32'
const shell = windows // npm, bun and bunx are .cmd shims on Windows; node is a program
const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    shell: shell && cmd !== 'node',
  })

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

// what the server's process.env has of the app's .env (test/run.mjs sets FONDU_ENV_SET in the shell)
const ENV_ROUTE = `import { defineHandler } from 'fondu'

export const GET = defineHandler((c) =>
  c.json({ file: process.env.FONDU_ENV_FILE ?? null, set: process.env.FONDU_ENV_SET ?? null }),
)
`
process.env.FONDU_ENV_SET = 'from-shell'

// the ports: development (Vite's 5173), `start` (Node and Bun, 3000), `preview` (Cloudflare, 4173); each can be moved
// with CREATE_FONDU_DEV_PORT, CREATE_FONDU_START_PORT and CREATE_FONDU_PREVIEW_PORT (two runs on one machine)
const devPort = Number(process.env.CREATE_FONDU_DEV_PORT ?? 5173)
const startPort = Number(process.env.CREATE_FONDU_START_PORT ?? 3000)
const previewPort = Number(process.env.CREATE_FONDU_PREVIEW_PORT ?? 4173)
const production = {
  node: { script: 'start', port: startPort, says: `Listening on http://localhost:${startPort}` },
  bun: { script: 'start', port: startPort, says: `Started server: http://localhost:${startPort}` },
  cloudflare: { script: 'preview', port: previewPort, says: `http://localhost:${previewPort}` },
}
const [requested, ...extra] = process.argv.slice(2)
if (extra.length || (requested !== undefined && !Object.hasOwn(production, requested))) {
  console.error(`Usage: node test/run.mjs [${Object.keys(production).join('|')}]`)
  process.exit(1)
}
const targets = requested === undefined ? Object.keys(production) : [requested]
const work = mkdtempSync(join(tmpdir(), 'create-fondu-'))
const tarball = join(
  work,
  sh('npm', ['pack', '--silent', '--pack-destination', work], join(here, '../fondu')).trim(),
)
let failed = false
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : `  — ${detail}`}`)
  failed ||= !ok
}

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

for (const target of targets) {
  // a name with characters a Worker's name may not have, and one a package's may not (~)
  const app = join(work, `my_app~.${target}-2.0`)
  sh('node', [join(here, 'index.js'), app, '--target', target, '--no-install'], work)
  const agents = readFileSync(join(app, 'AGENTS.md'), 'utf8')
  check(
    `${target}: AGENTS.md filled in, no code checks unless asked`,
    !agents.includes('{{') && !agents.includes('Code checks'),
  )
  const greeting = target === 'cloudflare' ? 'Hello from Cloudflare' : 'Hello from Fondu'
  const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
  check(
    `${target}: engines.node is >=22.12.0 for Node, none for the others`,
    target === 'node' ? pkg.engines?.node === '>=22.12.0' : pkg.engines === undefined,
    JSON.stringify(pkg.engines),
  )
  check(
    `${target}: the package named after its folder`,
    pkg.name === `my_app-.${target}-2.0`,
    pkg.name,
  )
  pkg.dependencies.fondu = `file:${tarball}`
  writeFileSync(join(app, 'package.json'), JSON.stringify(pkg, null, 2))
  sh('bun', ['install'], app)
  check(
    `${target}: fondu's package.json is in the package`,
    existsSync(join(app, 'node_modules/fondu/package.json')),
  )
  // the file the template ships is what a build of it writes, so a new app type-checks its routes before the first build
  const shipped = readFileSync(join(app, 'app/fondu.gen.d.ts'), 'utf8')
  // before any build: a typo in href() is an error, so @ts-expect-error holds
  if (target === 'cloudflare') sh('bun', ['run', 'cf-typegen'], app)
  writeFileSync(
    join(app, 'app/typo.ts'),
    "import { href } from 'fondu/client'\n\n// @ts-expect-error not a route\nexport const typo = href('/typo')\nexport const home = href('/')\n",
  )
  sh('bun', ['run', 'typecheck'], app)
  rmSync(join(app, 'app/typo.ts'))
  sh('bun', ['run', 'build'], app)
  check(
    `${target} build: app/fondu.gen.d.ts, as the template ships it`,
    readFileSync(join(app, 'app/fondu.gen.d.ts'), 'utf8') === shipped,
  )
  rmSync(join(app, 'dist'), { recursive: true, force: true })
  writeFileSync(join(app, 'app/routes/slow.tsx'), SLOW)
  writeFileSync(join(app, 'app/routes/slow-static.tsx'), SLOW + 'export const prerender = true\n')
  writeFileSync(
    join(app, 'app/routes/feed.xml.ts'),
    "import { defineHandler } from 'fondu'\n\nexport const GET = defineHandler((c) => c.body('<rss/>', 200, { 'Content-Type': 'application/xml; charset=utf-8' }))\nexport const prerender = true\n",
  )
  // a route that takes a body: the body limit is in the routes' chains, so a URL of no route is never read
  writeFileSync(
    join(app, 'app/routes/upload.ts'),
    "import { defineHandler } from 'fondu'\n\nexport const POST = defineHandler((c) => c.text('received'))\n",
  )
  if (target === 'cloudflare') observeUploads(app)
  else {
    writeFileSync(join(app, 'app/routes/env.ts'), ENV_ROUTE)
    writeFileSync(join(app, '.env'), 'FONDU_ENV_FILE=from-file\nFONDU_ENV_SET=from-file\n')
  }

  // development: the page renders, and every module the browser would load is served without Vite finding a
  // dependency late (which reloads the page)
  await run(app, 'dev', devPort, async (base, output) => {
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
    await bodyLimit(base, output, target, 'dev', check)
    await streams(base, target, 'dev')
    if (target !== 'cloudflare') await dotenv(base, target, 'dev', 'from-file')
  })

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
  check(
    `${target} build: a prerendered .ts route is the file it answers, no page`,
    existsSync(join(dist, 'feed.xml')) &&
      readFileSync(join(dist, 'feed.xml'), 'utf8') === '<rss/>' &&
      !existsSync(join(dist, 'feed.xml.html')) &&
      !existsSync(join(dist, '_fondu/pages/feed.xml.json')),
  )
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
    await bodyLimit(base, output, target, script, check)
    await streams(base, target, script)
    const feed = await fetch(`${base}/feed.xml`)
    check(
      `${target} ${script}: a prerendered .ts route is served as its file, as application/xml`,
      feed.status === 200 &&
        (feed.headers.get('content-type') ?? '').startsWith('application/xml') &&
        (await feed.text()) === '<rss/>',
      `${feed.status} ${feed.headers.get('content-type')}`,
    )
    const csp = home.headers.get('content-security-policy') ?? ''
    // a static page has no nonce: its policy comes from _headers (Cloudflare) or dist/server/prerender.json
    check(
      `${target} ${script}: a Content Security Policy without a nonce`,
      csp !== '' && !csp.includes("'nonce-"),
      csp,
    )
    if (target !== 'cloudflare') await staticPages(base, app, target, script, home, html, check)
    // a prefetch (the pointer resting on a link): a static page's data is its file, another page's is 204
    const prefetch = (path) =>
      fetch(base + path, { headers: { 'X-Fondu': 'true', 'X-Fondu-Prefetch': 'true' } })
    const prefetched = await prefetch('/_fondu/pages/index.json')
    const none = await prefetch('/_fondu/pages/nope.json')
    check(
      `${target} ${script}: a prefetch: the static page's data is its file, another page's is 204`,
      prefetched.status === 200 &&
        prefetched.headers.get('x-fondu') === 'true' &&
        none.status === 204,
      `${prefetched.status} ${none.status}`,
    )
    check(`${target} ${script}: says where it listens`, output().includes(says), output())
    if (target !== 'cloudflare') await dotenv(base, target, script, 'from-file')
  })
  if (target !== 'cloudflare') {
    rmSync(join(app, '.env'))
    await run(app, script, port, async (base) => {
      await dotenv(base, target, `${script}, no .env`, null)
    })
  }
}
// --checks: oxfmt and oxlint pass on the app as created; AGENTS.md says how to run them; no git hooks
if (targets.includes('node')) {
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

// Node / Bun: the prerendered home page is a file with the build's headers (dist/server/prerender.json), served before the app
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

async function dotenv(base, target, script, file) {
  const res = await fetch(base + '/env')
  const body = await res.json().catch(() => ({}))
  check(
    `${target} ${script}: .env is in process.env, a variable already set wins`,
    res.status === 200 && body.file === file && body.set === 'from-shell',
    JSON.stringify(body),
  )
}

/** `fetch` would normalize `%2e%2e` */
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

async function run(app, script, port, test) {
  const args = script === 'start' ? ['run', script] : ['run', script, '--port', String(port)] // start: PORT, default 3000
  const env = script === 'start' ? { ...process.env, PORT: String(port) } : process.env
  const server = spawn('bun', args, { cwd: app, detached: !windows, shell, env })
  let log = ''
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => (log += chunk))
  try {
    await page(`http://localhost:${port}/`)
    await test(`http://localhost:${port}`, () => stripVTControlCharacters(log))
  } finally {
    if (windows)
      execFileSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' })
    else process.kill(-server.pid)
    await new Promise((r) => server.on('exit', r))
  }
}

// The shell is sent at once and the boundary 2 s later, so the first chunk has the fallback and the last comes at least
// 1.5 s after it (a gap: a cold start doesn't matter). Where a target buffers, assert the full body only, and say which
// target in a comment.
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
