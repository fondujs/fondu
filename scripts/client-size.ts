// The size of fondu's browser code (what `fondu/client` gives an app's bundle), minified, from source.
//   bun scripts/client-size.ts [dir] [--json]     dir: a checkout (default: this one)
//   bun scripts/client-size.ts --summary head.json [base.json]     a Markdown table, for CI's job summary
// The app's virtual client entry (vite/index.ts) imports only `__entry` from `fondu/client`, so the bundle of
// `client.ts` is the one bundle. A report: it exits 0 unless the build itself fails.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'

type Size = { name: string; minified: number; gzip: number; brotli: number }

// vite is fondu's devDependency (installed under packages/fondu), so it is found from there
const here = join(import.meta.dirname, '..')
const { build } = (await import(
  pathToFileURL(createRequire(join(here, 'packages/fondu/package.json')).resolve('vite')).href
)) as typeof import('vite')

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const files = args.filter((a) => !a.startsWith('--'))

async function measure(dir: string): Promise<Size[]> {
  const pkg = resolve(dir, 'packages/fondu')
  const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))
  const external = [
    'react',
    'react-dom',
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]
  const out = mkdtempSync(join(tmpdir(), 'fondu-size-'))
  try {
    await build({
      root: pkg,
      configFile: false,
      logLevel: 'silent',
      build: {
        outDir: out,
        emptyOutDir: true,
        target: 'esnext',
        minify: true,
        copyPublicDir: false,
        lib: { entry: join(pkg, 'src/client.ts'), formats: ['es'], fileName: 'client' },
        rolldownOptions: {
          external: (id) => external.some((name) => id === name || id.startsWith(`${name}/`)),
        },
      },
    })
    return (
      readdirSync(out)
        .filter((f) => f.endsWith('.js'))
        // Rolldown leaves `//#region <path>` comments in: they depend on where the checkout is, not on its code
        .map((f) =>
          Buffer.from(readFileSync(join(out, f), 'utf8').replace(/^\/\/#(end)?region.*\n?/gm, '')),
        )
        .map((code) => ({
          name: 'fondu/client',
          minified: code.length,
          gzip: gzipSync(code, { level: 9 }).length,
          brotli: brotliCompressSync(code).length,
        }))
        .slice(0, 1)
    )
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

function summary(headFile: string, baseFile?: string): string {
  const read = (file?: string): Size[] | null => {
    try {
      return file ? JSON.parse(readFileSync(file, 'utf8')) : null
    } catch {
      return null
    }
  }
  const head = read(headFile) ?? []
  const base = read(baseFile)
  const pr = baseFile !== undefined
  const rows = head.map((h) => {
    const cells = [h.name, `${h.minified}`, `${h.gzip}`, `${h.brotli}`]
    if (pr) {
      const b = base?.find((s) => s.name === h.name)
      if (!b) cells.push('n/a', 'n/a')
      else {
        const diff = h.gzip - b.gzip
        const pct = b.gzip ? ((diff / b.gzip) * 100).toFixed(1) : '0.0'
        cells.push(`${b.gzip}`, `${diff > 0 ? '+' : ''}${diff} (${diff > 0 ? '+' : ''}${pct}%)`)
      }
    }
    return `| ${cells.join(' | ')} |`
  })
  const titles = [
    'Bundle',
    'Minified',
    'Gzip',
    'Brotli',
    ...(pr ? ['Base gzip', 'Change (gzip)'] : []),
  ]
  return [
    "### Size of fondu's browser code (bytes)",
    '',
    `| ${titles.join(' | ')} |`,
    `|${titles.map((_, i) => (i ? '---:' : '---')).join('|')}|`,
    ...rows,
    ...(pr && !base ? ['', 'base: n/a'] : []),
  ].join('\n')
}

if (flag('--summary')) {
  console.log(summary(files[0]!, files[1]))
} else {
  const sizes = await measure(resolve(files[0] ?? join(import.meta.dirname, '..')))
  if (flag('--json')) console.log(JSON.stringify(sizes, null, 2))
  else
    for (const s of sizes)
      console.log(`${s.name}  minified ${s.minified} B  gzip ${s.gzip} B  brotli ${s.brotli} B`)
}
