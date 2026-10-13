import { Head, Link, usePage } from '@inertiajs/react'
import { MDXProvider } from '@mdx-js/react'
import { ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode } from 'react'

import { docOf, docs, docUrl, sections, type TocItem } from '#/docs.ts'
import { cn } from '#/lib/utils.ts'

// What the Markdown becomes: links within the site are Inertia visits; headings link to themselves
const heading =
  (Tag: 'h2' | 'h3') =>
  ({ id, children }: ComponentProps<'h2'>) => (
    <Tag id={id}>
      <a href={`#${id}`} className="heading-anchor">
        {children}
      </a>
    </Tag>
  )
const components = {
  a: ({ href = '', children }: ComponentProps<'a'>) =>
    href.startsWith('/') && !href.includes('.') ? <Link href={href}>{children}</Link> : <a href={href}>{children}</a>,
  h2: heading('h2'),
  h3: heading('h3'),
}

// A page of the docs (inside the site's layout): the sidebar, the page with its title, the previous and next pages,
// and the headings of the page
export default function DocsLayout({ children }: { children: ReactNode }) {
  const { component, props } = usePage<{ toc: TocItem[] }>()
  const [open, setOpen] = useState(false)
  const doc = docOf(component)!
  const i = docs.indexOf(doc)
  const [prev, next] = [docs[i - 1], docs[i + 1]]
  return (
    <div className="mx-auto grid max-w-7xl px-4 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[13rem_minmax(0,1fr)_12rem]">
      <aside className="lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:py-8">
        <button
          type="button"
          className="-mx-4 flex w-[calc(100%+2rem)] items-center gap-2 border-b px-4 py-3 text-left text-muted-foreground sm:-mx-6 sm:w-[calc(100%+3rem)] sm:px-6 lg:hidden"
          aria-expanded={open}
          aria-controls="docs-nav"
          onClick={() => setOpen(!open)}
        >
          <Menu className="size-4" /> {doc.title}
        </button>
        <nav id="docs-nav" aria-label="Docs" className={cn('gap-6 py-4 lg:grid lg:py-0', open ? 'grid' : 'hidden')}>
          {sections.map((section) => (
            <div key={section.title}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{section.title}</p>
              <ul className="grid gap-px border-l">
                {section.docs.map((d) => (
                  <li key={d.slug}>
                    <Link
                      href={docUrl(d)}
                      prefetch
                      onClick={() => setOpen(false)}
                      aria-current={d === doc ? 'page' : undefined}
                      className="-ml-px block border-l border-transparent py-1 pl-3 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground aria-[current=page]:border-brand aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                    >
                      {d.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 py-8 lg:py-10" data-pagefind-body>
        <Head title={doc.slug ? doc.title : 'Docs'}>
          <meta name="description" content={doc.description} />
        </Head>
        <article className="prose">
          <h1>{doc.title}</h1>
          <p className="lede">{doc.description}</p>
          <MDXProvider components={components}>{children}</MDXProvider>
        </article>
        <nav
          aria-label="Previous and next"
          className="mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2"
          data-pagefind-ignore
        >
          {prev && (
            <Link href={docUrl(prev)} className="group rounded-lg border px-4 py-3 transition-colors hover:bg-accent">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ChevronLeft className="size-3.5" /> Previous
              </span>
              <span className="font-medium">{prev.title}</span>
            </Link>
          )}
          {next && (
            <Link
              href={docUrl(next)}
              className="group rounded-lg border px-4 py-3 text-right transition-colors hover:bg-accent sm:col-start-2"
            >
              <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                Next <ChevronRight className="size-3.5" />
              </span>
              <span className="font-medium">{next.title}</span>
            </Link>
          )}
        </nav>
      </main>

      {props.toc.length > 0 && (
        <aside className="hidden xl:block">
          <nav aria-label="On this page" className="sticky top-14 py-10">
            <p className="mb-2 text-xs font-medium text-muted-foreground">On this page</p>
            <ul className="grid gap-1.5">
              {props.toc.map((item) => (
                <li key={item.id} className={item.depth === 3 ? 'pl-3' : undefined}>
                  <a href={`#${item.id}`} className="text-muted-foreground transition-colors hover:text-foreground">
                    {item.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      )}
    </div>
  )
}
