import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import type { Plugin } from 'vite'

import { descriptionProblems, docs, docUrl, markdownUrl, type Doc } from './app/docs.ts'
import { SITE, SUMMARY } from './app/site.ts'

/**
 * A page as Markdown: its title, its URL (a reader of the text alone can cite it) and description, then the MDX source less its import / export lines and its
 * components' tags (outside code blocks), links to the docs made absolute, to their Markdown
 */
function pageMarkdown(doc: Doc): string {
  let fenced = false
  const body = readFileSync(
    new URL(`./app/routes/docs/${doc.slug || 'index'}.mdx`, import.meta.url),
    'utf8',
  )
    .split('\n')
    .filter((line) => {
      if (/^(```|~~~)/.test(line)) fenced = !fenced
      return fenced || !/^(import |export |<\/?[A-Z]\w*.*>$)/.test(line)
    })
    .join('\n')
    .replace(
      /\]\((\/docs[^)#]*)(#[^)]*)?\)/g,
      (_, path: string, hash = '') => `](${SITE}${path}.md${hash})`,
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

const dates = new Map<string, string | undefined>()
/**
 * When a source file last changed: its last commit's date. None when it can't be known: no git, a file git doesn't
 * know, or a shallow clone (every file would get the date of its newest commit: wrong, rather than missing).
 */
function lastModified(file: string): string | undefined {
  if (!dates.has(file))
    dates.set(
      file,
      (() => {
        try {
          if (git('rev-parse', '--is-shallow-repository') !== 'false') return
          return git('log', '-1', '--format=%cI', '--', file) || undefined
        } catch {
          return
        }
      })(),
    )
  return dates.get(file)
}

/** the source of each page of the site: the home page, the docs (MDX) */
const sources: Array<[path: string, file: string]> = [
  ['/', 'app/routes/index.tsx'],
  ...docs.map((d): [string, string] => [docUrl(d), `app/routes/docs/${d.slug || 'index'}.mdx`]),
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
  // for search engines: every page, and where the list is
  'sitemap.xml': sitemap(),
  'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
})

/**
 * Every page of the docs as Markdown (/docs/routes.md), llms.txt (https://llmstxt.org) and llms-full.txt, every
 * page in one file; sitemap.xml and robots.txt: written with the client build, and served by the dev server
 */
export function markdown(): Plugin {
  return {
    name: 'site:markdown',
    buildStart() {
      const problems = descriptionProblems()
      if (problems.length) this.error(problems.join('\n'))
    },
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
