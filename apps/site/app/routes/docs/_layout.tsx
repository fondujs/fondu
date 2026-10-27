import { MDXProvider } from '@mdx-js/react'
import { usePage } from 'fondu/client'
import { ChevronDown, ChevronLeft, ChevronRight, Menu } from 'lucide-react'
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'

import { CodeTabs, Pre } from '#/components/code.tsx'
import { CopyPrompt } from '#/components/copy-prompt.tsx'
import { External } from '#/components/external.tsx'
import { MarkdownActions } from '#/components/markdown-actions.tsx'
import { Meta } from '#/components/meta.tsx'
import {
  Drawer,
  DrawerHeader,
  DrawerPanel,
  DrawerPopup,
  DrawerTitle,
} from '#/components/ui/drawer.tsx'
import { Menu as Dropdown, MenuItem, MenuPopup, MenuTrigger } from '#/components/ui/menu.tsx'
import { docOf, docs, docUrl, markdownUrl, sections, type Doc, type TocItem } from '#/docs.ts'

// What the Markdown becomes: links within the site are navigations, others open in a new tab; headings link to
// themselves; code blocks get a copy button, and <CodeTabs> groups them; <CopyPrompt> is the home page's button
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
    href.startsWith('/') ? (
      <a href={href}>{children}</a>
    ) : (
      <External href={href}>{children}</External>
    ),
  h2: heading('h2'),
  h3: heading('h3'),
  pre: Pre,
  CodeTabs,
  CopyPrompt,
}

// A page of the docs, inside the site's layout. Large screens: the sidebar, the page, its headings. Small ones: a bar
// that stays at the top, with the sidebar in a drawer and the headings in a menu.
export default function DocsLayout({ children }: { children: ReactNode }) {
  const { component, props } = usePage<{ toc: TocItem[] }>()
  const [open, setOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  // the bar is for small screens: grown past it (lg), its drawer and menu close with it
  useEffect(() => {
    const wide = matchMedia('(min-width: 64rem)')
    const close = () => {
      if (!wide.matches) return
      setOpen(false)
      setTocOpen(false)
    }
    wide.addEventListener('change', close)
    return () => wide.removeEventListener('change', close)
  }, [])
  const doc = docOf(component)!
  const i = docs.indexOf(doc)
  const [prev, next] = [docs[i - 1], docs[i + 1]]
  const current = useCurrentHeading(props.toc)
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
          <DrawerPopup showCloseButton className="w-72 max-w-[80%]">
            <DrawerHeader>
              <DrawerTitle>Docs</DrawerTitle>
            </DrawerHeader>
            <DrawerPanel>
              <Sidebar doc={doc} onPick={() => setOpen(false)} />
            </DrawerPanel>
          </DrawerPopup>
        </Drawer>
        {props.toc.length > 0 && (
          <Dropdown open={tocOpen} onOpenChange={setTocOpen}>
            <MenuTrigger className="flex shrink-0 items-center gap-1 text-muted-foreground">
              On this page <ChevronDown className="size-3.5" />
            </MenuTrigger>
            <MenuPopup align="end" className="max-h-[60vh] max-w-[min(18rem,calc(100vw-2rem))]">
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
          <Meta title={doc.slug ? doc.title : 'Docs'} description={doc.description} />
          <article className="prose">
            <h1>{doc.title}</h1>
            <MarkdownActions url={markdownUrl(doc)} />
            <MDXProvider components={components}>{children}</MDXProvider>
          </article>
          <nav
            aria-label="Previous and next"
            className="mt-14 grid gap-3 border-t pt-6 sm:grid-cols-2"
            data-pagefind-ignore
          >
            {prev && (
              <a
                href={docUrl(prev)}
                className="rounded-lg border px-4 py-3 transition-colors hover:bg-accent"
              >
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ChevronLeft className="size-3.5" /> Previous
                </span>
                <span className="font-medium">{prev.title}</span>
              </a>
            )}
            {next && (
              <a
                href={docUrl(next)}
                className="rounded-lg border px-4 py-3 text-right transition-colors hover:bg-accent sm:col-start-2"
              >
                <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                  Next <ChevronRight className="size-3.5" />
                </span>
                <span className="font-medium">{next.title}</span>
              </a>
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
                    <a
                      href={`#${item.id}`}
                      aria-current={item.id === current ? 'location' : undefined}
                      className="text-muted-foreground transition-colors hover:text-foreground aria-[current=location]:text-foreground"
                    >
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

/** the heading the reader is at: the last one above the top of the window (below the header) */
function useCurrentHeading(toc: TocItem[]) {
  const [current, setCurrent] = useState<string>()
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      // at the end of the page, the headings it cannot scroll to the top count as reached
      const end = innerHeight + scrollY >= document.documentElement.scrollHeight - 2
      const line = end ? innerHeight : 96
      const above = toc.filter(
        (item) => (document.getElementById(item.id)?.getBoundingClientRect().top ?? line) < line,
      )
      setCurrent(above.at(-1)?.id)
    }
    const onScroll = () => (frame ||= requestAnimationFrame(update))
    update()
    addEventListener('scroll', onScroll, { passive: true })
    return () => {
      removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [toc])
  return current
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
                <a
                  href={docUrl(d)}
                  onClick={onPick}
                  aria-current={d === doc ? 'page' : undefined}
                  className="-ml-px block border-l border-transparent py-1 pl-3 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground aria-[current=page]:border-brand aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                >
                  {d.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
