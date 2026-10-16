import { SearchIcon } from 'lucide-react'
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'

import { Button } from '#/components/ui/button.tsx'

// The dialog and its results are loaded when the search is first opened (or about to be), not with every page
const importDialog = () => import('#/components/search-dialog.tsx')
const SearchDialog = lazy(importDialog)

const noop = () => () => {}
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform)

/** The docs search: a field-like button (an icon on small screens), ⌘K / Ctrl K or / */
export function Search() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const mac = useSyncExternalStore(noop, isMac, () => true)
  const show = () => {
    setLoaded(true)
    setOpen(true)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable]')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        show()
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
  const prefetch = { onPointerEnter: () => void importDialog(), onFocus: () => void importDialog() }
  return (
    <>
      <Button
        variant="outline"
        className="w-52 text-muted-foreground max-sm:hidden"
        onClick={show}
        {...prefetch}
      >
        <SearchIcon />
        Search docs
        <kbd className="ml-auto font-sans text-xs">{mac ? '⌘K' : 'Ctrl K'}</kbd>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        aria-label="Search docs"
        onClick={show}
        {...prefetch}
      >
        <SearchIcon />
      </Button>
      {loaded && (
        <Suspense>
          <SearchDialog open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  )
}
