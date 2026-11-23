import pkg from '../../../packages/fondu/package.json'
import { docs, docUrl } from './docs.ts'
import { SITE, SUMMARY } from './site.ts'

// Structured data (JSON-LD, schema.org) for the document's <head>: the home page describes the site and the code,
// a doc page its article and where it sits in the docs. Only what the repository says: its URL and license are
// packages/fondu/package.json's.
const repository = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '')

const context = 'https://schema.org'

const home = [
  { '@type': 'WebSite', name: 'Fondu', description: SUMMARY, url: SITE },
  {
    '@type': 'SoftwareSourceCode',
    name: 'Fondu',
    description: SUMMARY,
    url: SITE,
    codeRepository: repository,
    license: `https://spdx.org/licenses/${pkg.license}.html`,
    programmingLanguage: 'TypeScript',
  },
]

export type DocDates = Record<string, { modified?: string; published?: string }>

/** the structured data of the page at `path`, or none (the error page, a path that is no page) */
export function structuredData(path: string, dates: DocDates = {}): object | undefined {
  if (path === '/') return { '@context': context, '@graph': home }
  const doc = docs.find((d) => docUrl(d) === path)
  if (!doc) return
  const url = SITE + docUrl(doc)
  return {
    '@context': context,
    '@graph': [
      {
        '@type': 'TechArticle',
        headline: doc.title,
        description: doc.description,
        url,
        ...(dates[path]?.modified && { dateModified: dates[path].modified }),
        ...(dates[path]?.published && { datePublished: dates[path].published }),
      },
      {
        '@type': 'BreadcrumbList',
        // every crumb is a page (a section has none of its own); the docs' own page is the one crumb
        itemListElement: [
          { name: 'Docs', item: SITE + '/docs' },
          ...(doc.slug ? [{ name: doc.title, item: url }] : []),
        ].map((item, i) => ({ '@type': 'ListItem', position: i + 1, ...item })),
      },
    ],
  }
}

/**
 * The data as a script's text: `<` escaped, so nothing in it is `</script>` or `<!--`, as the document's page data
 * (fondu's server/document.ts). A data block (`application/ld+json`) is never run, so the CSP neither blocks nor
 * reports it.
 */
export const jsonLd = (data: object) => JSON.stringify(data).replace(/</g, '\\u003c')
