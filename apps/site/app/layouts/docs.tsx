import { Head, Link, usePage } from '@inertiajs/react'
import { MDXProvider } from '@mdx-js/react'
import { ChevronDown, ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import { useState, type ComponentProps, type ReactNode } from 'react'

import { CodeTabs, Pre } from '#/components/code.tsx'
import { External } from '#/components/external.tsx'
import { MarkdownActions } from '#/components/markdown-actions.tsx'
import { Drawer, DrawerHeader, DrawerPanel, DrawerPopup, DrawerTitle } from '#/components/ui/drawer.tsx'
import { Menu as Dropdown, MenuItem, MenuPopup, MenuTrigger } from '#/components/ui/menu.tsx'
import { docOf, docs, docUrl, markdownUrl, sections, type Doc, type TocItem } from '#/docs.ts'

// What the Markdown becomes: links within the site are Inertia visits, others open in a new tab; headings link to
// themselves; code blocks get a copy button, and <CodeTabs> groups them
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
    !href.startsWith('/') ? (
      <External href={href}>{children}</External>
    ) : href.includes('.') ? (
      <a href={href}>{children}</a>
    ) : (
      <Link href={href}>{children}</Link>
    ),
  h2: heading('h2'),
  h3: heading('h3'),
  pre: Pre,
  CodeTabs,
}

// A page of the docs, inside the site's layout. Large screens: the sidebar, the page, its headings. Small ones: a bar
// that stays at the top, with the sidebar in a drawer and the headings in a menu.
export default function DocsLayout({ children }: { children: ReactNode }) {
  const { component, props } = usePage<{ toc: TocItem[] }>()
  const [open, setOpen] = useState(false)
  const doc = docOf(component)!
  const i = docs.indexOf(doc)
  const [prev, next] = [docs[i - 1], docs[i + 1]]
  return (
    <>
      <div className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b bg-background/88 px-4 backdrop-blur-md sm:px-6 lg:hidden">
        <Drawer position="left" open={open} onOpenChange={setOpen}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-w-0 items-center gap-2 text-muted-foreground"
          >
            <Menu className="size-4 shrink-0" /> <span className="truncate">{doc.title}</span>
          </button>
          <DrawerPopup showCloseButton>
            <DrawerHeader>
              <DrawerTitle>Docs</DrawerTitle>
            </DrawerHeader>
            <DrawerPanel>
              <Sidebar doc={doc} onPick={() => setOpen(false)} />
            </DrawerPanel>
          </DrawerPopup>
        </Drawer>
        {props.toc.length > 0 && (
          <Dropdown>
            <MenuTrigger className="flex shrink-0 items-center gap-1 text-muted-foreground">
              On this page <ChevronDown className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" className="max-h-[60vh]">
              {props.toc.map((item) => (
                <MenuItem
                  key={item.id}
                  render={<a href={`#${item.id}`} />}
                  className={item.depth === 3 ? 'pl-5' : undefined}
                >
                  {item.title}
                </MenuItem>
              ))}
            </MenuPopup>
          </Dropdown>
        )}
      </div>

      <div className="mx-auto grid max-w-7xl px-4 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[13rem_minmax(0,1fr)_12rem]">
        <aside className="hidden lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:overflow-y-auto lg:py-8">
          <Sidebar doc={doc} />
        </aside>

        <div className="min-w-0 py-8" data-pagefind-body>
          <Head title={doc.slug ? doc.title : 'Docs'}>
            <meta name="description" content={doc.description} />
          </Head>
          <article className="prose">
            <h1>{doc.title}</h1>
            <p className="lede mb-5!">{doc.description}</p>
            <MarkdownActions url={markdownUrl(doc)} />
            <MDXProvider components={components}>{children}</MDXProvider>
          </article>
          <nav
            aria-label="Previous and next"
            className="mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2"
            data-pagefind-ignore
          >
            {prev && (
              <Link href={docUrl(prev)} className="rounded-lg border px-4 py-3 transition-colors hover:bg-accent">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronLeft className="size-3.5" /> Previous
                </span>
                <span className="font-medium">{prev.title}</span>
              </Link>
            )}
            {next && (
              <Link
                href={docUrl(next)}
                className="rounded-lg border px-4 py-3 text-right transition-colors hover:bg-accent sm:col-start-2"
              >
                <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                  Next <ChevronRight className="size-3.5" />
                </span>
                <span className="font-medium">{next.title}</span>
              </Link>
            )}
          </nav>
        </div>

        {props.toc.length > 0 && (
          <aside className="hidden xl:block">
            <nav aria-label="On this page" className="sticky top-14 py-8">
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
    </>
  )
}

function Sidebar({ doc, onPick }: { doc: Doc; onPick?: () => void }) {
  return (
    <nav aria-label="Docs" className="grid gap-6">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{section.title}</p>
          <ul className="grid gap-px border-l">
            {section.docs.map((d) => (
              <li key={d.slug}>
                <Link
                  href={docUrl(d)}
                  prefetch
                  onClick={onPick}
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
  )
}
