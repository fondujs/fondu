// Scaffolds an app for each target with the fondu of this repository (packed, as npm would ship it), installs it,
// runs it in development (`dev`), then builds, typechecks and runs it in production (`start` / `preview`): the home
// page server-rendered, a 404 page, the server saying where it listens. `bun run test [target]` here.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'

const here = fileURLToPath(new URL('..', import.meta.url))
const windows = process.platform === 'win32'
const shell = windows // npm, bun and bunx are .cmd shims on Windows; node and git are programs
const work = mkdtempSync(join(tmpdir(), 'create-fondu-'))
const sh = (cmd, args, cwd) =>
  execFileSync(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    shell: shell && !['node', 'git'].includes(cmd),
  })
const tarball = join(
  work,
  sh('npm', ['pack', '--silent', '--pack-destination', work], join(here, '../fondu')).trim(),
)

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
  if (target === 'cloudflare') {
    check('cloudflare build: the home page prerendered, its file', staticHome.includes(greeting))
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
    const csp = home.headers.get('content-security-policy') ?? ''
    // a static page has no nonce: its policy comes from _headers
    check(
      `${target} ${script}: a Content Security Policy`,
      target === 'cloudflare'
        ? csp !== '' && !csp.includes("'nonce-")
        : /script-src 'self' 'nonce-/.test(csp),
      csp,
    )
    if (target !== 'cloudflare')
      check(
        `${target} ${script}: the home page from its prerendered file, with the security headers (its nonce)`,
        unNonced(html) === unNonced(readFileSync(join(app, 'dist/client/index.html'), 'utf8')) &&
          [...html.matchAll(/ nonce="([^"]+)"/g)].every(([, n]) =>
            home.headers.get('content-security-policy')?.includes(`'nonce-${n}'`),
          ),
      )
    check(`${target} ${script}: says where it listens`, output().includes(says), output())
  })
}
// --checks: oxfmt and oxlint pass on the app as created; AGENTS.md says how to run them and set up the hooks
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
  // lefthook's install sets up no hooks in CI unless LEFTHOOK is set
  execFileSync('bun', ['install'], {
    cwd: app,
    stdio: 'ignore',
    shell,
    env: { ...process.env, LEFTHOOK: '1' },
  })
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
    'checks: --yes makes a git repository, and the install sets up the hooks',
    ['pre-commit', 'commit-msg'].every((hook) => existsSync(join(app, '.git/hooks', hook))),
  )
  // a commit of files the linter ignores only (the generated types): nothing to lint, not a failure (#81)
  const types = join(app, 'app/fondu.gen.d.ts')
  writeFileSync(types, (existsSync(types) ? readFileSync(types, 'utf8') : '') + '// types\n')
  check(
    'checks: a commit of ignored files only passes the hooks',
    passes('git', 'add', 'app/fondu.gen.d.ts') &&
      passes(
        'git',
        '-c',
        'user.name=Fondu',
        '-c',
        'user.email=test@fondu.dev',
        'commit',
        '-m',
        'chore: types',
      ),
  )
  const agents = readFileSync(join(app, 'AGENTS.md'), 'utf8')
  check(
    'checks: AGENTS.md says how',
    agents.includes('Code checks') && agents.includes('lefthook install'),
  )
}
rmSync(work, { recursive: true, force: true })
process.exit(failed ? 1 : 0)

/** a document without its nonces: a static page gets the response's */
function unNonced(html) {
  return html.replace(/ nonce="[^"]*"/g, '')
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
