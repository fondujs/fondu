// The docs, in reading order: the sidebar, the previous / next links, the titles, llms.txt. A page here is
// app/routes/docs/<slug>.mdx at /docs/<slug> ('' is /docs: routes/docs/index.mdx).

export interface Doc {
  slug: string
  title: string
  description: string
}

/** a heading of a page, in its table of contents */
export type TocItem = { id: string; title: string; depth: 2 | 3 }

export const sections: Array<{ title: string; docs: Doc[] }> = [
  {
    title: 'Getting started',
    docs: [
      {
        slug: '',
        title: 'Introduction',
        description: 'What Fondu is, and what each part of it does.',
      },
      { slug: 'quick-start', title: 'Quick start', description: 'Create an app and run it.' },
      {
        slug: 'project-structure',
        title: 'Project structure',
        description: 'The files of an app, and what each is for.',
      },
      {
        slug: 'demo',
        title: 'Demo application',
        description: 'Every Fondu feature in an app, one page each.',
      },
    ],
  },
  {
    title: 'Guides',
    docs: [
      {
        slug: 'routes',
        title: 'Routes',
        description: 'Files in app/routes/: loaders, actions and middleware.',
      },
      {
        slug: 'pages',
        title: 'Pages and props',
        description: 'React pages, their props, title and meta tags.',
      },
      {
        slug: 'navigation',
        title: 'Navigation',
        description: 'Links, forms and Back in place; navigate() in code; scroll positions.',
      },
      {
        slug: 'layouts',
        title: 'Layouts',
        description: 'What stays around the pages, by directory.',
      },
      {
        slug: 'forms',
        title: 'Forms and validation',
        description: 'Plain forms, validated on the server.',
      },
      { slug: 'errors', title: 'Errors', description: 'Error pages, and what API clients get.' },
      {
        slug: 'server-and-client',
        title: 'Server and client code',
        description: 'Where each file runs, and what reaches the browser.',
      },
      {
        slug: 'type-safety',
        title: 'Type safety',
        description: 'Pages, props, URLs and input, checked from server to browser.',
      },
    ],
  },
  {
    title: 'Rendering',
    docs: [
      {
        slug: 'ssr',
        title: 'Server-side rendering',
        description: 'Pages rendered on the server, then hydrated.',
      },
      {
        slug: 'static-pages',
        title: 'Static pages',
        description: 'Pages written as files at build time (SSG).',
      },
      {
        slug: 'mdx',
        title: 'MDX pages',
        description: 'Pages written in Markdown, with React components.',
      },
      {
        slug: 'document',
        title: 'The document',
        description: 'The HTML around pages: attributes, icons, fonts.',
      },
    ],
  },
  {
    title: 'Going further',
    docs: [
      {
        slug: 'i18n',
        title: 'Internationalization',
        description: 'Pages in several languages, a URL each, with Paraglide or i18next.',
      },
      {
        slug: 'deploying',
        title: 'Deploying',
        description: 'Bun, Cloudflare Workers and Node in production.',
      },
      {
        slug: 'api',
        title: 'API',
        description: 'Everything fondu, fondu/client and fondu/vite export.',
      },
    ],
  },
]

export const docs: Doc[] = sections.flatMap((s) => s.docs)

export const docUrl = (doc: Doc) => (doc.slug ? `/docs/${doc.slug}` : '/docs')

/** the page as Markdown (vite: markdown.ts): /docs/routes.md, /docs.md */
export const markdownUrl = (doc: Doc) => `${docUrl(doc)}.md`

/** the doc of a page (its id: 'docs/routes', 'docs/index') */
export const docOf = (component: string) => {
  const slug = component.replace(/^docs\/?/, '').replace(/^index$/, '')
  return docs.find((d) => d.slug === slug)
}
