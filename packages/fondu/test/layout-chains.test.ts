import { spawnSync } from 'node:child_process'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join } from 'node:path'

import { createLogger, createServer, type Plugin, type ViteDevServer } from 'vite'
import { expect, test, vi } from 'vitest'

import fondu from '../src/vite/index.js'
import { layoutImports } from '../src/vite/layouts.js'
import { buildClient, tempApp } from './support/build.js'

const shell = (mark: string) =>
  `export default function Layout({children}) { return <section data-mark="${mark}">{children}</section> }`
const page = 'export default function Page() { return <p>page</p> }'

/** HTTP listening does not mean Vite has subscribed to changes under this directory yet. */
async function listenForEdits(dev: ViteDevServer, dir: string, ...files: string[]) {
  await dev.listen()
  await vi.waitFor(
    () => expect(dev.watcher.getWatched()[dir]).toEqual(expect.arrayContaining(files)),
    { timeout: 5000 },
  )
}

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

test('a wildcard exporting layout is diagnosed, not silently treated as inheritance', async () => {
  const app = tempApp({
    'app/routes/_layout.tsx': `export * from '../parents'; ${shell('site')}`,
    'app/parents.ts': 'export const layout = []',
    'app/other.ts': 'export default 1',
    'app/routes/ordinary/_layout.tsx': `export * from '../../other'; ${shell('ordinary')}`,
    'app/routes/index.tsx': page,
  })
  const dev = await createServer({
    root: app.root,
    configFile: false,
    logLevel: 'silent',
    server: { middlewareMode: true },
    plugins: [fondu({ target: 'node' })],
  })
  try {
    expect((await dev.ssrLoadModule('/app/routes/ordinary/_layout.tsx')).default).toBeTypeOf(
      'function',
    )
    await expect(dev.ssrLoadModule('/app/routes/_layout.tsx')).rejects.toThrow(
      /routes\/_layout.tsx.*layout/,
    )
  } finally {
    await dev.close()
    app.remove()
  }
})

test('the generated TS check includes a directory layout no page uses, in dev and production', async () => {
  const app = tempApp({
    'app/routes/reports/_layout.tsx': `import Shell from '../../shell'; export const layout=[Shell]; export default function Reports({children}: {children: import('react').ReactNode}) { return children }`,
    'app/routes/reports/print.tsx': `export const layout = []; ${page}`,
    'app/routes/topic.mdx': '# Use shell',
    'app/mdx-shell.tsx': `export default function MdxShell({children}: {children: import('react').ReactNode}) { return children }`,
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
  const mdx: Plugin = {
    name: 'test-mdx',
    enforce: 'pre',
    transform(code, id) {
      if (!id.split('?')[0]?.endsWith('.mdx')) return
      const view = `export default function Topic(){return 'Topic'}`
      return code.includes('Use shell')
        ? `import MdxShell from '../mdx-shell'; export const layout=[MdxShell]; ${view}`
        : view
    },
  }
  const plugins = () => [mdx, fondu({ target: 'node' })]
  const generated = join(app.root, 'app/fondu.layouts.gen.ts')
  const tsc = join(createRequire(import.meta.url).resolve('typescript/package.json'), '../bin/tsc')
  const check = () => spawnSync(process.execPath, [tsc, '-p', app.root], { encoding: 'utf8' })
  const invalid = () => {
    const result = check()
    expect(result.status, result.stdout + result.stderr).not.toBe(0)
    expect(result.stdout).toContain('fondu.layouts.gen.ts')
    expect(result.stdout).toContain("'name' is missing")
    return result.stdout
  }
  try {
    const dev = await createServer({
      root: app.root,
      configFile: false,
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1' },
      plugins: plugins(),
    })
    try {
      const routes = join(app.root, 'app/routes')
      await listenForEdits(dev, routes, 'topic.mdx')
      const topic = join(routes, 'topic.mdx')
      const containsTopic = (expected: boolean) =>
        vi.waitFor(
          () => expect(readFileSync(generated, 'utf8').includes('routes/topic.mdx')).toBe(expected),
          { timeout: 5000 },
        )
      await containsTopic(true)
      writeFileSync(topic, '# Plain topic')
      await containsTopic(false)
      writeFileSync(topic, '# Use shell')
      await containsTopic(true)
    } finally {
      await dev.close()
    }
    const contents = readFileSync(generated, 'utf8')
    expect(contents).toContain('routes/topic.mdx')
    const diagnostic = invalid()
    await buildClient(app.root, {}, { plugins: plugins() })
    expect(readFileSync(generated, 'utf8')).toBe(contents)
    expect(invalid()).toBe(diagnostic)
    writeFileSync(
      join(app.root, 'app/shell.tsx'),
      'export default function Shell(p:{children: import("react").ReactNode; name?:string}) {return p.children}',
    )
    const good = check()
    expect(good.status, good.stdout + good.stderr).toBe(0)
  } finally {
    app.remove()
  }
}, 30_000)

test('repairing a startup error publishes the complete inventory, including untouched routes', async () => {
  const selected = `import L from '../shell'; export const layout=[L]; ${page}`
  const app = tempApp({
    'app/routes/a.tsx': selected,
    'app/routes/b.tsx': page,
    'app/routes/z.tsx': selected,
    'app/shell.tsx': shell('site'),
  })
  const routes = join(app.root, 'app/routes')
  const generated = () => readFileSync(join(app.root, 'app/fondu.layouts.gen.ts'), 'utf8')
  const logger = createLogger('silent')
  const errors = vi.spyOn(logger, 'error')
  let editedB = false
  try {
    await buildClient(app.root)
    const committed = generated()
    writeFileSync(join(routes, 'a.tsx'), selected.replace('const layout', 'let layout'))
    const dev = await createServer({
      root: app.root,
      configFile: false,
      customLogger: logger,
      server: { port: 0, host: '127.0.0.1' },
      plugins: [
        fondu({ target: 'node' }),
        {
          name: 'observe-b',
          enforce: 'post',
          hotUpdate({ file }) {
            if (this.environment.name === 'client' && basename(file) === 'b.tsx') editedB = true
          },
        },
      ],
    })
    try {
      await listenForEdits(dev, routes, 'a.tsx', 'b.tsx')
      await vi.waitFor(() =>
        expect(errors).toHaveBeenCalledWith(
          expect.stringContaining('routes/a.tsx: use export const layout'),
        ),
      )
      writeFileSync(join(routes, 'b.tsx'), selected)
      await vi.waitFor(() => expect(editedB).toBe(true), { timeout: 5000 })
      expect(generated()).toBe(committed)
      // Returning to inheritance repairs the file without introducing a declaration of its own.
      writeFileSync(join(routes, 'a.tsx'), page)
      await vi.waitFor(() => expect(generated()).toContain('routes/b.tsx'), { timeout: 5000 })
      expect(generated()).not.toContain('routes/a.tsx')
      expect(generated()).toContain('routes/z.tsx')
    } finally {
      await dev.close()
    }
    const recovered = generated()
    await buildClient(app.root)
    expect(generated()).toBe(recovered)
  } finally {
    app.remove()
  }
}, 30_000)

test('edits received while the initial MDX scan is in flight survive the scan', async () => {
  const withLayout = (name: string) =>
    `import L from '../${name}'; export const layout=[L]; ${page}`
  const app = tempApp({
    'app/routes/a.tsx': withLayout('old'),
    'app/routes/b.tsx': withLayout('old'),
    'app/routes/z.mdx': '# Last page',
    'app/old.tsx': shell('old'),
    'app/new.tsx': shell('new'),
  })
  const routes = join(app.root, 'app/routes')
  const generated = () => readFileSync(join(app.root, 'app/fondu.layouts.gen.ts'), 'utf8')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let scanning = false
  const received = new Set<string>()
  const dev = await createServer({
    root: app.root,
    configFile: false,
    logLevel: 'silent',
    server: { port: 0, host: '127.0.0.1' },
    plugins: [
      {
        name: 'slow-mdx',
        enforce: 'pre',
        async transform(_code, id) {
          if (!id.split('?')[0]?.endsWith('/z.mdx')) return
          if (id.endsWith('?fondu-view')) {
            scanning = true
            await gate
          }
          return `import L from '../old'; export const layout=[L]; export default function Z(){return null}`
        },
      },
      fondu({ target: 'node' }),
      {
        name: 'observe-edits',
        enforce: 'post',
        hotUpdate({ file }) {
          if (this.environment.name === 'client') received.add(basename(file))
        },
      },
    ],
  })
  try {
    await listenForEdits(dev, routes, 'a.tsx', 'b.tsx')
    await vi.waitFor(() => expect(scanning).toBe(true))
    writeFileSync(join(routes, 'a.tsx'), withLayout('new'))
    unlinkSync(join(routes, 'b.tsx'))
    writeFileSync(join(routes, 'c.tsx'), withLayout('new'))
    await vi.waitFor(
      () => {
        for (const name of ['a.tsx', 'b.tsx', 'c.tsx']) expect(received.has(name)).toBe(true)
      },
      { timeout: 5000 },
    )
    release()
    await vi.waitFor(() => expect(generated()).toContain('routes/z.mdx'), { timeout: 5000 })
    const checks = generated()
    expect(checks).toMatch(/routes\/a\.tsx\s+Layout<typeof import\("\.\/new"\)/)
    expect(checks).not.toContain('routes/b.tsx')
    expect(checks).toContain('routes/c.tsx')
  } finally {
    release()
    await dev.close()
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
    const nested = join(app.root, 'app/routes/nested')
    await listenForEdits(dev, nested, 'post.tsx')
    const file = join(nested, '_layout.tsx')
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

test.each(['/', '/demo/'])(
  'dev CSS at %s follows static layout imports, including virtual themes, but not lazy or inline styles',
  async (base) => {
    const app = tempApp({
      'app/routes/index.tsx': page,
      'app/routes/_layout.tsx': `import Shared from '../../ui/shell'; import 'virtual:theme'; import './site.css'; export default function Layout({children}) { return <Shared>{children}<button onClick={() => import('../drawer')}>Open</button></Shared> }`,
      'app/routes/site.css': ':root { --site: 1 }',
      'app/theme.css': ':root { --theme: 1 }',
      'app/palette.css': ':root { --palette: 1 }',
      'ui/shell.tsx': `import './shell.css'; import text from './shadow.css?inline'; export default function Shared({children}) { return <div data-css={text}>{children}</div> }`,
      'ui/shell.css': ':root { --shared-shell: 1 }',
      'ui/shadow.css': ':root { --shadow-only: 1 }',
      'app/drawer.tsx': `import './drawer.css'; export default function Drawer(){return null}`,
      'app/drawer.css': ':root { --drawer-only: 1 }',
    })
    const dev = await createServer({
      root: app.root,
      base,
      configFile: false,
      logLevel: 'silent',
      server: { port: 0, host: '127.0.0.1' },
      plugins: [
        {
          name: 'theme',
          resolveId(id) {
            if (id === 'virtual:theme') return '\0virtual:theme'
            if (id === 'virtual:palette') return id
          },
          load(id) {
            if (id === '\0virtual:theme')
              return `import '/app/theme.css'; export * from 'virtual:palette'; import('/app/drawer')`
            if (id === 'virtual:palette')
              return `import '/app/palette.css'; export const palette = true`
          },
        },
        fondu({ target: 'node' }),
      ],
    })
    try {
      await dev.listen()
      const url = dev.resolvedUrls!.local[0]!
      const response = await fetch(new URL('@fondu/dev.css?page=index', url))
      expect(response.status).toBe(200)
      const css = await response.text()
      expect(css).toContain('--site')
      expect(css).toContain('--theme')
      expect(css).toContain('--palette')
      expect(css).not.toContain('--drawer-only')
      expect(css).toContain('--shared-shell')
      expect(css).not.toContain('--shadow-only')
    } finally {
      await dev.close()
      app.remove()
    }
  },
)

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
