import { Check, Copy, FileText, LoaderCircle, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

// A page's Markdown, fetched once (on hover, so a click finds it ready)
const fetched = new Map<string, Promise<string>>()
const load = (url: string) => {
  if (!fetched.has(url))
    fetched.set(
      url,
      fetch(url).then((res) =>
        res.ok ? res.text() : Promise.reject(new Error(String(res.status))),
      ),
    )
  return fetched.get(url)!
}

/**
 * Copy as Markdown | View as Markdown: the page as /docs/<slug>.md (markdown.ts), for a coding agent or a chat. The
 * copy waits for the fetch: ClipboardItem takes the promise, so Safari keeps the click's permission.
 */
export function MarkdownActions({ url }: { url: string }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const copy = async () => {
    setState('copying')
    try {
      const text = load(url)
      if (typeof ClipboardItem === 'function')
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })),
          }),
        ])
      else await navigator.clipboard.writeText(await text)
      setState('copied')
    } catch {
      fetched.delete(url)
      setState('failed')
    }
    setTimeout(() => setState('idle'), 2000)
  }
  const states: Record<typeof state, [LucideIcon, string]> = {
    idle: [Copy, 'Copy as Markdown'],
    copying: [LoaderCircle, 'Copying…'],
    copied: [Check, 'Copied'],
    failed: [X, 'Could not copy'],
  }
  const [Icon, label] = states[state]
  return (
    <div
      className="mt-4 mb-8 flex items-center gap-3 border-b pb-6 text-sm text-muted-foreground"
      data-pagefind-ignore
    >
      <button
        type="button"
        onClick={copy}
        onPointerEnter={() => void load(url).catch(() => fetched.delete(url))}
        disabled={state === 'copying'}
        aria-live="polite"
        className="flex items-center gap-1.5 transition-colors hover:text-foreground"
      >
        <Icon className={state === 'copying' ? 'size-3.5 animate-spin' : 'size-3.5'} /> {label}
      </button>
      <span aria-hidden="true" className="h-3.5 border-l" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 transition-colors hover:text-foreground"
      >
        <FileText className="size-3.5" /> View as Markdown
      </a>
    </div>
  )
}
