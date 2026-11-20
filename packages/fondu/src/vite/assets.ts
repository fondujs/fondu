import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ResolvedConfig } from 'vite'

import { isPageFile, pageId } from '../paths.js'
import type { FonduOptions } from './index.js'
import { VIEW_QUERY } from './layouts.js'

/** the nonce of a tag in the generated `assetTags()` */
export const nonceAttr = `\${nonce ? \` nonce="\${nonce}"\` : ''}`

interface ManifestChunk {
  file: string
  isEntry?: boolean
  css?: string[]
  imports?: string[]
}

export function productionAssets(config: ResolvedConfig, options: FonduOptions): string {
  const outDir =
    options.target === 'cloudflare'
      ? resolve(config.root, config.environments.client?.build.outDir ?? 'dist/client')
      : resolve(config.root, 'dist/client')
  const file = resolve(outDir, '.vite/manifest.json')
  if (!existsSync(file))
    throw new Error(
      `fondu: the client manifest (${file}) is missing: the client is built first (\`vite build\`)`,
    )
  const text = readFileSync(file, 'utf8')
  const manifest = JSON.parse(text) as Record<string, ManifestChunk>
  const collect = (key: string, css: Set<string>, js: Set<string>, seen = new Set<string>()) => {
    const chunk = manifest[key]
    if (!chunk || seen.has(key)) return
    seen.add(key)
    js.add(chunk.file)
    for (const c of chunk.css ?? []) css.add(c)
    for (const i of chunk.imports ?? []) collect(i, css, js, seen)
  }
  const tags = (key: string) => {
    const css = new Set<string>(),
      js = new Set<string>()
    collect(key, css, js)
    return { css: [...css], js: [...js] }
  }
  // the app's entry: the client build's only one
  const entry = tags(Object.keys(manifest).find((k) => manifest[k]!.isEntry)!)
  const pages: Record<string, { css: string[]; js: string[] }> = {}
  for (const key of Object.keys(manifest)) {
    if (!key.endsWith(VIEW_QUERY)) continue
    const file = key.startsWith('app/routes/')
      ? key.slice('app/routes/'.length, -VIEW_QUERY.length)
      : undefined
    if (!file || !(isPageFile(file) || /^_error\.tsx$/.test(file))) continue
    // Layouts are static imports of the page, including its inherited chain.
    const page = tags(key)
    // each file once, and not the entry's: assetTags() adds those to every page (the entry's first)
    const own = (files: string[], entryFiles: string[]) => [
      ...new Set(files.filter((f) => !entryFiles.includes(f))),
    ]
    pages[pageId(file)] = {
      css: own(page.css, entry.css),
      js: own(page.js, entry.js),
    }
  }
  const version = createHash('sha256').update(text).digest('hex').slice(0, 16)
  return `const base = ${JSON.stringify(config.base)}
const entry = ${JSON.stringify(entry)}
const byPage = ${JSON.stringify(pages)}
export const version = ${JSON.stringify(version)}
export function assetTags(component, nonce) {
  const page = byPage[component] ?? { css: [], js: [] }
  const css = [...new Set([...entry.css, ...page.css])]
  const [main, ...preload] = new Set([...entry.js, ...page.js])
  return css.map((f) => \`<link rel="stylesheet" href="\${base}\${f}">\`).join('')
    + preload.map((f) => \`<link rel="modulepreload" href="\${base}\${f}"${nonceAttr}>\`).join('')
    + \`<script type="module" src="\${base}\${main}"${nonceAttr}></script>\`
}`
}
