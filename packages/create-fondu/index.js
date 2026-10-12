#!/usr/bin/env node
// `bun create fondu [dir] [--target node|bun|cloudflare] [--no-install]` (or npm / pnpm / yarn create fondu)
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

import * as p from '@clack/prompts'

const TARGETS = {
  node: { label: 'Node', hint: '@hono/node-server' },
  bun: { label: 'Bun', hint: 'Bun.serve' },
  cloudflare: { label: 'Cloudflare Workers', hint: 'Vite + workerd, wrangler deploy' },
}
const SCRIPTS = {
  dev: 'the dev server (Vite), with server rendering',
  build: 'the production build',
  start: 'the production server (after build), on `PORT` (default 3000)',
  preview: 'the production build, run locally in workerd',
  deploy: 'build and deploy with wrangler',
  'cf-typegen': 'types for the bindings in wrangler.jsonc',
  typecheck: 'tsc',
}

const template = new URL('./template/', import.meta.url)
const own = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { target: { type: 'string' }, 'no-install': { type: 'boolean' } },
})
const done = (value) => {
  if (p.isCancel(value)) {
    p.cancel('Cancelled')
    process.exit(0)
  }
  return value
}

p.intro(`create-fondu ${own.version}`)

const dir = positionals[0] ?? done(await p.text({ message: 'Where?', placeholder: 'my-app', defaultValue: 'my-app' }))
const root = resolve(dir)
if (existsSync(root) && readdirSync(root).length > 0) {
  p.cancel(`${dir} is not empty`)
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

// the files: the base, then the target's (its package.json is merged into the base's)
const name =
  basename(root)
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[._-]+/, '') || 'fondu-app'
cpSync(new URL('base/', template), root, { recursive: true })
for (const file of readdirSync(new URL(`${target}/`, template))) {
  if (file !== 'package.json') cpSync(new URL(`${target}/${file}`, template), join(root, file))
}
renameSync(join(root, '_gitignore'), join(root, '.gitignore')) // npm leaves .gitignore out of packages

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const extra = JSON.parse(readFileSync(new URL(`${target}/package.json`, template), 'utf8'))
pkg.name = name
pkg.scripts = { ...extra.scripts, ...pkg.scripts }
for (const key of ['dependencies', 'devDependencies']) pkg[key] = sortKeys({ ...pkg[key], ...extra[key] })
pkg.dependencies.fondu = `^${own.version}`
writeFileSync(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')

const pm = (process.env.npm_config_user_agent ?? 'npm').split('/')[0]
const run = (script) => (pm === 'npm' ? `npm run ${script}` : `${pm} ${script}`)
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
if (target === 'cloudflare') {
  const wrangler = join(root, 'wrangler.jsonc')
  writeFileSync(wrangler, readFileSync(wrangler, 'utf8').replace('"name": "fondu-app"', `"name": "${name}"`))
}

const install = values['no-install']
  ? false
  : !process.stdin.isTTY || done(await p.confirm({ message: `Install the dependencies with ${pm}?` }))
if (install) {
  const result = spawnSync(pm, ['install'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.status !== 0) p.log.warn(`${pm} install failed: run it in ${dir}`)
}

const cd = relative(process.cwd(), root) || '.'
p.outro(
  ['Next:', cd === '.' ? null : `  cd ${cd}`, install ? null : `  ${pm} install`, `  ${run('dev')}`]
    .filter(Boolean)
    .join('\n'),
)

function sortKeys(object = {}) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)))
}
