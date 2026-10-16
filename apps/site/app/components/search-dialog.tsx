import { router } from '@inertiajs/react'
import { SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Dialog, DialogPopup, DialogTitle } from '#/components/ui/dialog.tsx'
import { Spinner } from '#/components/ui/spinner.tsx'

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

/** The search dialog (components/search.tsx loads it when it is first opened) */
export default function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup showCloseButton={false} className="max-w-xl" bottomStickOnMobile={false}>
        <Results onPick={() => onOpenChange(false)} />
      </DialogPopup>
    </Dialog>
  )
}

// a page found: its best part when that is a heading's section (Pagefind's sub-results), the page otherwise
function result(page: Page): Result {
  const title = page.meta.title ?? page.url
  const part = page.sub_results.find((s) => s.url.includes('#'))
  const { url, excerpt } = part ?? page
  return {
    url: url.replace(/\.html(?=#|$)/, ''),
    title: part ? `${title} › ${part.title}` : title,
    excerpt,
  }
}

function Results({ onPick }: { onPick: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [searched, setSearched] = useState('') // the query the results are for: none found means it was searched
  const [state, setState] = useState<'ready' | 'unavailable'>('ready')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLUListElement>(null)
  // a query typed, its results not in yet (the index loads with the first one)
  const searching = state === 'ready' && query !== '' && query !== searched
  useEffect(() => {
    let current = true
    void load().then(async (pf) => {
      if (!pf) return current && setState('unavailable')
      const search = await pf.debouncedSearch(query)
      if (!search || !current) return // superseded by a newer query
      const data = await Promise.all(search.results.slice(0, 8).map((r) => r.data()))
      if (!current) return
      setResults(data.map(result))
      setSearched(query)
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
      const next =
        (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1)
      setActive(next)
      list.current?.children[next]?.scrollIntoView({ block: 'nearest' })
    } else if (e.key === 'Enter' && results[active]) go(results[active].url)
  }
  return (
    <>
      <DialogTitle className="sr-only">Search the docs</DialogTitle>
      <div className="flex items-center gap-2 px-4">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          id="search"
          name="q"
          type="search"
          autoComplete="off"
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
          aria-busy={searching}
        />
        {searching && <Spinner className="size-4 shrink-0 text-muted-foreground" />}
      </div>
      {state === 'unavailable' ? (
        <p className="border-t p-6 text-center text-muted-foreground">
          The search index is written by the build.
        </p>
      ) : query && query === searched && !results.length ? (
        <p className="border-t p-6 text-center text-muted-foreground">
          Nothing found for “{query}”.
        </p>
      ) : results.length ? (
        <ul
          ref={list}
          id="search-results"
          role="listbox"
          className="max-h-[60vh] overflow-y-auto border-t p-2"
        >
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
