import { Tabs } from '@base-ui/react/tabs'
import { Check, Copy } from 'lucide-react'
import {
  Children,
  Fragment,
  isValidElement,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'

import { cn } from '#/lib/utils.ts'

/** A button that copies `text()` and says so for a moment */
export function CopyButton({
  text,
  className,
  label = 'Copy',
}: {
  text: () => string
  className?: string
  label?: string
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      className={cn(
        'flex size-7 items-center justify-center rounded-md border bg-background text-muted-foreground transition hover:text-foreground',
        className,
      )}
    >
      {copied ? (
        <Check className="size-3.5 text-brand-foreground" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  )
}

/** A code block (Shiki's <pre>), with a copy button on hover */
export function Pre({ className, ...props }: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null)
  return (
    <div className="group/code relative my-4 [.code-tabs_&]:my-0">
      <pre ref={ref} className={className} {...props} />
      <CopyButton
        text={() => ref.current?.textContent ?? ''}
        label="Copy code"
        className="absolute top-2.5 right-2.5 opacity-0 group-hover/code:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
      />
    </div>
  )
}

// The tab chosen in each group (`group="pm"`: the package manager), the same in every block of the group (and the
// home page's command), kept for the next visit
const listeners = new Set<() => void>()
const KEY = 'code-tabs:'
export function useGroup(group: string | undefined) {
  const chosen = useSyncExternalStore(
    (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    () => {
      try {
        return group ? localStorage.getItem(KEY + group) : null
      } catch {
        return null
      }
    },
    () => null,
  )
  const choose = (value: string) => {
    try {
      if (group) localStorage.setItem(KEY + group, value)
    } catch {}
    listeners.forEach((listener) => listener())
  }
  return [chosen, choose] as const
}

/**
 * Code blocks as tabs, one per block, named by its title (```sh title="npm"). Blocks of the same `group` switch
 * together.
 */
export function CodeTabs({ group, children }: { group?: string; children: ReactNode }) {
  // each block: a <pre>, inside a fragment as Shiki's rehype plugin writes it
  const blocks = Children.toArray(children)
    .filter(isValidElement)
    .map((el) =>
      el.type === Fragment
        ? Children.toArray((el.props as { children: ReactNode }).children)[0]
        : el,
    )
    .filter(isValidElement) as Array<ReactElement<{ 'data-title'?: string }>>
  const titles = blocks.map((block, i) => block.props['data-title'] ?? `Tab ${i + 1}`)
  const [chosen, choose] = useGroup(group)
  const [own, setOwn] = useState(titles[0]!)
  const value = group ? (chosen && titles.includes(chosen) ? chosen : titles[0]!) : own
  return (
    <Tabs.Root
      value={value}
      onValueChange={(v: string) => (group ? choose(v) : setOwn(v))}
      className="code-tabs my-4 overflow-hidden rounded-xl border"
    >
      <Tabs.List className="flex gap-1 overflow-x-auto border-b px-2 py-1">
        {titles.map((title) => (
          <Tabs.Tab
            key={title}
            value={title}
            className="h-6 rounded-md px-2 font-mono text-[13px]/6 whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-active:bg-secondary data-active:text-secondary-foreground"
          >
            {title}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {blocks.map((block, i) => (
        <Tabs.Panel key={titles[i]} value={titles[i]} keepMounted className="data-hidden:hidden">
          {block}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  )
}
