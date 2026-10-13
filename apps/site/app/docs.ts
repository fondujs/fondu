// The docs, in reading order: the sidebar, the previous / next links, the titles, llms.txt. A page here is
// app/pages/docs/<slug>.mdx at /docs/<slug> ('' is /docs: pages/docs/index.mdx).

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
      { slug: '', title: 'Introduction', description: 'What Fondu is, and what each part of it does.' },
      { slug: 'quick-start', title: 'Quick start', description: 'Create an app and run it.' },
      {
        slug: 'project-structure',
        title: 'Project structure',
        description: 'The files of an app, and what each is for.',
      },
    ],
  },
  {
    title: 'Guides',
    docs: [
      { slug: 'routes', title: 'Routes', description: 'Files in app/routes/: loaders, actions and middleware.' },
      { slug: 'pages', title: 'Pages and props', description: 'React pages, and the kinds of props a route sends.' },
      { slug: 'forms', title: 'Forms and validation', description: 'One schema for the server and the browser.' },
      { slug: 'types', title: 'Types', description: 'Typed pages, props, shared data and URLs.' },
      { slug: 'ssr', title: 'Server-side rendering', description: 'Pages rendered on the server, then hydrated.' },
      {
        slug: 'static-pages',
        title: 'Static pages',
        description: 'Pages written as files at build time (Cloudflare).',
      },
      { slug: 'mdx', title: 'MDX pages', description: 'Pages written in Markdown, with React components.' },
      { slug: 'errors', title: 'Errors', description: 'Error pages, and what API clients get.' },
    ],
  },
  {
    title: 'Going further',
    docs: [
      { slug: 'deploying', title: 'Deploying', description: 'Node, Bun and Cloudflare Workers in production.' },
      { slug: 'api', title: 'API', description: 'Everything fondu, fondu/client and fondu/vite export.' },
    ],
  },
]

export const docs: Doc[] = sections.flatMap((s) => s.docs)

export const docUrl = (doc: Doc) => (doc.slug ? `/docs/${doc.slug}` : '/docs')

/** the doc of a page name ('docs/routes', 'docs/index') */
export const docOf = (component: string) => {
  const slug = component.replace(/^docs\/?/, '').replace(/^index$/, '')
  return docs.find((d) => d.slug === slug)
}
