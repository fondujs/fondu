import { spawnSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { createServer } from 'vite'
import { expect, test, vi } from 'vitest'

import fondu from '../src/vite/index.js'
import { layoutImports } from '../src/vite/layouts.js'
import { buildClient, tempApp } from './support/build.js'

const shell = (mark: string) =>
  `export default function Layout({children}) { return <section data-mark="${mark}">{children}</section> }`
const page = 'export default function Page() { return <p>page</p> }'

test.each([
  'export let layout = []',
  'export const layout = () => []',
  'export const layout = [42]',
  'export const layout = [Page]',
  'export const {layout} = {layout:[]}',
  'export {default as layout} from "./lib"',
  'export function layout(){}',
])('rejects %s at the declaring file', (declaration) => {
  expect(() => layoutImports(declaration, 'blog/post.tsx')).toThrow(
    'routes/blog/post.tsx: use export const layout',
  )
})

test('rejects a cycle between directory layout declarations before running their modules', async () => {
  const app = tempApp({
    'app/routes/index.tsx': page,
    'app/routes/_layout.tsx': `import Inner from './blog/_layout'; export const layout=[Inner]; ${shell('site')}`,
    'app/routes/blog/_layout.tsx': `import Outer from '../_layout'; export const layout=[Outer]; ${shell('blog')}`,
  })
  try {
    await expect(buildClient(app.root)).rejects.toThrow(
      /cyclic layout declaration: routes\/(?:blog\/)?_layout\.tsx → routes\/(?:blog\/)?_layout\.tsx/,
    )
  } finally {
    app.remove()
  }
})

test('the generated TS check rejects a layout requiring extra props under skipLibCheck', async () => {
  const app = tempApp({
    'app/routes/topic.tsx': `import Shell from '../shell'; export const layout=[Shell]; ${page}`,
    'app/shell.tsx':
      'export default function Shell(p:{children: import("react").ReactNode; name:string}) {return p.children}',
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        jsx: 'react-jsx',
        module: 'preserve',
        moduleResolution: 'bundler',
        skipLibCheck: true,
      },
      include: ['app'],
    }),
  })
  try {
    await buildClient(app.root)
    const tsc = join(
      createRequire(import.meta.url).resolve('typescript/package.json'),
      '../bin/tsc',
    )
    const check = () => spawnSync(process.execPath, [tsc, '-p', app.root], { encoding: 'utf8' })
    const bad = check()
    expect(bad.status, bad.stdout + bad.stderr).not.toBe(0)
    expect(bad.stdout).toContain('fondu.layouts.gen.ts')
    expect(bad.stdout).toContain("'name' is missing")
    writeFileSync(
      join(app.root, 'app/shell.tsx'),
      'export default function Shell(p:{children: import("react").ReactNode; name?:string}) {return p.children}',
    )
    const good = check()
    expect(good.status, good.stdout + good.stderr).toBe(0)
  } finally {
    app.remove()
  }
})

test('a running dev server tracks added, changed and deleted directory layouts in client and SSR', async () => {
  const app = tempApp({
    'app/routes/nested/post.tsx': page,
    'app/routes/_layout.tsx': shell('site'),
  })
  const dev = await createServer({
    root: app.root,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1' },
    plugins: [fondu({ target: 'node' })],
  })
  try {
    await dev.listen()
    const file = join(app.root, 'app/routes/nested/_layout.tsx')
    async function chain(root: boolean, inner: boolean) {
      for (const env of [dev.environments.client, dev.environments.ssr!]) {
        const code = (await env.transformRequest('/app/routes/nested/post.tsx?fondu-view'))!.code
        expect(code.includes('/app/routes/_layout.tsx')).toBe(root)
        expect(code.includes('/app/routes/nested/_layout.tsx')).toBe(inner)
      }
    }
    await chain(true, false)
    writeFileSync(file, shell('inner'))
    await vi.waitFor(() => chain(true, true), { timeout: 5000 })
    writeFileSync(file, 'export const layout = []; ' + shell('inner'))
    await vi.waitFor(() => chain(false, true), { timeout: 5000 })
    unlinkSync(file)
    await vi.waitFor(() => chain(true, false), { timeout: 5000 })
  } finally {
    await dev.close()
    app.remove()
  }
})

test('preloads follow the selected layout chain, including CSS, not just the directory', async () => {
  const app = tempApp({
    'app/routes/_layout.tsx': `import './site.css'; ${shell('SITE_SHELL')}`,
    'app/routes/site.css': 'body {color: blue}',
    'app/feature.tsx': `import './feature.css'; ${shell('FEATURE_SHELL')}`,
    'app/feature.css': 'article {color: green}',
    'app/routes/ordinary.tsx': page,
    'app/routes/blog/_layout.tsx': `import Feature from '../../feature'; export const layout = [Feature]; ${shell('BLOG_SHELL')}`,
    'app/routes/blog/post.tsx': page,
    'app/routes/bare.tsx': `import Blog from './blog/_layout'; export const layout = [Blog]; ${page}`,
    'app/routes/blog/print.tsx': `export const layout = []; ${page}`,
  })
  try {
    await buildClient(app.root)
    const dir = join(app.root, 'dist/client')
    const manifest = JSON.parse(readFileSync(join(dir, '.vite/manifest.json'), 'utf8')) as Record<
      string,
      { file: string; imports?: string[]; css?: string[] }
    >
    function assets(page: string) {
      const seen = new Set<string>(),
        css = new Set<string>()
      function visit(key: string) {
        if (seen.has(key)) return
        seen.add(key)
        const chunk = manifest[key]!
        chunk.css?.forEach((file) => css.add(file))
        chunk.imports?.forEach(visit)
      }
      visit(`app/routes/${page}.tsx?fondu-view`)
      return {
        js: [...seen].map((key) => readFileSync(join(dir, manifest[key]!.file), 'utf8')).join(''),
        css: [...css].map((file) => readFileSync(join(dir, file), 'utf8')).join(''),
      }
    }
    const ordinary = assets('ordinary'),
      post = assets('blog/post'),
      print = assets('blog/print')
    expect(ordinary.js).toContain('SITE_SHELL')
    expect(ordinary.js).not.toContain('FEATURE_SHELL')
    expect(ordinary.css).not.toContain('article')
    expect(post.js).toContain('FEATURE_SHELL')
    expect(post.js).toContain('BLOG_SHELL')
    expect(post.js).not.toContain('SITE_SHELL')
    expect(post.css).toContain('article')
    expect(print.js).not.toMatch(/SITE_SHELL|BLOG_SHELL|FEATURE_SHELL/)
    expect(print.css).toBe('')
    const bare = assets('bare') // importing Blog as a component does not import its own layout declaration
    expect(bare.js).toContain('BLOG_SHELL')
    expect(bare.js).not.toContain('FEATURE_SHELL')
    expect(bare.css).not.toContain('article')
  } finally {
    app.remove()
  }
})
