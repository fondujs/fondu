import { router } from '@inertiajs/react'
import { SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '#/components/ui/button.tsx'
import { Dialog, DialogPopup, DialogTitle, DialogTrigger } from '#/components/ui/dialog.tsx'

type Result = { url: string; title: string; excerpt: string }
type Page = Result & { meta: { title?: string }; sub_results: Result[] }
type Pagefind = {
  debouncedSearch: (query: string) => Promise<{
    results: Array<{ data: () => Promise<Page> }>
  } | null>
}

// Pagefind's index of the docs, written by `bun run build` (package.json) next to the static pages
const PAGEFIND = '/pagefind/pagefind.js'
let pagefind: Promise<Pagefind | null> | undefined
const load = () =>
  (pagefind ??= import(/* @vite-ignore */ PAGEFIND).then(
    (m: Pagefind) => m,
    () => null,
  ))

/** The docs search: ⌘K or /, Pagefind's index (none in development: build first) */
export function Search() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" className="w-9 justify-start text-muted-foreground sm:w-52" aria-label="Search" />
        }
      >
        <SearchIcon />
        <span className="max-sm:hidden">Search docs</span>
        <kbd className="ml-auto font-sans text-xs max-sm:hidden">⌘K</kbd>
      </DialogTrigger>
      <DialogPopup showCloseButton={false} className="max-w-xl" bottomStickOnMobile={false}>
        <Results onPick={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  )
}

// a page found: its best part when that is a heading's section (Pagefind's sub-results), the page otherwise
function result(page: Page): Result {
  const title = page.meta.title ?? page.url
  const part = page.sub_results.find((s) => s.url.includes('#'))
  const { url, excerpt } = part ?? page
  return { url: url.replace(/\.html(?=#|$)/, ''), title: part ? `${title} › ${part.title}` : title, excerpt }
}

function Results({ onPick }: { onPick: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [state, setState] = useState<'ready' | 'unavailable'>('ready')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  useEffect(() => {
    let current = true
    void load().then(async (pf) => {
      if (!pf) return current && setState('unavailable')
      const search = await pf.debouncedSearch(query)
      if (!search || !current) return // superseded by a newer query
      const data = await Promise.all(search.results.slice(0, 8).map((r) => r.data()))
      if (!current) return
      setResults(data.map(result))
      setActive(0)
    })
    return () => {
      current = false
    }
  }, [query])
  const go = (url: string) => {
    onPick()
    router.visit(url)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const next = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1)
      setActive(next)
      list.current?.children[next]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && results[active]) go(results[active].url)
  }
  return (
    <>
      <DialogTitle className="sr-only">Search the docs</DialogTitle>
      <div className="flex items-center gap-2 border-b px-4">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          placeholder="Search the docs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls="search-results"
          aria-activedescendant={results.length ? `search-result-${active}` : undefined}
        />
      </div>
      {state === 'unavailable' ? (
        <p className="p-6 text-center text-muted-foreground">The search index is written by the build.</p>
      ) : query && !results.length ? (
        <p className="p-6 text-center text-muted-foreground">Nothing found for “{query}”.</p>
      ) : results.length ? (
        <ul ref={list} id="search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {results.map((r, i) => (
            <li
              key={r.url}
              id={`search-result-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseMove={() => setActive(i)}
              onClick={() => go(r.url)}
              className="cursor-pointer rounded-lg px-3 py-2 aria-selected:bg-accent"
            >
              <p className="font-medium">{r.title}</p>
              {/* Pagefind's excerpt: the page's text, escaped, the matches in <mark> */}
              <p
                className="line-clamp-2 text-muted-foreground [&_mark]:bg-transparent [&_mark]:font-medium [&_mark]:text-foreground"
                dangerouslySetInnerHTML={{ __html: r.excerpt }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
