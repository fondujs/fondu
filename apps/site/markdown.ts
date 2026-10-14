import { readFileSync } from 'node:fs'

import type { Plugin } from 'vite'

import { docs, docUrl, markdownUrl, type Doc } from './app/docs.ts'

const SITE = 'https://fondu.dev'
const SUMMARY =
  'A small meta-framework for full-stack React apps, built on Hono, Vite and Inertia. It runs on Node, Bun and Cloudflare Workers.'

/**
 * A page as Markdown: its title and description, then the MDX source less its import / export lines and its
 * components' tags (outside code blocks), links to the docs made absolute, to their Markdown
 */
function pageMarkdown(doc: Doc): string {
  let fenced = false
  const body = readFileSync(new URL(`./app/pages/docs/${doc.slug || 'index'}.mdx`, import.meta.url), 'utf8')
    .split('\n')
    .filter((line) => {
      if (/^(```|~~~)/.test(line)) fenced = !fenced
      return fenced || !/^(import |export |<\/?[A-Z]\w*.*>$)/.test(line)
    })
    .join('\n')
    .replace(/\]\((\/docs[^)#]*)(#[^)]*)?\)/g, (_, path: string, hash = '') => `](${SITE}${path}.md${hash})`)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return `# ${doc.title}\n\n> ${doc.description}\n\n${body}\n`
}

const files = (): Record<string, string> => ({
  'llms.txt':
    [
      '# Fondu',
      `> ${SUMMARY}`,
      '## Docs',
      docs.map((d) => `- [${d.title}](${SITE}${markdownUrl(d)}): ${d.description}`).join('\n'),
      '## Optional',
      `- [All the docs](${SITE}/llms-full.txt): every page above in one file`,
    ].join('\n\n') + '\n',
  'llms-full.txt': [`# Fondu\n\n> ${SUMMARY}\n`, ...docs.map(pageMarkdown)].join('\n'),
  ...Object.fromEntries(docs.map((d) => [markdownUrl(d).slice(1), pageMarkdown(d)])),
  // for search engines: every page, and where the list is
  'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[
    '/',
    ...docs.map(docUrl),
  ]
    .map((path) => `  <url><loc>${SITE}${path}</loc></url>`)
    .join('\n')}\n</urlset>\n`,
  'robots.txt': `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`,
})

/**
 * Every page of the docs as Markdown (/docs/routes.md), llms.txt (https://llmstxt.org) and llms-full.txt, every
 * page in one file; sitemap.xml and robots.txt: written with the client build, and served by the dev server
 */
export function markdown(): Plugin {
  return {
    name: 'site:markdown',
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
      for (const [fileName, source] of Object.entries(files())) this.emitFile({ type: 'asset', fileName, source })
    },
  }
}
