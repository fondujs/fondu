import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createServer } from 'vite'
import { expect, test } from 'vitest'

import { productionAssets } from '../src/vite/assets.js'
import fondu from '../src/vite/index.js'
import { buildClient, tempApp } from './support/build.js'

const shell = (mark: string) =>
  `export default function Layout({children}) { return <section data-mark="${mark}">{children}</section> }`
const page = 'export default function Page() { return <p>page</p> }'

test.each(['/', '/demo/'])(
  'dev CSS at %s follows the imports of the layouts, including virtual themes, but not inline styles',
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
      expect(css).toContain('--shared-shell')
      expect(css).not.toContain('--shadow-only')
    } finally {
      await dev.close()
      app.remove()
    }
  },
)

test("a page's assets are those of the layouts of its directories, and of no other directory", async () => {
  const app = tempApp({
    'app/routes/_layout.tsx': `import './site.css'; ${shell('SITE_SHELL')}`,
    'app/routes/site.css': 'body {color: blue}',
    'app/routes/ordinary.tsx': page,
    'app/routes/blog/_layout.tsx': `import './blog.css'; ${shell('BLOG_SHELL')}`,
    'app/routes/blog/blog.css': 'aside {color: green}',
    'app/routes/blog/post.tsx': page,
  })
  try {
    await buildClient(app.root)
    const code = productionAssets({ root: app.root, base: '/', environments: {} } as never, {
      target: 'node',
    })
    const byPage = JSON.parse(/^const byPage = (.*)$/m.exec(code)![1]!) as Record<
      string,
      { css: string[]; js: string[] }
    >
    const read = (files: string[]) =>
      files.map((f) => readFileSync(join(app.root, 'dist/client', f), 'utf8')).join('')
    const { ordinary, 'blog/post': post } = byPage
    expect(read(ordinary!.js)).toContain('SITE_SHELL')
    expect(read(ordinary!.js)).not.toContain('BLOG_SHELL')
    expect(read(ordinary!.css)).not.toContain('green')
    expect(read(post!.js)).toContain('SITE_SHELL')
    expect(read(post!.js)).toContain('BLOG_SHELL')
    expect(read(post!.css)).toContain('green')
  } finally {
    app.remove()
  }
})

test("dev CSS: a page has the CSS of its own directories' layouts and its own, not of another section's", async () => {
  const app = tempApp({
    'app/routes/_layout.tsx': `import './root.css'; ${shell('ROOT')}`,
    'app/routes/root.css': ':root { --root: 1 }',
    'app/routes/a/_layout.tsx': `import './a.css'; ${shell('A')}`,
    'app/routes/a/a.css': ':root { --a-layout: 1 }',
    'app/routes/a/page.tsx': `import './page.css'; ${page}`,
    'app/routes/a/page.css': ':root { --a-page: 1 }',
    'app/routes/b/_layout.tsx': `import './b.css'; ${shell('B')}`,
    'app/routes/b/b.css': ':root { --b-layout: 1 }',
    'app/routes/b/page.tsx': page,
    'app/routes/index.tsx': page,
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
    const url = dev.resolvedUrls!.local[0]!
    const css = async (component: string) =>
      (await fetch(new URL(`@fondu/dev.css?page=${encodeURIComponent(component)}`, url))).text()
    const a = await css('a/page')
    for (const name of ['--root', '--a-layout', '--a-page']) expect(a).toContain(name)
    expect(a).not.toContain('--b-layout')
    const b = await css('b/page')
    expect(b).toContain('--root')
    expect(b).toContain('--b-layout')
    expect(b).not.toContain('--a-layout')
    expect(b).not.toContain('--a-page')
    const home = await css('index')
    expect(home).toContain('--root')
    expect(home).not.toMatch(/--(?:a|b)-/)
  } finally {
    await dev.close()
    app.remove()
  }
})
