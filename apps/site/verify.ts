// What the site's build must have written (`bun run build` ends with it; `bun run verify` runs it again): the
// descriptions' length (app/docs.ts), and, in dist/client, what each page's head must have.
import { existsSync, readFileSync } from 'node:fs'

import { descriptionProblems, docs, docUrl, markdownUrl } from './app/docs.ts'

const problems: string[] = descriptionProblems()

const dist = new URL('./dist/client/', import.meta.url)
const read = (file: string) => readFileSync(new URL(file, dist), 'utf8')
const tag = (html: string, pattern: RegExp) => pattern.exec(html)?.[0]

if (existsSync(new URL('index.html', dist))) {
  const home = read('index.html')
  if (!tag(home, /<meta property="og:type" content="website"\/>/))
    problems.push('/: og:type is not website')
  if (tag(home, /<link rel="alternate" type="text\/markdown"/))
    problems.push('/: it has no Markdown copy to link')

  for (const doc of docs) {
    const page = docUrl(doc)
    const html = read(`${page === '/docs' ? 'docs' : page.slice(1)}.html`)
    if (!html.includes(`<link rel="alternate" type="text/markdown" href="${markdownUrl(doc)}"/>`))
      problems.push(`${page}: no alternate link to ${markdownUrl(doc)}`)
    if (!tag(html, /<meta property="og:type" content="article"\/>/))
      problems.push(`${page}: og:type is not article`)
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('site: ok')
