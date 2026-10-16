#!/usr/bin/env node
// `bun create fondu [dir] [--target bun|cloudflare|node] [--checks] [--git] [--no-install]` (or npm / pnpm / yarn);
// `--no-checks`, `--no-git` answer no without asking
import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import * as p from '@clack/prompts'

const TARGETS = {
  bun: { label: 'Bun', hint: 'Bun.serve' },
  cloudflare: { label: 'Cloudflare Workers', hint: 'Vite + workerd, wrangler deploy' },
  node: { label: 'Node', hint: '@hono/node-server' },
}
const SCRIPTS = {
  dev: 'the dev server (Vite), with server rendering',
  build: 'the production build',
  start: 'the production server (after build), on `PORT` (default 3000)',
  preview: 'the production build, run locally in workerd',
  deploy: 'build and deploy with wrangler',
  'cf-typegen': 'types for the bindings in wrangler.jsonc',
  typecheck: 'tsc',
  fmt: 'format (oxfmt)',
  lint: 'lint (oxlint)',
}
const EXEC = { bun: 'bunx', pnpm: 'pnpm exec', yarn: 'yarn', npm: 'npx' }

const template = new URL('./template/', import.meta.url)
const own = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: 'string' },
    checks: { type: 'boolean' },
    'no-checks': { type: 'boolean' },
    git: { type: 'boolean' },
    'no-git': { type: 'boolean' },
    'no-install': { type: 'boolean' },
  },
})
const done = (value) => {
  if (p.isCancel(value)) {
    p.cancel('Cancelled')
    process.exit(0)
  }
  return value
}

p.intro(`create-fondu ${own.version}`)

const dir =
  positionals[0] ??
  done(await p.text({ message: 'Where?', placeholder: 'my-app', defaultValue: 'my-app' }))
const root = resolve(dir)
if (existsSync(root) && (!statSync(root).isDirectory() || readdirSync(root).length > 0)) {
  p.cancel(`${dir} is not an empty directory`)
  process.exit(1)
}

let target = values.target
if (target && !(target in TARGETS)) {
  p.cancel(`--target: ${Object.keys(TARGETS).join(', ')}`)
  process.exit(1)
}
target ??= done(
  await p.select({
    message: 'Runs on',
    options: Object.entries(TARGETS).map(([value, { label, hint }]) => ({ value, label, hint })),
  }),
)

const checks = values.checks
  ? true
  : values['no-checks'] || !process.stdin.isTTY
    ? false
    : done(
        await p.confirm({
          message: 'Add code checks? oxfmt and oxlint, and git hooks (lefthook, commitlint)',
          initialValue: false,
        }),
      )
const pm = (process.env.npm_config_user_agent ?? 'npm').split('/')[0]
// `bun build` is Bun's bundler, not the script
const run = (script) =>
  pm === 'npm' || (pm === 'bun' && script === 'build') ? `${pm} run ${script}` : `${pm} ${script}`

// the files: the base, then the target's, then the checks' (their package.json merged into the base's)
const name =
  basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[._-]+/, '') || 'fondu-app'
cpSync(new URL('base/', template), root, { recursive: true })
const layers = [target, ...(checks ? ['checks'] : [])]
for (const layer of layers)
  for (const file of readdirSync(new URL(`${layer}/`, template))) {
    if (file !== 'package.json')
      cpSync(new URL(`${layer}/${file}`, template), join(root, file), { recursive: true })
  }
renameSync(join(root, '_gitignore'), join(root, '.gitignore')) // npm leaves .gitignore out of packages

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
pkg.name = name
for (const layer of layers) {
  const extra = JSON.parse(readFileSync(new URL(`${layer}/package.json`, template), 'utf8'))
  pkg.scripts =
    layer === 'checks' ? { ...pkg.scripts, ...extra.scripts } : { ...extra.scripts, ...pkg.scripts }
  for (const key of ['dependencies', 'devDependencies'])
    pkg[key] = sortKeys({ ...pkg[key], ...extra[key] })
}
pkg.dependencies.fondu = `^${own.version}`
writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

const readme = readFileSync(join(root, 'README.md'), 'utf8')
  .replace('{{name}}', name)
  .replace('{{target}}', TARGETS[target].label)
  .replace(
    '{{scripts}}',
    Object.keys(pkg.scripts)
      .map((s) => `- \`${run(s)}\`: ${SCRIPTS[s] ?? s}`)
      .join('\n'),
  )
writeFileSync(join(root, 'README.md'), readme)
const hooks = `${EXEC[pm] ?? 'npx'} lefthook install` // in a git repository only
const agents = join(root, 'AGENTS.md')
writeFileSync(
  agents,
  readFileSync(agents, 'utf8').replace(
    '{{checks}}\n',
    checks
      ? `- Code checks: \`${run('fmt')}\` formats (oxfmt), \`${run('lint')}\` lints (oxlint); run both before finishing.
  Git hooks (lefthook, set up by the install in a git repository, or \`${hooks}\`) do it for each commit, and
  check its message: Conventional Commits (\`feat: …\`, \`fix: …\`).\n`
      : '',
  ),
)
if (checks) {
  const file = join(root, 'lefthook.yml')
  writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__EXEC__', EXEC[pm] ?? 'npx'))
}
if (target === 'cloudflare') {
  const wrangler = join(root, 'wrangler.jsonc')
  // a Worker's name: lowercase letters, digits and dashes (no dots or underscores, which a package name may have)
  const worker =
    name
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63)
      .replace(/-+$/, '') || 'fondu-app'
  writeFileSync(
    wrangler,
    readFileSync(wrangler, 'utf8').replace('"name": "fondu-app"', `"name": "${worker}"`),
  )
}

// a git repository: asked for unless the app is in one already (or git isn't there); made before the install, so
// lefthook's own install sets up the hooks
const git = (args) => spawnSync('git', args, { cwd: root, stdio: 'ignore' })
const inRepo = git(['rev-parse', '--is-inside-work-tree']).status === 0
const gitThere = inRepo || !git(['--version']).error
const initGit =
  !inRepo &&
  gitThere &&
  (values.git
    ? true
    : values['no-git'] || !process.stdin.isTTY
      ? false
      : done(await p.confirm({ message: 'Initialize a git repository?' })))
if (initGit && git(['init', '--quiet']).status !== 0) p.log.warn('git init failed')
const repo = inRepo || (initGit && git(['rev-parse', '--git-dir']).status === 0)

const install = values['no-install']
  ? false
  : !process.stdin.isTTY ||
    done(await p.confirm({ message: `Install the dependencies with ${pm}?` }))
if (install) {
  const result = spawnSync(pm, ['install'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) p.log.warn(`${pm} install failed: run it in ${dir}`)
}

const cd = relative(process.cwd(), root) || '.'
p.outro(
  [
    'Next:',
    cd === '.' ? null : `  cd ${cd}`,
    install ? null : `  ${pm} install`,
    checks && !repo ? `  git init && ${hooks}   # the git hooks` : null,
    `  ${run('dev')}`,
  ]
    .filter(Boolean)
    .join('\n'),
)

function sortKeys(object = {}) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)))
}
