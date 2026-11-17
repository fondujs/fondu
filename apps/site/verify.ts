// What the site's build must have written (`bun run build` ends with it; `bun run verify` runs it again): the
// descriptions' length (app/docs.ts), and, in dist/client, what each page's head must have (the alternate link, the
// JSON-LD).
import { existsSync, readFileSync } from 'node:fs'

import { descriptionProblems, docs, docUrl, markdownUrl } from './app/docs.ts'
import { jsonLd as jsonLdText } from './app/structured-data.ts'

const problems: string[] = descriptionProblems()

if (jsonLdText({ x: '</script><!--' }).includes('<'))
  problems.push('jsonLd() leaves a "<" in its text')

const dist = new URL('./dist/client/', import.meta.url)
const read = (file: string) => readFileSync(new URL(file, dist), 'utf8')
const tag = (html: string, pattern: RegExp) => pattern.exec(html)?.[0]

/** the JSON-LD blocks of a page, parsed: a block is a script of `application/ld+json`, its text no raw `<` */
function jsonLd(page: string, html: string): Array<Record<string, unknown>> {
  const blocks = [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ]
  if (blocks.length !== 1) problems.push(`${page}: ${blocks.length} JSON-LD blocks, not 1`)
  return blocks.flatMap(([, text]) => {
    if (text!.includes('<')) problems.push(`${page}: its JSON-LD has a raw "<"`)
    try {
      const data = JSON.parse(text!)
      if (data['@context'] !== 'https://schema.org')
        problems.push(`${page}: JSON-LD @context is not schema.org`)
      return data['@graph'] as Array<Record<string, unknown>>
    } catch {
      problems.push(`${page}: its JSON-LD is not valid JSON`)
      return []
    }
  })
}

/** the types of a page's JSON-LD must each have the properties it is read for */
function checkTypes(
  page: string,
  graph: Array<Record<string, unknown>>,
  wanted: Record<string, string[]>,
) {
  for (const [type, keys] of Object.entries(wanted)) {
    const node = graph.filter((n) => n['@type'] === type)
    if (node.length !== 1) problems.push(`${page}: ${node.length} ${type} in its JSON-LD, not 1`)
    for (const key of keys) if (!node[0]?.[key]) problems.push(`${page}: its ${type} has no ${key}`)
  }
}

if (existsSync(new URL('index.html', dist))) {
  const home = read('index.html')
  if (!tag(home, /<meta property="og:type" content="website"\/>/))
    problems.push('/: og:type is not website')
  if (tag(home, /<link rel="alternate" type="text\/markdown"/))
    problems.push('/: it has no Markdown copy to link')
  checkTypes('/', jsonLd('/', home), {
    WebSite: ['name', 'description', 'url'],
    SoftwareSourceCode: [
      'name',
      'description',
      'url',
      'codeRepository',
      'license',
      'programmingLanguage',
    ],
  })

  for (const doc of docs) {
    const page = docUrl(doc)
    const html = read(`${page === '/docs' ? 'docs' : page.slice(1)}.html`)
    if (!html.includes(`<link rel="alternate" type="text/markdown" href="${markdownUrl(doc)}"/>`))
      problems.push(`${page}: no alternate link to ${markdownUrl(doc)}`)
    if (!tag(html, /<meta property="og:type" content="article"\/>/))
      problems.push(`${page}: og:type is not article`)
    const graph = jsonLd(page, html)
    checkTypes(page, graph, {
      TechArticle: ['headline', 'description', 'url'],
      BreadcrumbList: ['itemListElement'],
    })
    const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList')?.itemListElement as
      | Array<{ name: string }>
      | undefined
    if (crumbs?.length !== 3 || crumbs[0]!.name !== 'Docs' || crumbs[2]!.name !== doc.title)
      problems.push(`${page}: its breadcrumbs are not Docs > section > ${doc.title}`)
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('site: ok')
