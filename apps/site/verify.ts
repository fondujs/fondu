import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import { descriptionProblems, docs, docUrl, markdownUrl } from './app/docs.ts'
import { jsonLd as jsonLdText } from './app/structured-data.ts'
import { docFile, firstCommit, lastModified } from './markdown.ts'

const problems: string[] = descriptionProblems()

if (jsonLdText({ x: '</script><!--' }).includes('<'))
  problems.push('jsonLd() leaves a "<" in its text')

const dist = new URL('./dist/client/', import.meta.url)
const read = (file: string) => readFileSync(new URL(file, dist), 'utf8')
const tag = (html: string, pattern: RegExp) => pattern.exec(html)?.[0]

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
  const llmsLink =
    '<link rel="alternate" type="text/plain" title="LLM docs" href="https://fondu.dev/llms.txt"/>'
  if (!home.includes(llmsLink)) problems.push('/: no alternate link to llms.txt')
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
    if (
      !html.includes(
        `<link rel="alternate" type="text/markdown" title="Markdown source" href="${markdownUrl(doc)}"/>`,
      )
    )
      problems.push(`${page}: no alternate link to ${markdownUrl(doc)}`)
    if (!html.includes(llmsLink)) problems.push(`${page}: no alternate link to llms.txt`)
    if (!tag(html, /<meta property="og:type" content="article"\/>/))
      problems.push(`${page}: og:type is not article`)
    const graph = jsonLd(page, html)
    checkTypes(page, graph, {
      TechArticle: ['headline', 'description', 'url'],
      BreadcrumbList: ['itemListElement'],
    })
    // the dates are git's (none in a shallow clone, as in the sitemap): the visible one, and the structured data's
    const [modified, published] = [lastModified(docFile(doc)), firstCommit(docFile(doc))]
    const times = [...html.matchAll(/<time datetime="([^"]*)">([^<]*)<\/time>/gi)]
    const article = graph.find((n) => n['@type'] === 'TechArticle')
    if (modified) {
      const shown = new Date(modified).toLocaleDateString('en-US', {
        dateStyle: 'long',
        timeZone: 'UTC',
      })
      if (times.length !== 1 || times[0]![1] !== modified || times[0]![2] !== shown)
        problems.push(`${page}: its <time> is not ${modified} (${shown})`)
      if (article?.dateModified !== modified)
        problems.push(`${page}: its dateModified is not ${modified}`)
      if (article?.datePublished !== published)
        problems.push(`${page}: its datePublished is not ${published}`)
    } else if (times.length || article?.dateModified || article?.datePublished)
      problems.push(`${page}: it has a date, and git has none`)
    const crumbs = graph.find((n) => n['@type'] === 'BreadcrumbList')?.itemListElement as
      | Array<{ name: string; item?: string }>
      | undefined
    const names = doc.slug ? ['Docs', doc.title] : ['Docs']
    if (crumbs?.map((c) => c.name).join(' > ') !== names.join(' > ') || crumbs.some((c) => !c.item))
      problems.push(`${page}: its breadcrumbs are not ${names.join(' > ')}, each a page`)

    const copy = read(markdownUrl(doc).slice(1))
    if (!copy.startsWith(`# ${doc.title}\n\nhttps://fondu.dev${page}\n\n`))
      problems.push(`${markdownUrl(doc)}: its URL is not under its title`)
    for (const [, path] of copy.matchAll(/\]\(https:\/\/fondu\.dev(\/docs[^)#]*)(?:#[^)]*)?\)/g))
      if (!existsSync(new URL(path!.slice(1), dist)))
        problems.push(`${markdownUrl(doc)}: broken documentation link ${path}`)
  }
  const full = read('llms-full.txt')
  for (const doc of docs)
    if (!full.includes(`# ${doc.title}\n\nhttps://fondu.dev${docUrl(doc)}\n\n`))
      problems.push(`llms-full.txt: the section of ${docUrl(doc)} has no URL under its title`)

  // sitemap.xml: a page's <lastmod> is a date, and with the history there (not a shallow clone) every page has one
  const shallow = (() => {
    try {
      return (
        execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
          encoding: 'utf8',
        }).trim() !== 'false'
      )
    } catch {
      return true
    }
  })()
  const entries = [
    ...read('sitemap.xml').matchAll(
      /<url><loc>([^<]*)<\/loc>(<lastmod>([^<]*)<\/lastmod>)?<\/url>/g,
    ),
  ]
  if (entries.length !== docs.length + 1)
    problems.push(`sitemap.xml: ${entries.length} pages, not ${docs.length + 1}`)
  for (const [, loc, , lastmod] of entries) {
    if (
      lastmod !== undefined &&
      !(/^\d{4}-\d\d-\d\dT[\d:.]+(Z|[+-]\d\d:\d\d)$/.test(lastmod) && !isNaN(Date.parse(lastmod)))
    )
      problems.push(`sitemap.xml: ${loc} has lastmod "${lastmod}", not a date`)
    if (lastmod === undefined && !shallow)
      problems.push(`sitemap.xml: ${loc} has no lastmod, and git has its history`)
  }
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('site: ok')
