import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import type { Plugin } from 'vite'

import { descriptionProblems, docs, docUrl, markdownUrl, type Doc } from './app/docs.ts'
import { SITE, SUMMARY } from './app/site.ts'

function pageMarkdown(doc: Doc): string {
  let fenced = false
  const body = readFileSync(new URL(`./${docFile(doc)}`, import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => {
      if (/^(```|~~~)/.test(line)) fenced = !fenced
      return fenced || !/^(import |export |<\/?[A-Z]\w*.*>$)/.test(line)
    })
    .join('\n')
    .replace(
      /\]\((\/docs[^)#]*)(#[^)]*)?\)/g,
      (_, path: string, hash = '') =>
        `](${SITE}${path}${path.endsWith('.md') ? '' : '.md'}${hash})`,
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return `# ${doc.title}\n\n${SITE}${docUrl(doc)}\n\n> ${doc.description}\n\n${body}\n`
}

const here = new URL('.', import.meta.url)
const git = (...args: string[]) =>
  execFileSync('git', args, {
    cwd: here,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()

const shallow = () => {
  try {
    return git('rev-parse', '--is-shallow-repository') !== 'false'
  } catch {
    return false
  }
}

const dates = new Map<string, { modified?: string; published?: string }>()
// ISO dates of a file's last and first commit. None without git, for a file git doesn't know, or in a shallow
// clone, where every file would get its newest commit's date.
function history(file: string) {
  if (!dates.has(file))
    dates.set(
      file,
      (() => {
        try {
          if (shallow()) return {}
          const log = git('log', '--follow', '--format=%cI', '--', file).split('\n').filter(Boolean)
          const iso = (date?: string) => (date ? new Date(date).toISOString() : undefined)
          return { modified: iso(log[0]), published: iso(log.at(-1)) }
        } catch {
          return {}
        }
      })(),
    )
  return dates.get(file)!
}
export const lastModified = (file: string) => history(file).modified
export const firstCommit = (file: string) => history(file).published

export const docFile = (doc: Doc) => `app/routes/docs/${doc.slug || 'index'}.mdx`

const sources: Array<[path: string, file: string]> = [
  ['/', 'app/routes/index.tsx'],
  ...docs.map((d): [string, string] => [docUrl(d), docFile(d)]),
]

const sitemap = () =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sources
    .map(([path, file]) => {
      const date = lastModified(file)
      return `  <url><loc>${SITE}${path}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`
    })
    .join('\n')}\n</urlset>\n`

const files = (): Record<string, string> => ({
  'llms.txt':
    [
      '# Fondu',
      `> ${SUMMARY}`,
      '## Docs',
      docs.map((d) => `- [${d.title}](${SITE}${markdownUrl(d)}): ${d.description}`).join('\n'),
      '## Optional',
      `- [All the docs](${SITE}/llms-full.txt): every page above in one file`,
      '- [Demo](https://demo.fondu.dev): a Fondu app on Cloudflare Workers, one page per feature, each with its code; its source: https://github.com/fondujs/fondu/tree/main/apps/demo',
    ].join('\n\n') + '\n',
  'llms-full.txt': [`# Fondu\n\n> ${SUMMARY}\n`, ...docs.map(pageMarkdown)].join('\n'),
  ...Object.fromEntries(docs.map((d) => [markdownUrl(d).slice(1), pageMarkdown(d)])),
  'sitemap.xml': sitemap(),
  'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
})

const DATES = 'virtual:doc-dates'

export function markdown(): Plugin {
  return {
    name: 'site:markdown',
    buildStart() {
      const problems = descriptionProblems()
      if (problems.length) this.error(problems.join('\n'))
      if (this.environment.name === 'client' && shallow()) {
        this.warn(
          "site: a shallow git clone has no page dates: the sitemap's lastmod, the pages' Last updated and dateModified are left out (fetch the full history to have them)",
        )
      }
    },
    // the pages' dates, for the layout and the structured data: git is not there when a page is rendered (a Worker)
    resolveId: (id) => (id === DATES ? `\0${DATES}` : undefined),
    load: (id) =>
      id === `\0${DATES}`
        ? `export default ${JSON.stringify(
            Object.fromEntries(
              docs.map((d) => [
                docUrl(d),
                { modified: lastModified(docFile(d)), published: firstCommit(docFile(d)) },
              ]),
            ),
          )}`
        : undefined,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files()[(req.url ?? '').split('?')[0]!.slice(1)]
        if (file === undefined) return next()
        const type = req.url!.endsWith('.md')
          ? 'text/markdown'
          : req.url!.endsWith('.xml')
            ? 'application/xml'
            : 'text/plain'
        res.setHeader('Content-Type', `${type}; charset=utf-8`)
        res.end(file)
      })
    },
    generateBundle() {
      if (this.environment.name !== 'client') return
      for (const [fileName, source] of Object.entries(files()))
        this.emitFile({ type: 'asset', fileName, source })
    },
  }
}
