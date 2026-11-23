// '' is /docs: routes/docs/index.mdx

export interface Doc {
  slug: string
  title: string
  description: string
}

export type TocItem = { id: string; title: string; depth: 2 | 3 }

export const sections: Array<{ title: string; docs: Doc[] }> = [
  {
    title: 'Getting started',
    docs: [
      {
        slug: '',
        title: 'Introduction',
        description:
          'Fondu is a small meta-framework for full-stack React apps, built on Hono and Vite: how its routes, pages and client fit together.',
      },
      {
        slug: 'quick-start',
        title: 'Quick start',
        description:
          'Create a Fondu app with create-fondu for Bun, Cloudflare Workers or Node, run it, add a page and build it for production.',
      },
      {
        slug: 'skills',
        title: 'Agent skills',
        description:
          "How to install Fondu's agent skill, use it in a task, keep app rules in AGENTS.md, and give agents the docs as Markdown.",
      },
      {
        slug: 'project-structure',
        title: 'Project structure',
        description:
          'The files of a Fondu app: vite.config.ts, app/server.ts, the routes directory, the generated types, and one way to organize the rest.',
      },
      {
        slug: 'demo',
        title: 'Demo application',
        description:
          'A tour of the Fondu demo app at demo.fondu.dev: one page per feature, each with the code that makes it work.',
      },
    ],
  },
  {
    title: 'Guides',
    docs: [
      {
        slug: 'routes',
        title: 'Routes',
        description:
          'How files in app/routes/ become URLs: params, optional segments, loaders, actions, middleware, HTTP routes and calling a route from the browser.',
      },
      {
        slug: 'pages',
        title: 'Pages and props',
        description:
          'How a page is a React component fed by its loader: props, title and meta tags, shared props and reading the page in a component.',
      },
      {
        slug: 'navigation',
        title: 'Navigation',
        description:
          'How links and forms change pages in place with no router: navigate(), shallow navigation, view transitions, pending state and full page loads.',
      },
      {
        slug: 'layouts',
        title: 'Layouts',
        description:
          'How a _layout.tsx wraps the pages below it and stays mounted: nesting, route groups, choosing the layouts of a page, code splitting and non-route files.',
      },
      {
        slug: 'forms',
        title: 'Forms and validation',
        description:
          'How a plain HTML form posts to an action: validation with one schema on the server and in the browser, errors, flash data, files and the body limit.',
      },
      {
        slug: 'errors',
        title: 'Errors',
        description:
          'How Fondu answers unknown URLs, wrong methods and thrown errors: the error page, plain text for API clients, development reports and your own handler.',
      },
      {
        slug: 'server-and-client',
        title: 'Server and client code',
        description:
          'Where each file of an app runs, on the server, in the browser or both, how server code is kept out of the bundle, and what stops the build.',
      },
      {
        slug: 'type-safety',
        title: 'Type safety',
        description:
          'How Fondu types page props, URLs, handler input and request() calls from your own files, so a renamed prop or a moved route fails at compile time.',
      },
    ],
  },
  {
    title: 'Rendering',
    docs: [
      {
        slug: 'ssr',
        title: 'Server-side rendering',
        description:
          'How pages are rendered on the server and hydrated in the browser, how the document streams with Suspense, and how to turn server rendering off.',
      },
      {
        slug: 'static-pages',
        title: 'Static pages',
        description:
          'How to write pages as static files at build time (SSG): choosing the pages, what a static page can be, and the headers it is served with.',
      },
      {
        slug: 'mdx',
        title: 'MDX pages',
        description:
          'How to write pages as MDX, Markdown with React components: the Vite setup, layouts, your own components and remark or rehype plugins.',
      },
      {
        slug: 'document',
        title: 'The document',
        description:
          'The HTML around every page: html attributes, head tags, icons, fonts, and inline scripts under the Content Security Policy.',
      },
    ],
  },
  {
    title: 'Going further',
    docs: [
      {
        slug: 'i18n',
        title: 'Internationalization',
        description:
          'How to serve pages in several languages with a URL each, using Paraglide or i18next: messages, links, switching language and search engines.',
      },
      {
        slug: 'deploying',
        title: 'Deploying',
        description:
          'How to run a Fondu app in production on Node, Bun or Cloudflare Workers: the build, the Content Security Policy, proxies, caching and new versions.',
      },
      {
        slug: 'api',
        title: 'API',
        description:
          'The reference for everything that fondu, fondu/client and fondu/vite export: functions, hooks, types, route exports and plugin options.',
      },
    ],
  },
]

export const docs: Doc[] = sections.flatMap((s) => s.docs)

// long enough to say what a page covers, short enough for a search result
export const DESCRIPTION = { min: 70, max: 160 }

export const descriptionProblems = () =>
  docs
    .filter((d) => d.description.length < DESCRIPTION.min || d.description.length > DESCRIPTION.max)
    .map(
      (d) =>
        `docs.ts: the description of "${d.title}" is ${d.description.length} characters, not ${DESCRIPTION.min}-${DESCRIPTION.max}: ${d.description}`,
    )

export const docUrl = (doc: Doc) => (doc.slug ? `/docs/${doc.slug}` : '/docs')

export const markdownUrl = (doc: Doc) => `${docUrl(doc)}.md`

export const docOf = (component: string) => {
  const slug = component.replace(/^docs\/?/, '').replace(/^index$/, '')
  return docs.find((d) => d.slug === slug)
}
